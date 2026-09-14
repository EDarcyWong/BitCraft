import { describe, expect, it } from 'vitest'
import { cloneCircuit, makeNode } from '../src/core/circuit'
import { createLevelCircuit, expectedCases, LEVELS, validateLevel } from '../src/core/levels'
import { solution } from './solutions'

describe('the eight playable challenges', () => {
  it.each(LEVELS)('accepts a working solution for $id · $title', (level) => {
    const circuit = solution(level.id),
      before = cloneCircuit(circuit)
    const result = validateLevel(level, circuit)
    expect(result.passed).toBe(true)
    expect(result.cases).toHaveLength(2 ** level.inputs.length)
    expect(circuit).toEqual(before)
  })
  it.each(LEVELS)('does not accept the disconnected starting circuit for $id', (level) => {
    const result = validateLevel(level, createLevelCircuit(level))
    expect(result.passed).toBe(false)
    expect(result.error).toContain('未接通')
  })
  it('checks every input, not only the currently correct switch state', () => {
    const circuit = solution(3)
    circuit.nodes.find((n) => n.id === 'combine')!.kind = 'NOT'
    circuit.wires = circuit.wires.filter((w) => w.pin !== 1)
    const result = validateLevel(LEVELS[2], circuit)
    expect(result.passed).toBe(false)
    expect(result.cases.some((row) => !row.pass && row.actual[0] !== null)).toBe(true)
  })
  it('accepts a structurally different but correct circuit', () => {
    const circuit = solution(1)
    circuit.nodes.push(makeNode('NOT', 300, 0, 'not1'), makeNode('NOT', 400, 0, 'not2'))
    circuit.wires = [
      { id: 'w1', from: 'port-in-A', to: 'not1', pin: 0 },
      { id: 'w2', from: 'not1', to: 'not2', pin: 0 },
      { id: 'w3', from: 'not2', to: 'port-out-Y', pin: 0 },
    ]
    expect(validateLevel({ ...LEVELS[0], allowed: ['NOT'] }, circuit).passed).toBe(true)
  })
  it('rejects an unavailable XOR gate in the combination challenge', () => {
    const circuit = createLevelCircuit(LEVELS[4])
    circuit.nodes.push(makeNode('XOR', 300, 200, 'xor'))
    circuit.wires = [
      { id: 'a', from: 'port-in-A', to: 'xor', pin: 0 },
      { id: 'b', from: 'port-in-B', to: 'xor', pin: 1 },
      { id: 'c', from: 'xor', to: 'port-out-Y', pin: 0 },
    ]
    expect(validateLevel(LEVELS[4], circuit).error).toContain('不能使用')
  })
  it('cannot bypass a challenge by removing, renaming the ID, or adding fixed ports', () => {
    for (const change of ['remove', 'rename', 'extra']) {
      const circuit = solution(1)
      if (change === 'remove') circuit.nodes.pop()
      else if (change === 'rename') circuit.nodes[0].id = 'other'
      else circuit.nodes.push(makeNode('INPUT', 0, 0, 'extra'))
      expect(validateLevel(LEVELS[0], circuit).passed).toBe(false)
    }
  })
  it('the half-adder expects sum zero and carry one for 1 + 1', () => {
    expect(expectedCases(LEVELS[5])[3].expected).toEqual([0, 1])
  })
})
