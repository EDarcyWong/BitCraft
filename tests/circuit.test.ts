import { describe, expect, it } from 'vitest'
import {
  cloneCircuit,
  connectionError,
  evaluate,
  gateValue,
  makeNode,
  MAX_NODES,
  MAX_WIRES,
  parseCircuit,
  starterCircuit,
  type Bit,
  type Circuit,
  type Kind,
  type Wire,
} from '../src/core/circuit'
import { solution } from './solutions'

describe('digital logic', () => {
  it.each<[Kind, Bit[]]>([
    ['AND', [0, 0, 0, 1]],
    ['OR', [0, 1, 1, 1]],
    ['XOR', [0, 1, 1, 0]],
  ])('%s matches its complete truth table', (kind, expected) => {
    expect(
      [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ].map((bits) => gateValue(kind, bits as Bit[])),
    ).toEqual(expected)
  })
  it('inverts both binary values and preserves unknown inputs', () => {
    expect([gateValue('NOT', [0]), gateValue('NOT', [1]), gateValue('NOT', [null])]).toEqual([1, 0, null])
    for (const kind of ['AND', 'OR', 'XOR'] as const) expect(gateValue(kind, [0, null])).toBeNull()
  })
  it('updates the starter lamp when an input changes without mutating the circuit', () => {
    const circuit = starterCircuit(),
      before = cloneCircuit(circuit)
    expect(evaluate(circuit).get('demo-light')).toBe(1)
    expect(evaluate(circuit, new Map([['demo-b', 0]])).get('demo-light')).toBe(0)
    expect(circuit).toEqual(before)
  })
  it('evaluates fan-out and deep dependencies regardless of array order', () => {
    const circuit = solution(5)
    circuit.nodes.reverse()
    circuit.wires.reverse()
    expect(
      evaluate(
        circuit,
        new Map([
          ['port-in-A', 1],
          ['port-in-B', 0],
        ]),
      ).get('port-out-Y'),
    ).toBe(1)
    expect(
      evaluate(
        circuit,
        new Map([
          ['port-in-A', 1],
          ['port-in-B', 1],
        ]),
      ).get('port-out-Y'),
    ).toBe(0)
  })
  it('does not keep an old output after disconnecting a necessary input', () => {
    const circuit = starterCircuit()
    evaluate(circuit)
    circuit.wires = circuit.wires.filter((w) => w.id !== 'demo-w2')
    expect(evaluate(circuit).get('demo-light')).toBeNull()
  })
  it('evaluates a circuit at the 128-node limit deterministically', () => {
    const nodes = Array.from({ length: MAX_NODES }, (_, i) =>
      makeNode(i === 0 ? 'INPUT' : i === MAX_NODES - 1 ? 'OUTPUT' : 'NOT', i * 16, 0, `n${i}`),
    )
    const wires = nodes.slice(1).map((node, i) => ({ id: `w${i}`, from: `n${i}`, to: node.id, pin: 0 }))
    const parsed = parseCircuit({ nodes, wires })
    expect(evaluate(parsed).get(`n${MAX_NODES - 1}`)).toBe(0)
    expect(evaluate(parsed, new Map([['n0', 1]])).get(`n${MAX_NODES - 1}`)).toBe(1)
  })
})

describe('connection and import validation', () => {
  const simple = (): Circuit => ({
    nodes: [
      makeNode('INPUT', 0, 0, 'input'),
      makeNode('NOT', 200, 0, 'n1'),
      makeNode('NOT', 400, 0, 'n2'),
      makeNode('OUTPUT', 600, 0, 'output'),
    ],
    wires: [],
  })
  const wire = (from: string, to: string, pin = 0): Wire => ({ id: 'new-wire', from, to, pin })
  it('rejects multiple drivers while allowing output fan-out', () => {
    const circuit = simple()
    circuit.wires.push({ id: 'w0', from: 'input', to: 'n1', pin: 0 })
    expect(connectionError(circuit, wire('input', 'n1'))).toContain('已有导线')
    expect(connectionError(circuit, wire('input', 'n2'))).toBeNull()
  })
  it('rejects direct and indirect loops before changing the graph', () => {
    const circuit = simple()
    circuit.wires.push({ id: 'w0', from: 'n1', to: 'n2', pin: 0 })
    expect(connectionError(circuit, wire('n2', 'n1'))).toContain('循环')
    expect(connectionError(circuit, wire('n1', 'n1'))).toContain('循环')
    expect(circuit.wires).toHaveLength(1)
  })
  it.each([
    ['output', 'n1', 0],
    ['n1', 'input', 0],
    ['missing', 'n1', 0],
    ['input', 'n1', 1],
    ['input', 'n1', -1],
    ['input', 'n1', 0.5],
  ] as const)('rejects an invalid edge %s → %s pin %s', (from, to, pin) => {
    expect(connectionError(simple(), wire(from, to, pin))).not.toBeNull()
  })
  it('rejects unsupported types, duplicate IDs, huge arrays, invalid values and non-finite positions', () => {
    const mutations = [
      (c: any) => c.nodes.push({ ...c.nodes[0] }),
      (c: any) => {
        c.nodes[0].kind = 'CPU'
      },
      (c: any) => {
        c.nodes[0].x = NaN
      },
      (c: any) => {
        c.nodes[0].y = 9000
      },
      (c: any) => {
        c.nodes[0].value = 2
      },
      (c: any) => {
        c.nodes[0].label = 'a'.repeat(33)
      },
      (c: any) => {
        c.nodes = Array(MAX_NODES + 1).fill(c.nodes[0])
      },
      (c: any) => {
        c.wires = Array(MAX_WIRES + 1).fill(wire('input', 'n1'))
      },
    ]
    for (const mutate of mutations) {
      const circuit = simple()
      mutate(circuit)
      expect(() => parseCircuit(circuit)).toThrow()
    }
  })
  it('revalidates cycles and duplicates in imported connections', () => {
    const circuit = simple()
    circuit.wires = [
      { id: 'a', from: 'n1', to: 'n2', pin: 0 },
      { id: 'b', from: 'n2', to: 'n1', pin: 0 },
    ]
    expect(() => parseCircuit(circuit)).toThrow('循环')
    circuit.wires = [
      { id: 'same', from: 'input', to: 'n1', pin: 0 },
      { id: 'same', from: 'input', to: 'n2', pin: 0 },
    ]
    expect(() => parseCircuit(circuit)).toThrow('编号重复')
  })
  it('only keeps known data fields, including when names contain markup', () => {
    const circuit = simple()
    circuit.nodes[0].label = '<b>plain text</b>'
    const parsed = parseCircuit({
      ...circuit,
      script: 'alert(1)',
      nodes: circuit.nodes.map((n) => ({ ...n, onClick: 'execute' })),
    })
    expect(parsed).toEqual(circuit)
    expect(Object.keys(parsed.nodes[0])).not.toContain('onClick')
  })
})
