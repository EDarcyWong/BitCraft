<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  GRID,
  NODE_HEIGHT,
  NODE_WIDTH,
  PARTS,
  inputCount,
  outputCount,
  nodeHeight,
  signalKey,
  pinPosition,
  snap,
  type Circuit,
  type CircuitNode,
  type Kind,
  type Signal,
} from '../core/circuit'
import { isFixedPort, type Level } from '../core/levels'
import GateSymbol from './GateSymbol.vue'
import Icon from './Icon.vue'

const props = defineProps<{
  circuit: Circuit
  signals: Map<string, Signal>
  selected: string | null
  selectedWire: string | null
  level?: Level
  motion: boolean
  resetKey: number
}>()
const emit = defineEmits<{
  select: [id: string | null, wire?: boolean]
  toggle: [id: string]
  connect: [from: string, to: string, pin: number, fromPin: number]
  'move-start': []
  move: [id: string, x: number, y: number]
  'move-end': []
  add: [kind: Kind, x: number, y: number]
  'add-chip': [id: string, x: number, y: number]
  notify: [message: string]
}>()
const svg = ref<SVGSVGElement>()
const holder = ref<HTMLElement>()
const dimensions = ref({ width: 900, height: 600 })
const view = ref({ x: 0, y: 0, scale: 1 })
const tool = ref<'select' | 'hand'>('select')
const space = ref(false)
interface Pending {
  id: string
  output: boolean
  pin: number
}
const pending = ref<Pending | null>(null)
const cursor = ref({ x: 0, y: 0 })
let drag: { id: string; startX: number; startY: number; x: number; y: number; moved: boolean } | null = null
let pan: { x: number; y: number; vx: number; vy: number } | null = null
let observer: ResizeObserver | undefined
const nodes = computed(() => new Map(props.circuit.nodes.map((n) => [n.id, n])))
const gridSize = computed(() => GRID * view.value.scale)
const signalText = (signal: Signal | undefined) => (signal == null ? '?' : signal)

function pathBetween(start: { x: number; y: number }, end: { x: number; y: number }) {
  const distance = Math.max(48, Math.abs(end.x - start.x) * 0.5)
  return `M ${start.x} ${start.y} C ${start.x + distance} ${start.y}, ${end.x - distance} ${end.y}, ${end.x} ${end.y}`
}
const paths = computed(() =>
  props.circuit.wires.map((wire) => {
    const source = nodes.value.get(wire.from)!,
      target = nodes.value.get(wire.to)!
    return {
      ...wire,
      path: pathBetween(pinPosition(source, wire.fromPin ?? 0, true), pinPosition(target, wire.pin)),
      signal: props.signals.get(signalKey(wire.from, wire.fromPin)) ?? null,
    }
  }),
)
const pendingPath = computed(() => {
  if (!pending.value) return ''
  const node = nodes.value.get(pending.value.id)
  if (!node) return ''
  const start = pinPosition(node, pending.value.pin, pending.value.output)
  return pending.value.output ? pathBetween(start, cursor.value) : pathBetween(cursor.value, start)
})

function toWorld(clientX: number, clientY: number) {
  const rect = svg.value!.getBoundingClientRect()
  return {
    x: (clientX - rect.left - view.value.x) / view.value.scale,
    y: (clientY - rect.top - view.value.y) / view.value.scale,
  }
}
function center() {
  return {
    x: (dimensions.value.width / 2 - view.value.x) / view.value.scale - NODE_WIDTH / 2,
    y: (dimensions.value.height / 2 - view.value.y) / view.value.scale - NODE_HEIGHT / 2,
  }
}
function fit() {
  const list = props.circuit.nodes
  if (!list.length) {
    view.value = { x: 0, y: 0, scale: 1 }
    return
  }
  const minX = Math.min(...list.map((n) => n.x)) - 100,
    minY = Math.min(...list.map((n) => n.y)) - 100
  const width = Math.max(...list.map((n) => n.x)) + NODE_WIDTH + 100 - minX
  const height = Math.max(...list.map((n) => n.y + nodeHeight(n))) + 100 - minY
  const scale = Math.max(
    0.06,
    Math.min(1.1, dimensions.value.width / width, (dimensions.value.height - 80) / height),
  )
  view.value = {
    scale,
    x: (dimensions.value.width - width * scale) / 2 - minX * scale,
    y: (dimensions.value.height - height * scale) / 2 - minY * scale - 15,
  }
}
function zoom(factor: number, point?: { x: number; y: number }) {
  const p = point ?? { x: dimensions.value.width / 2, y: dimensions.value.height / 2 }
  const previous = view.value.scale
  const scale = Math.max(0.06, Math.min(2, previous * factor))
  view.value = {
    scale,
    x: p.x - ((p.x - view.value.x) * scale) / previous,
    y: p.y - ((p.y - view.value.y) * scale) / previous,
  }
}
function wheel(event: WheelEvent) {
  const rect = svg.value!.getBoundingClientRect()
  zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.0015), {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  })
}
function capture(event: PointerEvent) {
  svg.value?.setPointerCapture(event.pointerId)
}
function startPan(event: PointerEvent) {
  pan = { x: event.clientX, y: event.clientY, vx: view.value.x, vy: view.value.y }
  capture(event)
}
function backgroundDown(event: PointerEvent) {
  if (event.button !== 0 && event.button !== 1) return
  if (tool.value === 'hand' || space.value || event.button === 1) {
    event.preventDefault()
    startPan(event)
    return
  }
  pending.value = null
  emit('select', null)
}
function nodeDown(event: PointerEvent, node: CircuitNode) {
  if (event.button !== 0 && event.button !== 1) return
  if (tool.value === 'hand' || space.value || event.button === 1) {
    startPan(event)
    return
  }
  emit('select', node.id)
  const point = toWorld(event.clientX, event.clientY)
  drag = { id: node.id, startX: point.x, startY: point.y, x: node.x, y: node.y, moved: false }
  capture(event)
}
function pointerMove(event: PointerEvent) {
  cursor.value = toWorld(event.clientX, event.clientY)
  if (pan) {
    view.value.x = pan.vx + event.clientX - pan.x
    view.value.y = pan.vy + event.clientY - pan.y
    return
  }
  if (!drag) return
  const x = snap(drag.x + cursor.value.x - drag.startX),
    y = snap(drag.y + cursor.value.y - drag.startY)
  if (!drag.moved && (x !== drag.x || y !== drag.y)) {
    emit('move-start')
    drag.moved = true
  }
  if (drag.moved) emit('move', drag.id, x, y)
}
function finishPin(target: Pending) {
  const source = pending.value
  if (!source) {
    pending.value = target
    return
  }
  if (source.id === target.id && source.output === target.output && source.pin === target.pin) return
  if (source.output === target.output) {
    emit('notify', '请连接一个输出引脚和一个输入引脚。')
    return
  }
  emit(
    'connect',
    source.output ? source.id : target.id,
    source.output ? target.id : source.id,
    source.output ? target.pin : source.pin,
    source.output ? source.pin : target.pin,
  )
  pending.value = null
}
function pinDown(event: PointerEvent, target: Pending) {
  if (event.button !== 0) return
  cursor.value = toWorld(event.clientX, event.clientY)
  finishPin(target)
  capture(event)
}
function pointerUp(event: PointerEvent) {
  if (pending.value) {
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-pin-node]')
    if (element)
      finishPin({
        id: element.getAttribute('data-pin-node')!,
        output: element.getAttribute('data-output') === 'true',
        pin: Number(element.getAttribute('data-pin-index')),
      })
  }
  if (drag?.moved) emit('move-end')
  drag = null
  pan = null
  if (svg.value?.hasPointerCapture(event.pointerId)) svg.value.releasePointerCapture(event.pointerId)
}
function cancelInteraction() {
  if (drag?.moved) emit('move-end')
  drag = null
  pan = null
  pending.value = null
  space.value = false
}
function keyDown(event: KeyboardEvent) {
  if ((event.target as Element)?.closest('input, textarea, [role="dialog"]')) return
  if (event.code === 'Space' && !(event.target as Element)?.closest('[role="button"], button')) {
    event.preventDefault()
    space.value = true
  }
  if (event.key === 'Escape') pending.value = null
  if (event.key === '0') fit()
}
function keyUp(event: KeyboardEvent) {
  if (event.code === 'Space') space.value = false
}
function moveWithKeys(event: KeyboardEvent, node: CircuitNode) {
  const deltas: Record<string, number[]> = {
    ArrowLeft: [-GRID, 0],
    ArrowRight: [GRID, 0],
    ArrowUp: [0, -GRID],
    ArrowDown: [0, GRID],
  }
  const delta = deltas[event.key]
  if (!delta) return
  event.preventDefault()
  emit('move-start')
  emit('move', node.id, snap(node.x + delta[0]), snap(node.y + delta[1]))
  emit('move-end')
}
function drop(event: DragEvent) {
  const chipId = event.dataTransfer?.getData('application/bitcraft-chip')
  if (chipId) {
    const point = toWorld(event.clientX, event.clientY)
    emit('add-chip', chipId, point.x - NODE_WIDTH / 2, point.y - NODE_HEIGHT / 2)
    return
  }
  const kind = event.dataTransfer?.getData('application/bitcraft-part') as Kind
  if (!Object.hasOwn(PARTS, kind)) return
  const point = toWorld(event.clientX, event.clientY)
  emit('add', kind, point.x - NODE_WIDTH / 2, point.y - NODE_HEIGHT / 2)
}
watch(
  () => props.resetKey,
  async () => {
    cancelInteraction()
    await nextTick()
    fit()
  },
)
watch(
  () => props.circuit.nodes.map((n) => n.id).join(','),
  () => {
    if (pending.value && !nodes.value.has(pending.value.id)) pending.value = null
  },
)
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const rect = entries[0].contentRect
    const initial = dimensions.value.width === 900 && dimensions.value.height === 600
    dimensions.value = { width: rect.width, height: rect.height }
    if (initial) fit()
  })
  observer.observe(holder.value!)
  document.addEventListener('keydown', keyDown)
  document.addEventListener('keyup', keyUp)
  window.addEventListener('blur', cancelInteraction)
})
onUnmounted(() => {
  observer?.disconnect()
  document.removeEventListener('keydown', keyDown)
  document.removeEventListener('keyup', keyUp)
  window.removeEventListener('blur', cancelInteraction)
})
defineExpose({ fit, center, cancelInteraction })
</script>

<template>
  <div
    ref="holder"
    class="canvas-holder"
    :class="{ 'hand-tool': tool === 'hand' || space, 'reduced-motion': !motion }"
  >
    <div class="canvas-label">
      <span class="live-dot"></span>
      实时模拟
      <span class="canvas-label-divider">/</span>
      <span>1 BIT</span>
    </div>
    <svg
      ref="svg"
      class="circuit-canvas"
      aria-label="电路画布"
      tabindex="0"
      :viewBox="`0 0 ${dimensions.width} ${dimensions.height}`"
      @pointerdown="backgroundDown"
      @pointermove="pointerMove"
      @pointerup="pointerUp"
      @pointercancel="cancelInteraction"
      @wheel.prevent="wheel"
      @dragover.prevent
      @drop.prevent="drop"
      @contextmenu.prevent
    >
      <defs>
        <pattern
          id="grid"
          :width="gridSize"
          :height="gridSize"
          patternUnits="userSpaceOnUse"
          :x="view.x % gridSize"
          :y="view.y % gridSize"
        >
          <circle :cx="gridSize / 2" :cy="gridSize / 2" :r="Math.max(0.6, view.scale * 0.8)" fill="#c9c9bb" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      <g :transform="`translate(${view.x}, ${view.y}) scale(${view.scale})`">
        <g
          v-for="wire in paths"
          :key="wire.id"
          class="wire-group"
          :class="{
            'wire-high': wire.signal === 1,
            'wire-unknown': wire.signal === null,
            'wire-selected': selectedWire === wire.id,
          }"
        >
          <path
            :d="wire.path"
            class="wire-hit"
            tabindex="0"
            role="button"
            :aria-label="`选择导线：${nodes.get(wire.from)?.label} 到 ${nodes.get(wire.to)?.label} 输入 ${wire.pin + 1}`"
            @pointerdown.stop="emit('select', wire.id, true)"
            @keydown.enter.prevent="emit('select', wire.id, true)"
            @keydown.space.prevent="emit('select', wire.id, true)"
          />
          <path :d="wire.path" class="wire-line" />
          <path v-if="wire.signal === 1" :d="wire.path" class="wire-flow" />
        </g>
        <path v-if="pending" :d="pendingPath" class="pending-wire" />
        <g
          v-for="node in circuit.nodes"
          :key="node.id"
          :data-node="node.id"
          :transform="`translate(${node.x}, ${node.y})`"
          class="circuit-node"
          :class="{
            'node-selected': selected === node.id,
            'node-high': signals.get(node.id) === 1,
            'node-output': node.kind === 'OUTPUT',
            'node-input': node.kind === 'INPUT',
          }"
          tabindex="0"
          role="group"
          :aria-label="`${node.label}，${PARTS[node.kind].name}`"
          @pointerdown.stop="nodeDown($event, node)"
          @focus="emit('select', node.id)"
          @keydown="moveWithKeys($event, node)"
          @keydown.enter.prevent="emit('select', node.id)"
        >
          <rect class="node-shadow" x="0" y="4" :width="NODE_WIDTH" :height="nodeHeight(node)" rx="12" />
          <rect
            class="node-body"
            :class="{ 'chip-body': node.kind === 'CHIP' }"
            :width="NODE_WIDTH"
            :height="nodeHeight(node)"
            rx="12"
          />
          <text x="14" y="21" class="node-label">
            {{ node.label.length > 11 ? node.label.slice(0, 10) + '…' : node.label }}
          </text>
          <text v-if="node.kind !== 'CHIP'" x="129" y="21" class="node-signal" text-anchor="end">
            {{ signalText(signals.get(node.id)) }}
          </text>
          <template v-if="node.kind === 'INPUT'">
            <g
              class="node-toggle"
              role="button"
              tabindex="0"
              :aria-label="`切换开关 ${node.label}`"
              :aria-pressed="node.value === 1"
              @pointerdown.stop
              @click.stop="emit('toggle', node.id)"
              @keydown.enter.prevent.stop="emit('toggle', node.id)"
              @keydown.space.prevent.stop="emit('toggle', node.id)"
            >
              <rect x="43" y="34" width="58" height="29" rx="14.5" class="switch-track" />
              <circle :cx="node.value ? 86 : 58" cy="48.5" r="10.5" class="switch-knob" />
              <text :x="node.value ? 57 : 86" y="52" text-anchor="middle" class="switch-number">
                {{ node.value }}
              </text>
            </g>
          </template>
          <template v-else-if="node.kind === 'OUTPUT'">
            <circle v-if="signals.get(node.id) === 1" cx="72" cy="48" r="26" class="lamp-halo" />
            <circle cx="72" cy="46" r="15" class="lamp-bulb" />
            <path d="m67 44 5 5 5-5m-5 5v11m-6 1h12m-10 4h8" class="lamp-filament" />
          </template>
          <GateSymbol
            v-else-if="node.kind !== 'CHIP'"
            :kind="node.kind"
            :size="54"
            x="45"
            y="30"
            class="node-gate-symbol"
          />
          <text x="72" :y="nodeHeight(node) - 13" text-anchor="middle" class="node-kind">
            {{ PARTS[node.kind].english }}
            <template v-if="isFixedPort(level, node.id)">· 固定</template>
          </text>
          <g
            v-for="(_, pin) in inputCount(node)"
            :key="pin"
            :transform="`translate(0, ${pinPosition(node, pin).y - node.y})`"
            class="pin"
            :class="{ 'pin-pending': pending?.id === node.id && !pending.output && pending.pin === pin }"
            role="button"
            tabindex="0"
            :aria-label="`${node.label} 输入 ${pin + 1}${node.chip ? ' ' + node.chip.inputs[pin] : ''}`"
            :data-pin-node="node.id"
            :data-pin-index="pin"
            data-output="false"
            @pointerdown.stop.prevent="pinDown($event, { id: node.id, output: false, pin })"
            @keydown.enter.prevent.stop="finishPin({ id: node.id, output: false, pin })"
            @keydown.space.prevent.stop="finishPin({ id: node.id, output: false, pin })"
          >
            <circle r="13" class="pin-hit" />
            <circle r="5.5" class="pin-ring" />
            <text v-if="inputCount(node) > 1 || node.chip" x="11" y="4" class="pin-caption">
              {{ node.chip ? node.chip.inputs[pin].slice(0, 5) : pin === 0 ? 'A' : 'B' }}
            </text>
          </g>
          <g
            v-for="(_, pin) in outputCount(node)"
            :key="`out-${pin}`"
            :transform="`translate(${NODE_WIDTH}, ${pinPosition(node, pin, true).y - node.y})`"
            class="pin"
            :class="{
              'pin-pending': pending?.id === node.id && pending.output && pending.pin === pin,
              'pin-high': signals.get(signalKey(node.id, pin)) === 1,
            }"
            role="button"
            tabindex="0"
            :aria-label="`${node.label} 输出${node.chip ? ' ' + (pin + 1) + ' ' + node.chip.outputs[pin] : ''}`"
            :data-pin-node="node.id"
            :data-pin-index="pin"
            data-output="true"
            @pointerdown.stop.prevent="pinDown($event, { id: node.id, output: true, pin })"
            @keydown.enter.prevent.stop="finishPin({ id: node.id, output: true, pin })"
            @keydown.space.prevent.stop="finishPin({ id: node.id, output: true, pin })"
          >
            <circle r="13" class="pin-hit" />
            <circle r="5.5" class="pin-ring" />
            <text v-if="node.chip" x="-11" y="4" text-anchor="end" class="pin-caption">
              {{ node.chip.outputs[pin].slice(0, 5) }}:{{ signalText(signals.get(signalKey(node.id, pin))) }}
            </text>
          </g>
        </g>
      </g>
    </svg>
    <div v-if="!circuit.nodes.length" class="canvas-empty">
      <Icon name="circuit" :size="42" />
      <h3>每个好点子，都从一根线开始。</h3>
      <p>从左侧拖入元件，搭建你的第一个电路。</p>
    </div>
    <div v-if="pending" class="connection-tip" role="status">
      <span class="live-dot"></span>
      选择一个{{ pending.output ? '输入' : '输出' }}引脚完成连接
      <kbd>Esc</kbd>
      取消
    </div>
    <div class="canvas-bottom">
      <div class="tool-switch">
        <button
          class="icon-button"
          :class="{ active: tool === 'select' }"
          aria-label="选择工具"
          :aria-pressed="tool === 'select'"
          @click="tool = 'select'"
        >
          <Icon name="cursor" :size="18" />
        </button>
        <button
          class="icon-button"
          :class="{ active: tool === 'hand' }"
          aria-label="平移工具"
          :aria-pressed="tool === 'hand'"
          @click="tool = 'hand'"
        >
          <Icon name="hand" :size="18" />
        </button>
      </div>
      <span class="canvas-guide">
        <kbd>空格</kbd>
        拖动画布
        <i>·</i>
        滚轮缩放
      </span>
      <div class="zoom-control">
        <button class="icon-button" aria-label="缩小画布" @click="zoom(1 / 1.2)">
          <Icon name="minus" :size="16" />
        </button>
        <button class="zoom-value" aria-label="恢复百分之百缩放" @click="zoom(1 / view.scale)">
          {{ Math.round(view.scale * 100) }}%
        </button>
        <button class="icon-button" aria-label="放大画布" @click="zoom(1.2)">
          <Icon name="plus" :size="16" />
        </button>
        <span></span>
        <button class="icon-button" aria-label="适应全部元件" title="适应全部元件 (0)" @click="fit">
          <Icon name="fit" :size="17" />
        </button>
      </div>
    </div>
  </div>
</template>
