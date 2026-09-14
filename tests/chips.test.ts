import { describe, expect, it } from 'vitest'
import {
  chipValue,
  cloneCircuit,
  compileChip,
  connectionError,
  evaluate,
  makeChipNode,
  makeNode,
  nodeHeight,
  parseChip,
  parseCircuit,
  pinPosition,
  signalKey,
} from '../src/core/circuit'
import { LEVELS, validateLevel } from '../src/core/levels'
import { exportProject, parseProject, parseStudioSave } from '../src/core/storage'
import { solution } from './solutions'

describe('portable combinational chips', () => {
  it('compiles the half-adder exhaustively, with independent sum and carry outputs', () => {
    const source = solution(6),
      original = cloneCircuit(source)
    const chip = compileChip(source, '半加器')
    expect(chip).toEqual({
      name: '半加器',
      inputs: ['A', 'B'],
      outputs: ['S', 'C'],
      table: [
        [0, 0],
        [1, 0],
        [1, 0],
        [0, 1],
      ],
    })
    expect(chipValue(chip, [1, 1])).toEqual([0, 1])
    expect(source).toEqual(original)
  })
  it('follows visible port positions consistently even when the source array is reversed', () => {
    const source = solution(6)
    source.nodes.reverse()
    source.nodes.find((n) => n.id === 'port-out-C')!.y = 0
    const chip = compileChip(source, '进位优先')
    expect(chip.outputs).toEqual(['C', 'S'])
    expect(chipValue(chip, [1, 1])).toEqual([1, 0])
  })
  it('assembles a full-adder from two half-adder chips for all eight input combinations', () => {
    const source = solution(7)
    const result = validateLevel(LEVELS[6], source)
    expect(result.passed).toBe(true)
    expect(result.cases.map((r) => r.actual)).toEqual([
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 1],
      [1, 0],
      [0, 1],
      [0, 1],
      [1, 1],
    ])
    const chip = compileChip(source, '全加器')
    expect(chipValue(chip, [1, 1, 1])).toEqual([1, 1])
    expect(chip.table).toHaveLength(8)
    expect(JSON.stringify(chip)).not.toContain('half-1')
  })
  it('does not accept swapped sum/carry wires as a correct full-adder', () => {
    const source = solution(7)
    source.wires.find((w) => w.to === 'port-out-S')!.fromPin = 1
    expect(validateLevel(LEVELS[6], source).passed).toBe(false)
  })
  it('propagates unknown inputs to every chip output after disconnection', () => {
    const source = solution(7)
    source.wires = source.wires.filter((w) => w.to !== 'half-1' || w.pin !== 1)
    const signals = evaluate(source)
    expect(signals.get('half-1')).toBeNull()
    expect(signals.get(signalKey('half-1', 1))).toBeNull()
    expect(signals.get('port-out-S')).toBeNull()
    expect(signals.get('port-out-Cout')).toBeNull()
  })
  it('protects chip instances and undo snapshots from library and sibling mutations', () => {
    const chip = compileChip(solution(6), '半加器')
    const first = makeChipNode(chip, 0, 0, 'first'),
      second = makeChipNode(chip, 0, 0, 'second')
    const snapshot = cloneCircuit({ nodes: [first], wires: [] })
    chip.table[0][0] = 1
    first.chip!.table[1][0] = 0
    expect(second.chip!.table[0]).toEqual([0, 0])
    expect(snapshot.nodes[0].chip!.table[1]).toEqual([1, 0])
  })
  it('round-trips a multi-chip project without any global library', () => {
    const project = { name: '模块化全加器', circuit: solution(7) }
    const decoded = parseProject(exportProject(project))
    expect(decoded).toEqual(project)
    expect(validateLevel(LEVELS[6], decoded.circuit).passed).toBe(true)
  })
  it('rejects incomplete, ambiguous, oversized or missing port definitions', () => {
    const source = solution(6)
    source.wires.pop()
    expect(() => compileChip(source, '坏芯片')).toThrow('未接通')
    expect(() => compileChip({ nodes: [], wires: [] }, '空芯片')).toThrow('1–4')
    const duplicate = solution(6)
    duplicate.nodes.find((n) => n.id === 'port-in-B')!.label = 'A'
    expect(() => compileChip(duplicate, '重复端口')).toThrow('不能重复')
    const oversized = solution(6)
    for (let i = 0; i < 3; i++) oversized.nodes.push(makeNode('INPUT', 0, i * 32, `extra-${i}`))
    expect(() => compileChip(oversized, '过大')).toThrow('1–4')
  })
  it('validates all truth table dimensions and values while stripping unknown data', () => {
    const chip = compileChip(solution(6), '半加器')
    for (const change of [
      { table: [] },
      {
        table: [
          [0, 0],
          [0, 1],
          [1, 0],
          [null, 1],
        ],
      },
      { outputs: [] },
      { inputs: ['A', 'A'] },
      { name: ' ' },
    ]) {
      expect(() => parseChip({ ...chip, ...change })).toThrow()
    }
    expect(parseChip({ ...chip, script: '<script>anything</script>' })).toEqual(chip)
    expect(() =>
      parseCircuit({ nodes: [{ ...makeNode('AND', 0, 0, 'bad'), kind: 'CHIP' }], wires: [] }),
    ).toThrow('芯片名称')
  })
  it('rejects nonexistent output pins, duplicate drivers and cycles through chips', () => {
    const source = solution(7)
    const wire = { id: 'new-wire', from: 'half-1', to: 'half-2', pin: 0, fromPin: 2 }
    expect(connectionError(source, wire)).toContain('输出引脚')
    expect(connectionError(source, { ...wire, fromPin: -1 })).toContain('输出引脚')
    expect(connectionError(source, { ...wire, fromPin: 0.5 })).toContain('输出引脚')
    expect(connectionError(source, { ...wire, fromPin: 1 })).toContain('已有导线')
    source.wires = source.wires.filter((w) => w.to !== 'half-1' || w.pin !== 0)
    expect(
      connectionError(source, { id: 'feedback', from: 'half-2', fromPin: 1, to: 'half-1', pin: 0 }),
    ).toContain('循环')
  })
  it('does not allow custom chips to bypass earlier logic lessons', () => {
    const source = solution(5)
    source.nodes.push(makeChipNode(compileChip(solution(6), '半加器'), 0, 0, 'hidden-chip'))
    expect(validateLevel(LEVELS[4], source).error).toContain('不能使用')
  })
  it('supports four inputs and outputs with separate visible pins and a 16-row table', () => {
    const inputs = ['A', 'B', 'C', 'D'].map((label, i) => ({
      ...makeNode('INPUT', 0, i * 64, `in-${i}`),
      label,
    }))
    const outputs = ['W', 'X', 'Y', 'Z'].map((label, i) => ({
      ...makeNode('OUTPUT', 400, i * 64, `out-${i}`),
      label,
    }))
    const chip = compileChip(
      {
        nodes: [...inputs, ...outputs],
        wires: inputs.map((n, i) => ({ id: `wire-${i}`, from: n.id, to: outputs[i].id, pin: 0 })),
      },
      '四路总开关',
    )
    expect(chip.table).toHaveLength(16)
    expect(chipValue(chip, [1, 0, 1, 0])).toEqual([1, 0, 1, 0])
    const node = makeChipNode(chip, 0, 0, 'four')
    expect(pinPosition(node, 3, true).y).toBeLessThan(nodeHeight(node) - 20)
    expect(pinPosition(node, 2).y).not.toBe(pinPosition(node, 3).y)
  })
  it('migrates old saves and exports without losing drafts, completed levels or works', () => {
    const old = {
      version: 1,
      activeLevel: 6,
      sandbox: { name: '旧沙盒', circuit: solution(1) },
      drafts: { '6': solution(6) },
      completed: [1, 2, 3, 4, 5, 6],
      works: [{ id: 'old-work', name: '旧作品', savedAt: '2026-09-14T12:00:00Z', circuit: solution(6) }],
      motion: false,
    }
    const restored = parseStudioSave(JSON.stringify(old))
    expect(restored).toEqual({ ...old, version: 2, chips: [] })
    const oldFile = JSON.stringify({ format: 'bitcraft-circuit', version: 1, ...old.sandbox })
    expect(parseProject(oldFile)).toEqual(old.sandbox)
    const newState = { ...restored, chips: [{ id: 'half', ...compileChip(solution(6), '半加器') }] }
    expect(parseStudioSave(JSON.stringify(newState))).toEqual(newState)
    expect(() =>
      parseStudioSave(JSON.stringify({ ...newState, chips: [newState.chips[0], newState.chips[0]] })),
    ).toThrow('重复')
  })
})
