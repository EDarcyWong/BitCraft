<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import CircuitCanvas from './components/CircuitCanvas.vue'
import GateSymbol from './components/GateSymbol.vue'
import Icon from './components/Icon.vue'
import Modal from './components/Modal.vue'
import { gateValue, KINDS, MAX_NODES, PARTS, type Bit, type Kind } from './core/circuit'
import { expectedCases, isFixedPort, LEVELS } from './core/levels'
import { useWorkshop } from './composables/useWorkshop'
import type { SavedWork } from './core/storage'

const {
  activeLevel,
  level,
  circuit,
  name,
  completed,
  works,
  motion,
  signals,
  selected,
  selectedWire,
  selectedNode,
  testResult,
  resetKey,
  hintStep,
  savedState,
  toast,
  history,
  future,
  notify,
  select,
  remember,
  undo,
  redo,
  openSandbox,
  openLevel,
  newSandbox,
  resetCircuit,
  add,
  move,
  toggle,
  connect,
  removeSelected,
  renameNode,
  disconnectNode,
  runTests,
  applyTestInputs,
  saveWork,
  openWork,
  deleteWork,
  download,
  importFile,
} = useWorkshop()
type ModalName = 'levels' | 'works' | 'help' | 'save' | 'reset' | 'new' | 'success' | 'delete-work' | null
const modal = ref<ModalName>(null)
const canvas = ref<InstanceType<typeof CircuitCanvas>>()
const fileInput = ref<HTMLInputElement>()
const search = ref('')
const category = ref<'all' | 'logic' | 'io'>('all')
const saveName = ref('')
const nodeName = ref('')
watch(
  () => [selectedNode.value?.id, selectedNode.value?.label],
  () => {
    nodeName.value = selectedNode.value?.label ?? ''
  },
  { immediate: true },
)
const deleteId = ref('')
const compactPanel = ref(false)
const filteredParts = computed(() =>
  KINDS.filter((kind) => {
    const categoryMatch =
      category.value === 'all' ||
      (category.value === 'io' ? ['INPUT', 'OUTPUT'].includes(kind) : !['INPUT', 'OUTPUT'].includes(kind))
    return (
      categoryMatch &&
      `${PARTS[kind].name} ${PARTS[kind].english}`.toLowerCase().includes(search.value.toLowerCase())
    )
  }),
)
const undefinedCount = computed(
  () => circuit.value.nodes.filter((n) => n.kind !== 'INPUT' && signals.value.get(n.id) === null).length,
)
const currentRows = computed(() =>
  level.value ? (testResult.value?.cases.length ? testResult.value.cases : expectedCases(level.value)) : [],
)
const selectedTruth = computed(() => {
  const kind = selectedNode.value?.kind
  if (!kind || kind === 'INPUT' || kind === 'OUTPUT') return []
  return Array.from({ length: 2 ** PARTS[kind].inputs }, (_, number) => {
    const bits = Array.from(
      { length: PARTS[kind].inputs },
      (_, i) => ((number >> (PARTS[kind].inputs - 1 - i)) & 1) as Bit,
    )
    return { bits, result: gateValue(kind, bits) }
  })
})
const canAdd = (kind: Kind) => !level.value || level.value.allowed.includes(kind)
function addAtCenter(kind: Kind) {
  const center = canvas.value?.center() ?? { x: 380, y: 220 }
  // Offset additions that would otherwise cover an existing part.
  let { x, y } = center
  for (
    let i = 0;
    i < 20 && circuit.value.nodes.some((n) => Math.abs(n.x - x) < 20 && Math.abs(n.y - y) < 20);
    i++
  ) {
    x += 32
    y += 32
  }
  add(kind, x, y)
}
function dragPart(event: DragEvent, kind: Kind) {
  event.dataTransfer?.setData('application/bitcraft-part', kind)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}
function selectLevel(id: number) {
  openLevel(id)
  modal.value = null
  compactPanel.value = true
}
function requestSave() {
  saveName.value = name.value
  modal.value = 'save'
}
function submitSave() {
  if (saveWork(saveName.value)) modal.value = null
}
function verify() {
  if (runTests()?.passed) modal.value = 'success'
}
function undoAction() {
  canvas.value?.cancelInteraction()
  undo()
}
function redoAction() {
  canvas.value?.cancelInteraction()
  redo()
}
function chooseImport() {
  fileInput.value?.click()
  modal.value = null
}
function loadWork(work: SavedWork) {
  openWork(work)
  modal.value = null
}
function requestDelete(id: string) {
  deleteId.value = id
  modal.value = 'delete-work'
}
function confirmReset() {
  if (modal.value === 'reset') resetCircuit()
  else newSandbox()
  modal.value = null
}
function confirmDelete() {
  deleteWork(deleteId.value)
  modal.value = 'works'
}
function nextChallenge() {
  if (level.value && level.value.id < 6) selectLevel(level.value.id + 1)
  else {
    openSandbox()
    modal.value = null
  }
}
async function uploaded(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.[0]) await importFile(input.files[0])
  input.value = ''
}
function keyboard(event: KeyboardEvent) {
  if (
    modal.value ||
    (event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')
  )
    return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    canvas.value?.cancelInteraction()
    event.shiftKey ? redo() : undo()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    canvas.value?.cancelInteraction()
    redo()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    requestSave()
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    removeSelected()
  }
  if (event.key === '/') {
    event.preventDefault()
    document.querySelector<HTMLInputElement>('[aria-label="搜索元件"]')?.focus()
  }
}
onMounted(() => document.addEventListener('keydown', keyboard))
onUnmounted(() => document.removeEventListener('keydown', keyboard))
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <a class="brand" href="#" aria-label="比特工坊首页" @click.prevent="openSandbox">
        <img src="/favicon.svg" width="37" height="37" alt="" />
        <div>
          <strong>
            比特工坊
            <span class="brand-dot">.</span>
          </strong>
          <span class="brand-english">BITCRAFT</span>
        </div>
        <span class="alpha-tag">ALPHA</span>
      </a>
      <nav class="main-nav" aria-label="主导航">
        <button :class="{ active: !activeLevel && modal !== 'works' }" @click="openSandbox">
          <Icon name="circuit" :size="18" />
          沙盒工坊
        </button>
        <button :class="{ active: activeLevel }" @click="modal = 'levels'">
          <Icon name="flag" :size="17" />
          挑战关卡
          <span class="nav-count">{{ completed.length }}/6</span>
        </button>
        <button :class="{ active: modal === 'works' }" @click="modal = 'works'">
          <Icon name="folder" :size="18" />
          我的作品
        </button>
      </nav>
      <div class="header-right">
        <button class="manual-button" @click="modal = 'help'">
          <Icon name="book" :size="18" />
          工坊手册
        </button>
        <span class="header-divider"></span>
        <div class="profile-avatar" title="本地工坊，无需登录">
          B
          <span></span>
        </div>
      </div>
    </header>

    <div class="workshop-heading">
      <div class="heading-path">
        <Icon name="grid" :size="16" />
        <span>我的工坊</span>
        <Icon name="chevron" :size="13" />
        <strong>
          {{ level ? `挑战 ${String(level.id).padStart(2, '0')} · ${level.title}` : '自由沙盒' }}
        </strong>
      </div>
      <div class="workshop-heading-right">
        <span class="local-status" :class="{ error: savedState === 'error' }">
          <Icon :name="savedState === 'error' ? 'info' : 'check'" :size="14" />
          {{
            savedState === 'saved'
              ? '进度已保存在此浏览器'
              : savedState === 'saving'
                ? '正在保存…'
                : '本地保存不可用，请导出'
          }}
        </span>
        <button class="subtle-button new-project" @click="modal = 'new'">
          <Icon name="plus" :size="15" />
          新建电路
        </button>
      </div>
    </div>

    <main class="workshop-grid" :class="{ 'show-panel': compactPanel }">
      <aside class="parts-panel" aria-label="元件库">
        <div class="parts-heading">
          <div>
            <span class="eyebrow">YOUR TOOLBOX</span>
            <h2>
              元件盒
              <span>06</span>
            </h2>
          </div>
          <div class="toolbox-mark"><Icon name="grid" :size="19" /></div>
        </div>
        <label class="part-search">
          <Icon name="search" :size="16" />
          <input v-model="search" aria-label="搜索元件" placeholder="寻找一个元件…" />
          <kbd>/</kbd>
        </label>
        <div class="part-tabs" role="group" aria-label="元件分类">
          <button :class="{ active: category === 'all' }" @click="category = 'all'">全部</button>
          <button :class="{ active: category === 'io' }" @click="category = 'io'">输入 / 输出</button>
          <button :class="{ active: category === 'logic' }" @click="category = 'logic'">逻辑门</button>
        </div>
        <div class="parts-list">
          <template v-for="group in ['输入 / 输出', '逻辑门']" :key="group">
            <div v-if="filteredParts.some((k) => PARTS[k].category === group)" class="part-group">
              <h3>
                {{ group }}
                <span>{{ group === '逻辑门' ? 'LOGIC' : 'I / O' }}</span>
              </h3>
              <button
                v-for="kind in filteredParts.filter((k) => PARTS[k].category === group)"
                :key="kind"
                class="part-card"
                :class="{ 'part-locked': !canAdd(kind) }"
                :disabled="!canAdd(kind)"
                :draggable="canAdd(kind)"
                :aria-label="`添加${PARTS[kind].name}`"
                :title="
                  canAdd(kind)
                    ? PARTS[kind].description + ' 点击添加，或拖入画布。'
                    : kind === 'INPUT' || kind === 'OUTPUT'
                      ? '关卡已提供固定输入输出'
                      : '本关尚未解锁'
                "
                @dragstart="dragPart($event, kind)"
                @click="addAtCenter(kind)"
              >
                <span class="part-symbol" :class="kind.toLowerCase()">
                  <GateSymbol :kind="kind" :size="38" />
                </span>
                <span class="part-info">
                  <strong>{{ PARTS[kind].name }}</strong>
                  <small>{{ PARTS[kind].english }}</small>
                </span>
                <Icon :name="canAdd(kind) ? 'plus' : 'lock'" :size="14" />
              </button>
            </div>
          </template>
          <p v-if="!filteredParts.length" class="empty-search">没有找到元件，试试 AND 或开关。</p>
        </div>
        <div class="toolbox-tip">
          <span class="tip-icon"><Icon name="bulb" :size="18" /></span>
          <div>
            <strong>把想法，接成现实。</strong>
            <p>
              拖入元件，连接引脚。
              <br />
              试试看，创造没有标准答案。
            </p>
          </div>
        </div>
        <button class="motion-toggle" :aria-pressed="motion" @click="motion = !motion">
          <span class="small-toggle" :class="{ on: motion }"><i></i></span>
          信号流动动画
          <Icon name="spark" :size="14" />
        </button>
      </aside>

      <section class="workspace" aria-label="电路工作台">
        <header class="workspace-toolbar">
          <div class="circuit-title">
            <span class="document-icon"><Icon name="circuit" :size="17" /></span>
            <input
              v-if="!level"
              v-model="name"
              aria-label="电路名称"
              maxlength="48"
              @blur="name = name.trim() || '未命名电路'"
            />
            <strong v-else>{{ name }}</strong>
            <span class="workspace-tag">{{ level ? 'CHALLENGE' : 'SANDBOX' }}</span>
          </div>
          <div class="editing-actions">
            <button
              class="icon-button"
              :disabled="!history.length"
              aria-label="撤销"
              title="撤销 (Ctrl+Z)"
              @click="undoAction"
            >
              <Icon name="undo" :size="17" />
            </button>
            <button
              class="icon-button"
              :disabled="!future.length"
              aria-label="重做"
              title="重做 (Ctrl+Shift+Z)"
              @click="redoAction"
            >
              <Icon name="redo" :size="17" />
            </button>
            <span class="toolbar-divider"></span>
            <button
              class="icon-button"
              :disabled="!selected && !selectedWire"
              aria-label="删除选中内容"
              title="删除选中内容 (Delete)"
              @click="removeSelected"
            >
              <Icon name="trash" :size="17" />
            </button>
            <button class="icon-button" aria-label="重置电路" title="重置工作台" @click="modal = 'reset'">
              <Icon name="reset" :size="17" />
            </button>
            <span class="toolbar-divider"></span>
            <button class="save-button" @click="requestSave">
              <Icon name="save" :size="16" />
              <span>保存作品</span>
            </button>
          </div>
        </header>
        <CircuitCanvas
          ref="canvas"
          :circuit="circuit"
          :signals="signals"
          :selected="selected"
          :selected-wire="selectedWire"
          :level="level"
          :motion="motion"
          :reset-key="resetKey"
          @select="select"
          @toggle="toggle"
          @connect="connect"
          @move-start="remember"
          @move="move"
          @add="add"
          @notify="notify"
        />
        <footer class="workspace-footer">
          <div>
            <span class="status-dot" :class="{ muted: undefinedCount }"></span>
            {{ undefinedCount ? `${undefinedCount} 个元件等待输入` : '电路已就绪' }}
            <span class="footer-divider"></span>
            <span>{{ circuit.nodes.length }} 个元件</span>
            <span>{{ circuit.wires.length }} 条连接</span>
          </div>
          <span class="one-bit">
            0 → 1
            <span>让创造发生</span>
          </span>
        </footer>
      </section>

      <button class="panel-mobile-toggle" @click="compactPanel = !compactPanel">
        <Icon name="book" :size="17" />
        {{ compactPanel ? '收起手册' : level ? '查看挑战' : '查看手册' }}
      </button>
      <aside class="inspector-panel" aria-label="挑战与元件详情">
        <header class="inspector-heading">
          <Icon :name="level ? 'flag' : 'book'" :size="17" />
          <strong>{{ level ? '挑战手册' : '工坊指南' }}</strong>
          <button class="text-button" @click="modal = 'levels'">
            {{ level ? '全部关卡' : '去闯关' }}
            <Icon name="chevron" :size="13" />
          </button>
        </header>
        <div class="inspector-scroll">
          <template v-if="level">
            <div class="challenge-meta">
              <span>CHAPTER 01</span>
              <span class="difficulty">
                {{ level.id < 5 ? '入门' : '进阶' }}
                <i></i>
                <i :class="{ lit: level.id >= 5 }"></i>
                <i></i>
              </span>
            </div>
            <div class="challenge-title">
              <span class="level-number">{{ String(level.id).padStart(2, '0') }}</span>
              <div>
                <span class="eyebrow">{{ level.concept }}</span>
                <h1>{{ level.title }}</h1>
              </div>
            </div>
            <p class="challenge-description">{{ level.description }}</p>
            <div class="goal-card">
              <span>
                <Icon name="flag" :size="16" />
                你的目标
              </span>
              <p>{{ level.brief }}</p>
            </div>
            <div class="truth-heading">
              <h3>信号验证表</h3>
              <span>{{ 2 ** level.inputs.length }} 组输入</span>
            </div>
            <table class="truth-table">
              <thead>
                <tr>
                  <th v-for="port in level.inputs" :key="port">{{ port }}</th>
                  <th v-for="port in level.outputs" :key="port">
                    {{ port }}
                    <small>目标</small>
                  </th>
                  <th v-if="testResult">实际</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, i) in currentRows"
                  :key="i"
                  :class="{ 'test-pass': testResult && row.pass, 'test-fail': testResult && !row.pass }"
                >
                  <td v-for="(bit, index) in row.inputs" :key="index">{{ bit }}</td>
                  <td v-for="(bit, index) in row.expected" :key="index">
                    <span :class="{ 'bit-one': bit === 1 }">{{ bit }}</span>
                  </td>
                  <td v-if="testResult" class="actual-bits">
                    {{ row.actual.map((v) => (v === null ? '?' : v)).join(' / ') }}
                  </td>
                  <td>
                    <button
                      class="table-try"
                      :aria-label="`尝试输入 ${row.inputs.join(', ')}`"
                      title="把这组输入应用到画布"
                      @click="applyTestInputs(row.inputs)"
                    >
                      <Icon :name="testResult ? (row.pass ? 'check' : 'close') : 'play'" :size="13" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="testResult" class="test-message" :class="{ success: testResult.passed }" role="status">
              <Icon :name="testResult.passed ? 'check' : 'info'" :size="17" />
              <span>
                {{
                  testResult.passed
                    ? '所有组合都正确，挑战完成！'
                    : (testResult.error ?? '有些输入还不符合目标，请检查红色行。')
                }}
              </span>
            </div>
            <button class="primary-button verify-button" @click="verify">
              <Icon name="play" :size="16" />
              验证电路
              <kbd>GO</kbd>
            </button>
            <div class="hint-section">
              <button :disabled="hintStep >= level.hints.length" @click="hintStep++">
                <Icon name="bulb" :size="17" />
                <span>{{ hintStep ? '再给一点提示' : '需要一点灵感？' }}</span>
                <small>{{ hintStep }}/{{ level.hints.length }}</small>
                <Icon name="plus" :size="15" />
              </button>
              <p v-for="(hint, i) in level.hints.slice(0, hintStep)" :key="i">
                <b>{{ i + 1 }}.</b>
                {{ hint }}
              </p>
            </div>
          </template>
          <template v-else-if="!selectedNode && !selectedWire">
            <div class="welcome-card">
              <div class="welcome-art">
                <div class="art-line line-a"></div>
                <div class="art-line line-b"></div>
                <div class="art-chip"><GateSymbol kind="AND" :size="58" /></div>
                <div class="art-bit">1</div>
                <div class="art-light"><Icon name="bulb" :size="27" /></div>
                <span class="art-plus plus-a">+</span>
                <span class="art-plus plus-b">+</span>
              </div>
              <span class="eyebrow">HELLO, MAKER.</span>
              <h1>
                小小电路，
                <br />
                大大可能。
              </h1>
              <p>
                从一个开关开始，
                <br />
                让你的第一个想法亮起来。
              </p>
            </div>
            <div class="quick-steps">
              <div>
                <span>01</span>
                <p>
                  <strong>放下一个元件</strong>
                  从元件盒拖进工作台。
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  <strong>接通一根导线</strong>
                  连接右侧输出和左侧输入。
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  <strong>看看会发生什么</strong>
                  按下开关，信号即刻改变。
                </p>
              </div>
            </div>
            <div class="first-challenge">
              <div class="first-challenge-top">
                <span class="eyebrow">你的第一份委托</span>
                <Icon name="flag" :size="17" />
              </div>
              <h3>点亮工坊</h3>
              <p>用一根线，开启创造之旅。</p>
              <button class="primary-button" @click="selectLevel(1)">
                开始挑战
                <Icon name="arrow" :size="17" />
              </button>
            </div>
          </template>

          <section v-if="selectedNode" class="node-inspector" :class="{ 'below-challenge': level }">
            <div class="section-caption">
              <span>元件详情</span>
              <span class="inspector-state" :class="{ high: signals.get(selectedNode.id) === 1 }">
                {{ signals.get(selectedNode.id) == null ? '未定义' : `信号 ${signals.get(selectedNode.id)}` }}
              </span>
            </div>
            <div class="inspector-part">
              <div class="inspector-part-symbol"><GateSymbol :kind="selectedNode.kind" :size="48" /></div>
              <div>
                <h2>{{ PARTS[selectedNode.kind].name }}</h2>
                <span class="mono">{{ PARTS[selectedNode.kind].english }}</span>
              </div>
            </div>
            <p class="part-description">{{ PARTS[selectedNode.kind].description }}</p>
            <label class="field-label">
              元件名称
              <input
                :key="selectedNode.id"
                v-model="nodeName"
                :disabled="isFixedPort(level, selectedNode.id)"
                maxlength="32"
                @blur="renameNode(nodeName)"
                @keydown.enter="($event.target as HTMLInputElement).blur()"
              />
            </label>
            <button
              v-if="selectedNode.kind === 'INPUT'"
              class="secondary-button wide-button"
              @click="toggle(selectedNode.id)"
            >
              <Icon name="bolt" :size="16" />
              切换为 {{ selectedNode.value === 1 ? '0 · 关闭' : '1 · 开启' }}
            </button>
            <table v-if="selectedTruth.length" class="truth-table part-truth">
              <thead>
                <tr>
                  <th>A</th>
                  <th v-if="PARTS[selectedNode.kind].inputs === 2">B</th>
                  <th>输出</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in selectedTruth" :key="i">
                  <td v-for="(bit, index) in row.bits" :key="index">{{ bit }}</td>
                  <td>
                    <span :class="{ 'bit-one': row.result === 1 }">{{ row.result }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p class="inspector-note">
              <Icon name="info" :size="15" />
              {{
                isFixedPort(level, selectedNode.id)
                  ? '关卡固定端口，可以拖动，不能删除。'
                  : '拖动改变位置，方向键可微调。'
              }}
            </p>
            <div class="inspector-actions">
              <button class="secondary-button" @click="disconnectNode">断开连接</button>
              <button
                class="secondary-button danger-text"
                :disabled="isFixedPort(level, selectedNode.id)"
                @click="removeSelected"
              >
                <Icon name="trash" :size="14" />
                删除元件
              </button>
            </div>
            <button class="back-to-guide text-button" @click="select(null)">
              返回{{ level ? '挑战' : '工坊指南' }}
              <Icon name="arrow" :size="15" />
            </button>
          </section>
          <section v-else-if="selectedWire" class="node-inspector" :class="{ 'below-challenge': level }">
            <span class="eyebrow">CONNECTION</span>
            <h2>一条连接，无限可能。</h2>
            <p class="part-description">导线把输出信号传递给下一个元件。一个输出可以连接多个输入。</p>
            <button class="secondary-button danger-text wide-button" @click="removeSelected">
              <Icon name="trash" :size="15" />
              删除这条导线
            </button>
            <button class="back-to-guide text-button" @click="select(null)">取消选择</button>
          </section>
        </div>
        <div class="inspector-footer">
          <div class="progress-label">
            <span>创造之旅</span>
            <strong>
              {{ completed.length }}
              <small>/ 6</small>
            </strong>
          </div>
          <div class="progress-track">
            <span :style="{ width: `${(completed.length / 6) * 100}%` }"></span>
          </div>
          <p>每个小突破，都通向更大的可能。</p>
        </div>
      </aside>
    </main>

    <footer class="app-footer">
      <div>
        <span class="footer-brand">BITCRAFT</span>
        <span>从 0 到 1，亲手创造。</span>
      </div>
      <div>
        <button @click="fileInput?.click()">
          <Icon name="upload" :size="14" />
          导入
        </button>
        <button @click="download">
          <Icon name="download" :size="14" />
          导出
        </button>
        <span class="footer-divider"></span>
        <span>
          本地工坊
          <span class="version">v0.1</span>
        </span>
      </div>
    </footer>
    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      accept=".json,application/json"
      aria-label="导入电路作品"
      @change="uploaded"
    />
    <Transition name="toast">
      <div v-if="toast" class="toast-message" role="status">
        <Icon name="info" :size="18" />
        <span>{{ toast }}</span>
        <button aria-label="关闭提示" @click="toast = ''"><Icon name="close" :size="16" /></button>
      </div>
    </Transition>
  </div>

  <Modal
    v-if="modal === 'levels'"
    title="每一根线，都是新起点。"
    eyebrow="CHAPTER 01 · 数字逻辑入门"
    wide
    @close="modal = null"
  >
    <p class="modal-intro">六份工坊委托，从点亮一盏灯，到做出你的第一台加法器。随时探索，进度自动保存。</p>
    <div class="level-grid">
      <button
        v-for="item in LEVELS"
        :key="item.id"
        class="level-card"
        :class="{ done: completed.includes(item.id), current: item.id === activeLevel }"
        @click="selectLevel(item.id)"
      >
        <div class="level-card-top">
          <span>{{ String(item.id).padStart(2, '0') }}</span>
          <Icon :name="completed.includes(item.id) ? 'check' : 'flag'" :size="19" />
        </div>
        <span class="eyebrow">{{ item.concept }}</span>
        <h3>{{ item.title }}</h3>
        <p>{{ item.brief }}</p>
        <div class="level-card-bottom">
          <span>{{ completed.includes(item.id) ? '已完成 · 再玩一次' : '开始挑战' }}</span>
          <Icon name="arrow" :size="17" />
        </div>
      </button>
    </div>
  </Modal>
  <Modal
    v-if="modal === 'help'"
    title="欢迎来到你的比特工坊。"
    eyebrow="THE MAKER’S HANDBOOK"
    wide
    @close="modal = null"
  >
    <div class="handbook-grid">
      <section>
        <h3>
          <Icon name="circuit" />
          搭建你的电路
        </h3>
        <ol>
          <li>点击元件盒里的元件，或把它拖到画布上。</li>
          <li>点击右侧圆点，再点击另一个元件的左侧圆点；也可以直接拖出一条线。</li>
          <li>按下开关，观察 0 和 1 如何改变输出。</li>
          <li>点击元件查看说明和真值表；点击导线后可以删除连接。</li>
        </ol>
        <h3>
          <Icon name="bolt" />
          信号的小规则
        </h3>
        <p>
          灰色表示 0，发光表示 1，问号表示输入尚未接通。一个输出可以连接多个输入，但每个输入只能接收一个来源。
        </p>
        <p>导线交叉不代表连接。第一版不支持组合环路；用挑战模式检验每一组输入，正确的解法可以有很多种。</p>
      </section>
      <section>
        <h3>
          <Icon name="cursor" />
          得心应手的小技巧
        </h3>
        <div class="shortcut-list">
          <div>
            <span>移动工作台</span>
            <kbd>空格 + 拖动</kbd>
          </div>
          <div>
            <span>缩放画布</span>
            <kbd>滚轮</kbd>
          </div>
          <div>
            <span>适应全部元件</span>
            <kbd>0</kbd>
          </div>
          <div>
            <span>移动选中的元件</span>
            <kbd>方向键</kbd>
          </div>
          <div>
            <span>撤销 / 重做</span>
            <kbd>Ctrl Z / Shift Z</kbd>
          </div>
          <div>
            <span>保存作品</span>
            <kbd>Ctrl S</kbd>
          </div>
          <div>
            <span>删除 / 取消接线</span>
            <kbd>Delete / Esc</kbd>
          </div>
        </div>
        <h3>
          <Icon name="save" />
          把灵感留下来
        </h3>
        <p>
          进度自动保存在当前浏览器，作品库可以保存 12
          个作品。使用底部「导出」下载作品文件，在另一台设备上「导入」。每个作品支持
          {{ MAX_NODES }} 个元件、256 条连线。
        </p>
      </section>
    </div>
    <button class="primary-button handbook-start" @click="modal = null">
      准备好创造了
      <Icon name="arrow" :size="17" />
    </button>
  </Modal>
  <Modal
    v-if="modal === 'works'"
    title="你的创造，值得留下。"
    eyebrow="MY COLLECTION · 我的作品"
    wide
    @close="modal = null"
  >
    <div class="collection-top">
      <p>保存在此浏览器 · {{ works.length }}/12 个作品</p>
      <button class="secondary-button" @click="chooseImport">
        <Icon name="upload" :size="15" />
        导入作品
      </button>
    </div>
    <div v-if="!works.length" class="collection-empty">
      <Icon name="folder" :size="46" />
      <h3>这里等着你的第一个作品。</h3>
      <p>在工作台点击「保存作品」，收藏你的灵感。</p>
      <button class="primary-button" @click="requestSave">
        保存当前电路
        <Icon name="plus" :size="16" />
      </button>
    </div>
    <div v-else class="works-grid">
      <article v-for="work in works" :key="work.id" class="work-card">
        <div class="work-art">
          <span
            v-for="(node, index) in work.circuit.nodes.slice(0, 4)"
            :key="node.id"
            :style="{ '--i': index }"
          >
            <GateSymbol :kind="node.kind" :size="30" />
          </span>
          <span v-if="!work.circuit.nodes.length" class="empty-work-label">空白电路</span>
        </div>
        <h3>{{ work.name }}</h3>
        <p>
          {{ work.circuit.nodes.length }} 个元件 · {{ new Date(work.savedAt).toLocaleDateString('zh-CN') }}
        </p>
        <div>
          <button class="text-button" @click="loadWork(work)">
            打开作品
            <Icon name="arrow" :size="16" />
          </button>
          <button class="icon-button" :aria-label="`移除作品 ${work.name}`" @click="requestDelete(work.id)">
            <Icon name="trash" :size="15" />
          </button>
        </div>
      </article>
    </div>
  </Modal>
  <Modal
    v-if="modal === 'save'"
    title="给这个想法起个名字。"
    eyebrow="SAVE YOUR CREATION"
    @close="modal = null"
  >
    <form @submit.prevent="submitSave">
      <label class="field-label">
        作品名称
        <input v-model="saveName" maxlength="48" required placeholder="例如：会思考的小灯" />
      </label>
      <p class="form-description">电路和布局将保存在此浏览器的作品库中。要跨设备使用，可导出作品文件。</p>
      <div class="modal-actions">
        <button type="button" class="secondary-button" @click="modal = null">取消</button>
        <button type="submit" class="primary-button">
          <Icon name="save" :size="17" />
          保存作品
        </button>
      </div>
    </form>
  </Modal>
  <Modal
    v-if="modal === 'reset' || modal === 'new'"
    :title="modal === 'reset' ? '重新接出一个好想法。' : '开始一张新的工作台？'"
    eyebrow="A FRESH START"
    @close="modal = null"
  >
    <p class="modal-intro">
      {{
        modal === 'reset'
          ? level
            ? '将移除本关的连线和添加的元件，保留固定端口。重置后仍可撤销。'
            : '将清空当前工作台。重置后可以使用撤销恢复，已保存的作品不受影响。'
          : '新建将替换当前沙盒。想保留这个电路，请先保存到作品库。已有的关卡进度不受影响。'
      }}
    </p>
    <div class="modal-actions">
      <button class="secondary-button" @click="modal = null">继续搭建</button>
      <button v-if="modal === 'new'" class="secondary-button" @click="requestSave">先保存作品</button>
      <button class="primary-button" @click="confirmReset">
        {{ modal === 'reset' ? '重置工作台' : '新建电路' }}
      </button>
    </div>
  </Modal>
  <Modal v-if="modal === 'delete-work'" title="移除这份收藏？" @close="modal = null">
    <p class="modal-intro">
      这会从本地作品库移除该作品。需要备份时，请先打开它并导出文件；当前工作台不受影响。
    </p>
    <div class="modal-actions">
      <button class="secondary-button" @click="modal = null">保留作品</button>
      <button class="primary-button" @click="confirmDelete">移除收藏</button>
    </div>
  </Modal>
  <Modal
    v-if="modal === 'success' && level"
    :title="level.id === 6 ? '你造出了第一台加法器！' : '好想法，接通了！'"
    eyebrow="CHALLENGE COMPLETE"
    @close="modal = null"
  >
    <div class="success-celebration">
      <div class="success-medal"><Icon name="trophy" :size="44" /></div>
      <div class="success-sparks">
        ✦
        <span>✧</span>
        ✦
      </div>
      <h3>{{ level.title }} · 已完成</h3>
      <p>
        {{ testResult?.cases.length }} 组输入全部通过。
        <br />
        {{
          level.id === 6 ? '下一步的寄存器和计算机，正等着你来创造。' : '你又掌握了一块通向计算机的小积木。'
        }}
      </p>
      <div class="success-pills">
        <span>
          <Icon name="check" :size="14" />
          逻辑验证通过
        </span>
        <span>
          <Icon name="save" :size="14" />
          {{ savedState === 'error' ? '请导出备份' : '进度已记录' }}
        </span>
      </div>
    </div>
    <div class="modal-actions">
      <button class="secondary-button" @click="modal = null">再研究一下</button>
      <button class="primary-button" @click="nextChallenge">
        {{ level.id < 6 ? '下一份挑战' : '回到自由沙盒' }}
        <Icon name="arrow" :size="17" />
      </button>
    </div>
  </Modal>
</template>
