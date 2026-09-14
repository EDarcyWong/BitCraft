import { makeNode, type Circuit, type Kind } from '../src/core/circuit'
import { createLevelCircuit, inputId, LEVELS, outputId } from '../src/core/levels'

/** Independent playable fixtures, used to exercise the actual engine and validator together. */
export function solution(id: number): Circuit {
  const circuit = createLevelCircuit(LEVELS[id - 1])
  const add = (kind: Kind, name: string) => {
    circuit.nodes.push(makeNode(kind, 320 + circuit.nodes.length * 16, 128, name))
    return name
  }
  const wire = (from: string, to: string, pin = 0) =>
    circuit.wires.push({ id: `w${circuit.wires.length}`, from, to, pin })
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
  return circuit
}
