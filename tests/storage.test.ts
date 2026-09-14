import { describe, expect, it } from 'vitest'
import { starterCircuit } from '../src/core/circuit'
import {
  exportProject,
  MAX_FILE_BYTES,
  parseProject,
  parseStudioSave,
  type StudioSave,
} from '../src/core/storage'
import { solution } from './solutions'

const state = (): StudioSave => ({
  version: 2,
  activeLevel: 5,
  sandbox: { name: '小小工坊', circuit: starterCircuit() },
  drafts: { '5': solution(5) },
  completed: [1, 2],
  works: [{ id: 'saved-1', name: '我的作品', circuit: solution(6), savedAt: '2026-09-14T12:00:00Z' }],
  motion: false,
  chips: [],
})
describe('portable files and local saves', () => {
  it('round-trips all nodes, wires, labels and positions', () => {
    const project = { name: '你好 · 电路', circuit: solution(6) }
    expect(parseProject(exportProject(project))).toEqual(project)
  })
  it('rejects malformed, unknown-version and oversized files', () => {
    expect(() => parseProject('not json')).toThrow('有效的 JSON')
    expect(() => parseProject('{"format":"bitcraft-circuit","version":999}')).toThrow('格式')
    expect(() => parseProject(' '.repeat(MAX_FILE_BYTES + 1))).toThrow('1 MB')
    expect(() => parseProject(exportProject({ name: '', circuit: starterCircuit() }))).toThrow('名称')
  })
  it('rejects bad circuits before returning a project', () => {
    const original = { name: '保留我', circuit: starterCircuit() }
    const bad = JSON.parse(exportProject(original))
    bad.circuit.wires[0].from = 'missing'
    expect(() => parseProject(JSON.stringify(bad))).toThrow('不存在')
    expect(original.circuit.wires[0].from).toBe('demo-a')
  })
  it('round-trips active level, drafts, progress, saved works and motion preference', () => {
    expect(parseStudioSave(JSON.stringify(state()))).toEqual(state())
  })
  it('rejects unknown levels, tampered ports and duplicate work IDs', () => {
    const badLevel = state()
    badLevel.activeLevel = 99
    expect(() => parseStudioSave(JSON.stringify(badLevel))).toThrow('关卡')
    const badDraft = state()
    badDraft.drafts['5'].nodes.shift()
    expect(() => parseStudioSave(JSON.stringify(badDraft))).toThrow()
    const duplicate = state()
    duplicate.works.push(duplicate.works[0])
    expect(() => parseStudioSave(JSON.stringify(duplicate))).toThrow('作品库')
    const overLimit = state()
    overLimit.works = Array(13).fill(overLimit.works[0])
    expect(() => parseStudioSave(JSON.stringify(overLimit))).toThrow('12')
  })
  it('rejects prototype keys used as unknown draft IDs', () => {
    const data = JSON.stringify(state()).replace('"drafts":{', '"drafts":{"__proto__":{},')
    expect(() => parseStudioSave(data)).toThrow('未知关卡')
  })
})
