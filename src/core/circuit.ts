export const KINDS = ['INPUT', 'OUTPUT', 'NOT', 'AND', 'OR', 'XOR', 'CHIP'] as const
export type Kind = (typeof KINDS)[number]
export type Bit = 0 | 1
export type Signal = Bit | null

/** A compiled combinational chip. Rows use binary input order, most significant input first. */
export interface Chip {
  name: string
  inputs: string[]
  outputs: string[]
  table: Bit[][]
}

export interface CircuitNode {
  id: string
  kind: Kind
  label: string
  x: number
  y: number
  value: Bit
  chip?: Chip
}
export interface Wire {
  id: string
  from: string
  to: string
  pin: number
  fromPin?: number
}
export interface Circuit {
  nodes: CircuitNode[]
  wires: Wire[]
}
export const MAX_NODES = 128
export const MAX_WIRES = 256
export const MAX_COORD = 8000
export const NODE_WIDTH = 144
export const NODE_HEIGHT = 96
export const GRID = 16

export const PARTS: Record<
  Kind,
  { name: string; english: string; description: string; inputs: number; category: string }
> = {
  INPUT: {
    name: '输入开关',
    english: 'SWITCH',
    description: '轻轻一按，在 0 和 1 之间切换。',
    inputs: 0,
    category: '输入 / 输出',
  },
  OUTPUT: {
    name: '输出灯',
    english: 'LIGHT',
    description: '接收到 1 时点亮，看看你的电路是否工作。',
    inputs: 1,
    category: '输入 / 输出',
  },
  NOT: {
    name: '非门',
    english: 'NOT',
    description: '让信号反过来：0 变成 1，1 变成 0。',
    inputs: 1,
    category: '逻辑门',
  },
  AND: {
    name: '与门',
    english: 'AND',
    description: '两个输入都是 1，才会输出 1。',
    inputs: 2,
    category: '逻辑门',
  },
  OR: {
    name: '或门',
    english: 'OR',
    description: '只要有一个输入是 1，就输出 1。',
    inputs: 2,
    category: '逻辑门',
  },
  XOR: {
    name: '异或门',
    english: 'XOR',
    description: '两个输入不同时输出 1，相同时输出 0。',
    inputs: 2,
    category: '逻辑门',
  },
  CHIP: {
    name: '自制芯片',
    english: 'CHIP',
    description: '把电路的功能装进一块芯片，像积木一样反复使用。',
    inputs: 0,
    category: '我的芯片',
  },
}

export function cloneChip(chip: Chip): Chip {
  return {
    name: chip.name,
    inputs: [...chip.inputs],
    outputs: [...chip.outputs],
    table: chip.table.map((row) => [...row]),
  }
}
export function cloneCircuit(circuit: Circuit): Circuit {
  return {
    nodes: circuit.nodes.map((n) => ({ ...n, ...(n.chip ? { chip: cloneChip(n.chip) } : {}) })),
    wires: circuit.wires.map((w) => ({ ...w })),
  }
}

export function makeNode(kind: Kind, x: number, y: number, id: string = crypto.randomUUID()): CircuitNode {
  if (kind === 'CHIP') throw new Error('请从芯片库选择一块芯片。')
  return { id, kind, label: PARTS[kind].name, x: snap(x), y: snap(y), value: 0 }
}

export function makeChipNode(
  chip: Chip,
  x: number,
  y: number,
  id: string = crypto.randomUUID(),
): CircuitNode {
  const copy = parseChip(chip)
  return { id, kind: 'CHIP', label: copy.name, x: snap(x), y: snap(y), value: 0, chip: copy }
}

export const inputCount = (node: CircuitNode) =>
  node.kind === 'CHIP' ? node.chip!.inputs.length : PARTS[node.kind].inputs
export const outputCount = (node: CircuitNode) =>
  node.kind === 'CHIP' ? node.chip!.outputs.length : node.kind === 'OUTPUT' ? 0 : 1
export const nodeHeight = (node: CircuitNode) =>
  node.kind === 'CHIP' ? 64 + Math.max(inputCount(node), outputCount(node)) * 28 : NODE_HEIGHT
export const signalKey = (id: string, pin = 0) => (pin === 0 ? id : `${id}:${pin}`)

export function chipValue(chip: Chip, inputs: Signal[]): Signal[] {
  if (inputs.length !== chip.inputs.length || inputs.some((v) => v === null))
    return chip.outputs.map(() => null)
  const index = inputs.reduce<number>((value, bit) => value * 2 + bit!, 0)
  return [...chip.table[index]]
}

export function snap(value: number): number {
  return Math.max(-MAX_COORD, Math.min(MAX_COORD, Math.round(value / GRID) * GRID))
}

export function pinPosition(node: CircuitNode, pin: number, output = false) {
  return {
    x: node.x + (output ? NODE_WIDTH : 0),
    y:
      node.y +
      (node.kind === 'CHIP' ? 48 + pin * 28 : output || inputCount(node) === 1 ? 48 : pin === 0 ? 32 : 64),
  }
}

export function gateValue(kind: Kind, inputs: Signal[], value: Bit = 0): Signal {
  if (kind === 'CHIP') return null
  if (kind === 'INPUT') return value
  if (inputs.length !== PARTS[kind].inputs || inputs.some((v) => v === null)) return null
  const a = inputs[0]
  const b = inputs[1]
  switch (kind) {
    case 'OUTPUT':
      return a
    case 'NOT':
      return a === 0 ? 1 : 0
    case 'AND':
      return a === 1 && b === 1 ? 1 : 0
    case 'OR':
      return a === 1 || b === 1 ? 1 : 0
    case 'XOR':
      return a !== b ? 1 : 0
  }
}

function topologicalOrder(circuit: Circuit): string[] {
  const indegree = new Map(circuit.nodes.map((n) => [n.id, 0]))
  const outgoing = new Map<string, string[]>()
  for (const wire of circuit.wires) {
    indegree.set(wire.to, (indegree.get(wire.to) ?? 0) + 1)
    const next = outgoing.get(wire.from) ?? []
    next.push(wire.to)
    outgoing.set(wire.from, next)
  }
  const queue = circuit.nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id)
  for (let i = 0; i < queue.length; i++) {
    for (const id of outgoing.get(queue[i]) ?? []) {
      const count = indegree.get(id)! - 1
      indegree.set(id, count)
      if (count === 0) queue.push(id)
    }
  }
  if (queue.length !== circuit.nodes.length) throw new Error('这条连接会形成循环。请让信号从输入流向输出。')
  return queue
}

export function evaluate(
  circuit: Circuit,
  overrides: ReadonlyMap<string, Bit> = new Map(),
): Map<string, Signal> {
  const signals = new Map<string, Signal>()
  const nodes = new Map(circuit.nodes.map((n) => [n.id, n]))
  const incoming = new Map<string, Wire>()
  for (const wire of circuit.wires) incoming.set(`${wire.to}:${wire.pin}`, wire)
  for (const id of topologicalOrder(circuit)) {
    const node = nodes.get(id)!
    const inputs = Array.from({ length: inputCount(node) }, (_, pin) => {
      const wire = incoming.get(`${id}:${pin}`)
      return wire ? (signals.get(signalKey(wire.from, wire.fromPin)) ?? null) : null
    })
    if (node.kind === 'CHIP')
      chipValue(node.chip!, inputs).forEach((value, pin) => signals.set(signalKey(id, pin), value))
    else signals.set(id, gateValue(node.kind, inputs, overrides.get(id) ?? node.value))
  }
  return signals
}

export function connectionError(circuit: Circuit, wire: Wire): string | null {
  if (circuit.wires.length >= MAX_WIRES) return `工作台最多支持 ${MAX_WIRES} 条导线。`
  if (circuit.wires.some((w) => w.id === wire.id)) return '导线编号重复。'
  const from = circuit.nodes.find((n) => n.id === wire.from)
  const to = circuit.nodes.find((n) => n.id === wire.to)
  if (!from || !to) return '连接的元件不存在。'
  if (from.kind === 'OUTPUT' || to.kind === 'INPUT') return '请将输出引脚连接到输入引脚。'
  const fromPin = wire.fromPin ?? 0
  if (!Number.isInteger(fromPin) || fromPin < 0 || fromPin >= outputCount(from)) return '这个输出引脚不存在。'
  if (!Number.isInteger(wire.pin) || wire.pin < 0 || wire.pin >= inputCount(to)) return '这个输入引脚不存在。'
  if (circuit.wires.some((w) => w.to === wire.to && w.pin === wire.pin))
    return '这个输入已有导线，请先断开原来的连接。'
  try {
    topologicalOrder({ nodes: circuit.nodes, wires: [...circuit.wires, wire] })
  } catch (error) {
    return (error as Error).message
  }
  return null
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id)

export function parseChip(value: unknown): Chip {
  if (!object(value) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 32)
    throw new Error('芯片名称需要 1–32 个字符。')
  const ports = (list: unknown): string[] => {
    if (
      !Array.isArray(list) ||
      list.length < 1 ||
      list.length > 4 ||
      list.some((label) => typeof label !== 'string' || !label.trim() || label.length > 32)
    )
      throw new Error('芯片需要 1–4 个输入和 1–4 个输出，端口名称最多 32 个字符。')
    const labels = list.map((label: string) => label.trim())
    if (new Set(labels).size !== labels.length) throw new Error('同侧的芯片端口名称不能重复。')
    return labels
  }
  const inputs = ports(value.inputs),
    outputs = ports(value.outputs)
  if (
    !Array.isArray(value.table) ||
    value.table.length !== 2 ** inputs.length ||
    value.table.some(
      (row) =>
        !Array.isArray(row) || row.length !== outputs.length || row.some((bit) => bit !== 0 && bit !== 1),
    )
  )
    throw new Error('芯片真值表不完整或包含无效信号。')
  return { name: value.name.trim(), inputs, outputs, table: value.table.map((row) => [...row]) }
}

/** Spatial port order is shown in the packaging preview; never silently guess an incomplete output. */
export function circuitPorts(circuit: Circuit, kind: 'INPUT' | 'OUTPUT') {
  return circuit.nodes
    .filter((node) => node.kind === kind)
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
}
export function compileChip(circuit: Circuit, name: string): Chip {
  const safe = parseCircuit(circuit)
  const inputs = circuitPorts(safe, 'INPUT'),
    outputs = circuitPorts(safe, 'OUTPUT')
  if (!inputs.length || inputs.length > 4 || !outputs.length || outputs.length > 4)
    throw new Error('封装需要 1–4 个输入开关和 1–4 个输出灯。')
  const table = Array.from({ length: 2 ** inputs.length }, (_, row) => {
    const values = evaluate(
      safe,
      new Map(inputs.map((node, i) => [node.id, ((row >> (inputs.length - 1 - i)) & 1) as Bit])),
    )
    return outputs.map((node) => {
      const value = values.get(node.id)
      if (value == null) throw new Error(`输出「${node.label}」尚未接通，请连接好必要引脚后再封装。`)
      return value
    })
  })
  return parseChip({ name, inputs: inputs.map((n) => n.label), outputs: outputs.map((n) => n.label), table })
}

/** Rebuild known fields only. Imported files never become executable code or UI markup. */
export function parseCircuit(value: unknown): Circuit {
  if (!object(value) || !Array.isArray(value.nodes) || !Array.isArray(value.wires))
    throw new Error('作品缺少元件或导线列表。')
  if (value.nodes.length > MAX_NODES || value.wires.length > MAX_WIRES)
    throw new Error(`作品超过上限：${MAX_NODES} 个元件、${MAX_WIRES} 条导线。`)
  const ids = new Set<string>()
  const nodes = value.nodes.map((node): CircuitNode => {
    if (!object(node) || !validId(node.id) || ids.has(node.id)) throw new Error('元件编号无效或重复。')
    if (!KINDS.includes(node.kind as Kind)) throw new Error('作品包含不支持的元件。')
    if (typeof node.label !== 'string' || node.label.length > 32) throw new Error('元件名称最多 32 个字符。')
    if (
      typeof node.x !== 'number' ||
      typeof node.y !== 'number' ||
      !Number.isFinite(node.x) ||
      !Number.isFinite(node.y) ||
      Math.abs(node.x) > MAX_COORD ||
      Math.abs(node.y) > MAX_COORD
    )
      throw new Error('元件位置超出画布范围。')
    if (node.value !== 0 && node.value !== 1) throw new Error('输入信号必须是 0 或 1。')
    ids.add(node.id)
    return {
      id: node.id,
      kind: node.kind as Kind,
      label: node.label,
      x: node.x,
      y: node.y,
      value: node.value,
      ...(node.kind === 'CHIP' ? { chip: parseChip(node.chip) } : {}),
    }
  })
  const result: Circuit = { nodes, wires: [] }
  for (const valueWire of value.wires) {
    if (
      !object(valueWire) ||
      !validId(valueWire.id) ||
      !validId(valueWire.from) ||
      !validId(valueWire.to) ||
      typeof valueWire.pin !== 'number'
    )
      throw new Error('导线格式无效。')
    if (valueWire.fromPin !== undefined && typeof valueWire.fromPin !== 'number')
      throw new Error('输出引脚格式无效。')
    const wire: Wire = {
      id: valueWire.id,
      from: valueWire.from,
      to: valueWire.to,
      pin: valueWire.pin,
      ...(valueWire.fromPin !== undefined ? { fromPin: valueWire.fromPin } : {}),
    }
    const error = connectionError(result, wire)
    if (error) throw new Error(error)
    result.wires.push(wire)
  }
  return result
}

export function starterCircuit(): Circuit {
  const a = { ...makeNode('INPUT', 96, 128, 'demo-a'), label: '开关 A', value: 1 as Bit }
  const b = { ...makeNode('INPUT', 96, 320, 'demo-b'), label: '开关 B', value: 1 as Bit }
  const and = makeNode('AND', 384, 224, 'demo-and')
  const lamp = { ...makeNode('OUTPUT', 672, 224, 'demo-light'), label: '工坊指示灯' }
  return {
    nodes: [a, b, and, lamp],
    wires: [
      { id: 'demo-w1', from: a.id, to: and.id, pin: 0 },
      { id: 'demo-w2', from: b.id, to: and.id, pin: 1 },
      { id: 'demo-w3', from: and.id, to: lamp.id, pin: 0 },
    ],
  }
}
