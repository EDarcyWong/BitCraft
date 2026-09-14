import { parseChip, parseCircuit, type Chip, type Circuit } from './circuit'
import { LEVELS, levelCircuitError } from './levels'

export const MAX_FILE_BYTES = 1024 * 1024
export const STORAGE_KEY = 'bitcraft:studio:v1'
export interface Project {
  name: string
  circuit: Circuit
}
export interface SavedWork extends Project {
  id: string
  savedAt: string
}
export interface StudioSave {
  version: 2
  activeLevel: number | null
  sandbox: Project
  drafts: Record<string, Circuit>
  completed: number[]
  works: SavedWork[]
  chips: SavedChip[]
  motion: boolean
}
export interface SavedChip extends Chip {
  id: string
}
export const MAX_CHIPS = 24
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function projectName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 48)
    throw new Error('作品名称需要 1–48 个字符。')
  return value.trim()
}

export function parseProject(text: string): Project {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error('作品文件不能超过 1 MB。')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('这不是有效的 JSON 作品文件。')
  }
  if (!record(value) || value.format !== 'bitcraft-circuit' || (value.version !== 1 && value.version !== 2))
    throw new Error('不支持这个作品格式，请导入比特工坊导出的 v1 或 v2 文件。')
  return { name: projectName(value.name), circuit: parseCircuit(value.circuit) }
}
export function exportProject(project: Project): string {
  return JSON.stringify(
    { format: 'bitcraft-circuit', version: 2, name: project.name, circuit: project.circuit },
    null,
    2,
  )
}

export function parseStudioSave(text: string): StudioSave {
  if (text.length > 8 * MAX_FILE_BYTES) throw new Error('本地存档太大，无法加载。')
  const value: unknown = JSON.parse(text)
  if (
    !record(value) ||
    (value.version !== 1 && value.version !== 2) ||
    !record(value.sandbox) ||
    !record(value.drafts) ||
    !Array.isArray(value.works) ||
    !Array.isArray(value.completed)
  )
    throw new Error('本地存档格式不正确。')
  const drafts: Record<string, Circuit> = {}
  for (const [id, saved] of Object.entries(value.drafts)) {
    const level = LEVELS.find((l) => String(l.id) === id)
    if (!level) throw new Error('存档中包含未知关卡。')
    const circuit = parseCircuit(saved)
    const error = levelCircuitError(level, circuit)
    if (error) throw new Error(error)
    drafts[id] = circuit
  }
  if (value.works.length > 12) throw new Error('作品库最多保存 12 个作品。')
  const workIds = new Set<string>()
  const works = value.works.map((work): SavedWork => {
    if (
      !record(work) ||
      typeof work.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(work.id) ||
      workIds.has(work.id) ||
      typeof work.savedAt !== 'string' ||
      !Number.isFinite(Date.parse(work.savedAt))
    )
      throw new Error('作品库信息无效。')
    workIds.add(work.id)
    return {
      id: work.id,
      name: projectName(work.name),
      circuit: parseCircuit(work.circuit),
      savedAt: work.savedAt,
    }
  })
  if (value.activeLevel !== null && !LEVELS.some((l) => l.id === value.activeLevel))
    throw new Error('当前关卡不存在。')
  if (value.completed.some((id) => !LEVELS.some((l) => l.id === id))) throw new Error('关卡进度无效。')
  const chipIds = new Set<string>()
  const library = value.version === 1 ? [] : value.chips
  if (!Array.isArray(library) || library.length > MAX_CHIPS)
    throw new Error('芯片库格式无效或超过 24 个芯片。')
  const chips = library.map((chip): SavedChip => {
    if (
      !record(chip) ||
      typeof chip.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(chip.id) ||
      chipIds.has(chip.id)
    )
      throw new Error('芯片编号无效或重复。')
    chipIds.add(chip.id)
    return { id: chip.id, ...parseChip(chip) }
  })
  return {
    version: 2,
    activeLevel: value.activeLevel as number | null,
    sandbox: { name: projectName(value.sandbox.name), circuit: parseCircuit(value.sandbox.circuit) },
    drafts,
    completed: [...new Set(value.completed as number[])],
    works,
    chips,
    motion: value.motion !== false,
  }
}
