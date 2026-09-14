import { compileChip, makeChipNode, makeNode, type Circuit, type Kind } from '../src/core/circuit'
import { createLevelCircuit, inputId, LEVELS, outputId } from '../src/core/levels'

/** Independent playable fixtures, used to exercise the actual engine and validator together. */
export function solution(id: number): Circuit {
  const circuit = createLevelCircuit(LEVELS[id - 1])
  const add = (kind: Kind, name: string) => {
    circuit.nodes.push(makeNode(kind, 320 + circuit.nodes.length * 16, 128, name))
    return name
  }
  const wire = (from: string, to: string, pin = 0, fromPin = 0) =>
    circuit.wires.push({ id: `w${circuit.wires.length}`, from, to, pin, ...(fromPin ? { fromPin } : {}) })
  const a = inputId('A'),
    b = inputId('B'),
    y = outputId('Y')
  if (id === 1) wire(a, y)
  if (id === 2) {
    const gate = add('NOT', 'invert')
    wire(a, gate)
    wire(gate, y)
  }
  if (id === 3 || id === 4) {
    const gate = add(id === 3 ? 'AND' : 'OR', 'combine')
    wire(a, gate)
    wire(b, gate, 1)
    wire(gate, y)
  }
  if (id === 5) {
    const na = add('NOT', 'not-a'),
      nb = add('NOT', 'not-b'),
      left = add('AND', 'left'),
      right = add('AND', 'right'),
      out = add('OR', 'out')
    wire(a, na)
    wire(b, nb)
    wire(a, left)
    wire(nb, left, 1)
    wire(na, right)
    wire(b, right, 1)
    wire(left, out)
    wire(right, out, 1)
    wire(out, y)
  }
  if (id === 6) {
    const sum = add('XOR', 'sum'),
      carry = add('AND', 'carry')
    wire(a, sum)
    wire(b, sum, 1)
    wire(a, carry)
    wire(b, carry, 1)
    wire(sum, outputId('S'))
    wire(carry, outputId('C'))
  }
  if (id === 7) {
    const chip = compileChip(solution(6), '半加器')
    circuit.nodes.push(makeChipNode(chip, 304, 160, 'half-1'), makeChipNode(chip, 496, 336, 'half-2'))
    add('OR', 'carry-or')
    wire(a, 'half-1')
    wire(b, 'half-1', 1)
    wire('half-1', 'half-2')
    wire(inputId('Cin'), 'half-2', 1)
    wire('half-2', outputId('S'))
    wire('half-1', 'carry-or', 0, 1)
    wire('half-2', 'carry-or', 1, 1)
    wire('carry-or', outputId('Cout'))
  }
  if (id === 8) {
    add('NOT', 'invert-sel')
    add('AND', 'a-path')
    add('AND', 'b-path')
    add('OR', 'mux-out')
    wire(inputId('Sel'), 'invert-sel')
    wire(a, 'a-path')
    wire('invert-sel', 'a-path', 1)
    wire(b, 'b-path')
    wire(inputId('Sel'), 'b-path', 1)
    wire('a-path', 'mux-out')
    wire('b-path', 'mux-out', 1)
    wire('mux-out', y)
  }
  return circuit
}
