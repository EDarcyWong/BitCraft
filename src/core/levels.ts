import { evaluate, makeNode, PARTS, type Bit, type Circuit, type Kind, type Signal } from './circuit'

export interface Level {
  id: number
  title: string
  concept: string
  description: string
  brief: string
  allowed: Kind[]
  inputs: string[]
  outputs: string[]
  hints: string[]
  goal: (inputs: Bit[]) => Bit[]
}
export const LEVELS: Level[] = [
  {
    id: 1,
    title: '点亮工坊',
    concept: '信号与连接',
    description: '工坊开张了！用一个开关控制门口的灯，让你的第一个信号顺利抵达。',
    brief: '开关打开，灯亮；开关关闭，灯灭。',
    allowed: [],
    inputs: ['A'],
    outputs: ['Y'],
    hints: [
      '信号从元件右侧的输出流向左侧的输入。',
      '先点击开关右边的圆点，再点击灯左边的圆点。',
      '不需要额外的元件，一条导线就能完成。',
    ],
    goal: ([a]) => [a],
  },
  {
    id: 2,
    title: '反向指示灯',
    concept: 'NOT · 非门',
    description: '给工坊装一盏休息指示灯。机器开关关掉时，它才应该亮起来。',
    brief: 'A 为 0 时，Y 为 1；A 为 1 时，Y 为 0。',
    allowed: ['NOT'],
    inputs: ['A'],
    outputs: ['Y'],
    hints: [
      '你需要一个能够反转信号的元件。',
      '非门会把 0 变成 1，把 1 变成 0。',
      '把开关连接到非门，再把非门连接到灯。',
    ],
    goal: ([a]) => [a === 0 ? 1 : 0],
  },
  {
    id: 3,
    title: '双重许可',
    concept: 'AND · 与门',
    description: '安全门需要两名工程师同时同意。只有两个开关都打开，门口的灯才亮。',
    brief: 'A 和 B 都为 1 时，Y 才为 1。',
    allowed: ['NOT', 'AND'],
    inputs: ['A', 'B'],
    outputs: ['Y'],
    hints: [
      '试试哪个逻辑门表示“同时满足”。',
      '与门需要两个输入，并且两个都是 1。',
      '将 A、B 连接到与门的两个输入，再把输出接到灯。',
    ],
    goal: ([a, b]) => [a === 1 && b === 1 ? 1 : 0],
  },
  {
    id: 4,
    title: '任意呼叫',
    concept: 'OR · 或门',
    description: '工作台两侧都装了呼叫按钮，任意一侧发出请求，提示灯都要亮起。',
    brief: 'A 或 B 中至少一个为 1，Y 就为 1。',
    allowed: ['NOT', 'AND', 'OR'],
    inputs: ['A', 'B'],
    outputs: ['Y'],
    hints: [
      '“任意一个满足”是这道题的关键。',
      '或门在至少一个输入为 1 时输出 1。',
      '把 A 和 B 接入同一个或门，再连接提示灯。',
    ],
    goal: ([a, b]) => [a === 1 || b === 1 ? 1 : 0],
  },
  {
    id: 5,
    title: '状态不同',
    concept: '组合逻辑',
    description: '两条生产线的状态不一致时，检查灯需要提醒你。用已学会的逻辑门组合出新能力。',
    brief: 'A 和 B 不同时，Y 为 1；相同时为 0。',
    allowed: ['NOT', 'AND', 'OR'],
    inputs: ['A', 'B'],
    outputs: ['Y'],
    hints: [
      '灯只在 (A=1, B=0) 或 (A=0, B=1) 时亮。',
      '分别用非门和与门表示这两种情况。',
      '连接 (A AND NOT B) OR (NOT A AND B)。输出可以接到多个元件。',
    ],
    goal: ([a, b]) => [a !== b ? 1 : 0],
  },
  {
    id: 6,
    title: '第一台加法器',
    concept: 'XOR · 半加器',
    description: '把两个二进制数相加，用两盏灯分别显示和与进位。你已经迈出了制造计算机的第一步。',
    brief: 'S 表示和，C 表示进位。1 + 1 = 二进制 10。',
    allowed: ['NOT', 'AND', 'OR', 'XOR'],
    inputs: ['A', 'B'],
    outputs: ['S', 'C'],
    hints: [
      '先分别思考 S 和 C 什么情况下应该亮。',
      'A、B 不同时 S 亮；A、B 都为 1 时 C 亮。',
      '用异或门输出 S，用与门输出 C。两个开关都要分别连接这两个门。',
    ],
    goal: ([a, b]) => [a !== b ? 1 : 0, a === 1 && b === 1 ? 1 : 0],
  },
  {
    id: 7,
    title: '把进位接下去',
    concept: '全加器 · 芯片复用',
    description:
      '工坊升级了：把上一级的进位 Cin 也算进来。可以回到第 6 关封装半加器，再放入两块半加器完成组装。',
    brief: '计算 A + B + Cin，用 S 和 Cout 表示结果。',
    allowed: ['NOT', 'AND', 'OR', 'XOR', 'CHIP'],
    inputs: ['A', 'B', 'Cin'],
    outputs: ['S', 'Cout'],
    hints: [
      '先把 A、B 相加，再把这个和与 Cin 相加。',
      '两块半加器各自产生一个进位，只要其中一个为 1，Cout 就为 1。',
      '第一块半加器输入 A、B；第二块输入第一块的 S 和 Cin。第二块的 S 连接结果，两块 C 用或门合并。',
    ],
    goal: ([a, b, cin]) => [((a + b + cin) % 2) as Bit, a + b + cin >= 2 ? 1 : 0],
  },
  {
    id: 8,
    title: '信号分岔口',
    concept: 'MUX · 数据选择',
    description: '给下一台计算机装一个信号调度器。用选择开关 Sel，决定把 A 还是 B 送到输出。',
    brief: 'Sel 为 0 时 Y = A；Sel 为 1 时 Y = B。',
    allowed: ['NOT', 'AND', 'OR', 'XOR', 'CHIP'],
    inputs: ['A', 'B', 'Sel'],
    outputs: ['Y'],
    hints: [
      '把问题拆成两条支路：允许 A 通过，或者允许 B 通过。',
      'A 支路需要 NOT Sel；B 支路需要 Sel。',
      '连接 (A AND NOT Sel) OR (B AND Sel)。完成后可以封装成自己的 MUX 芯片。',
    ],
    goal: ([a, b, sel]) => [sel === 0 ? a : b],
  },
]

export const inputId = (name: string) => `port-in-${name}`
export const outputId = (name: string) => `port-out-${name}`
export function isFixedPort(level: Level | undefined, id: string): boolean {
  return Boolean(level && [...level.inputs.map(inputId), ...level.outputs.map(outputId)].includes(id))
}

export function createLevelCircuit(level: Level): Circuit {
  const nodes = [
    ...level.inputs.map((label, i) => ({
      ...makeNode('INPUT', 96, level.inputs.length === 1 ? 224 : 128 + i * 192, inputId(label)),
      label,
    })),
    ...level.outputs.map((label, i) => ({
      ...makeNode('OUTPUT', 672, level.outputs.length === 1 ? 224 : 128 + i * 192, outputId(label)),
      label,
    })),
  ]
  return { nodes, wires: [] }
}

export interface TestCase {
  inputs: Bit[]
  expected: Bit[]
  actual: Signal[]
  pass: boolean
}
export interface LevelResult {
  passed: boolean
  error: string | null
  cases: TestCase[]
}
export function expectedCases(level: Level): TestCase[] {
  return Array.from({ length: 2 ** level.inputs.length }, (_, i) => {
    const inputs = level.inputs.map((_, bit) => ((i >> (level.inputs.length - 1 - bit)) & 1) as Bit)
    return { inputs, expected: level.goal(inputs), actual: [], pass: false }
  })
}

export function levelCircuitError(level: Level, circuit: Circuit): string | null {
  for (const [kind, labels, idFor] of [
    ['INPUT', level.inputs, inputId],
    ['OUTPUT', level.outputs, outputId],
  ] as const) {
    const ports = circuit.nodes.filter((n) => n.kind === kind)
    if (ports.length !== labels.length || labels.some((label) => !ports.some((n) => n.id === idFor(label))))
      return '关卡的固定输入或输出发生了变化，请重置本关。'
  }
  const forbidden = circuit.nodes.find(
    (n) => n.kind !== 'INPUT' && n.kind !== 'OUTPUT' && !level.allowed.includes(n.kind),
  )
  if (forbidden) return `本关还不能使用${PARTS[forbidden.kind].name}，试试已解锁的元件。`
  return null
}

export function validateLevel(level: Level, circuit: Circuit): LevelResult {
  const error = levelCircuitError(level, circuit)
  if (error) return { passed: false, error, cases: [] }
  try {
    const cases = expectedCases(level).map((row) => {
      const signals = evaluate(
        circuit,
        new Map(level.inputs.map((label, i) => [inputId(label), row.inputs[i]])),
      )
      const actual = level.outputs.map((label) => signals.get(outputId(label)) ?? null)
      return { ...row, actual, pass: actual.every((value, i) => value === row.expected[i]) }
    })
    return {
      passed: cases.every((row) => row.pass),
      error: cases.some((row) => row.actual.includes(null))
        ? '还有输出未接通。沿着导线检查每个必要的输入引脚。'
        : null,
      cases,
    }
  } catch (error) {
    return { passed: false, error: (error as Error).message, cases: [] }
  }
}
