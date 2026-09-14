import { computed, onUnmounted, ref, watch } from 'vue'
import {
  cloneCircuit,
  cloneChip,
  compileChip,
  connectionError,
  evaluate,
  makeNode,
  makeChipNode,
  parseChip,
  snap,
  MAX_NODES,
  PARTS,
  starterCircuit,
  type Circuit,
  type Kind,
  type Chip,
} from '../core/circuit'
import {
  createLevelCircuit,
  inputId,
  isFixedPort,
  LEVELS,
  validateLevel,
  type LevelResult,
} from '../core/levels'
import {
  exportProject,
  MAX_FILE_BYTES,
  MAX_CHIPS,
  parseProject,
  parseStudioSave,
  STORAGE_KEY,
  type Project,
  type SavedWork,
  type StudioSave,
  type SavedChip,
} from '../core/storage'

export function useWorkshop() {
  let recovered: StudioSave | undefined
  let startupError = ''
  let corruptedSave = false
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) recovered = parseStudioSave(raw)
  } catch {
    startupError = '上次存档暂时无法读取，已打开示例。原存档不会自动覆盖，请导出重要作品。'
    corruptedSave = true
  }
  const activeLevel = ref<number | null>(recovered?.activeLevel ?? null)
  const level = computed(() => LEVELS.find((l) => l.id === activeLevel.value))
  const sandbox = ref<Project>(recovered?.sandbox ?? { name: '我的第一个电路', circuit: starterCircuit() })
  const drafts = ref<Record<string, Circuit>>(recovered?.drafts ?? {})
  const circuit = ref<Circuit>(
    cloneCircuit(
      level.value
        ? (drafts.value[String(level.value.id)] ?? createLevelCircuit(level.value))
        : sandbox.value.circuit,
    ),
  )
  const name = ref(level.value?.title ?? sandbox.value.name)
  const completed = ref<number[]>(recovered?.completed ?? [])
  const works = ref<SavedWork[]>(recovered?.works ?? [])
  const chips = ref<SavedChip[]>(recovered?.chips ?? [])
  const motion = ref(recovered?.motion ?? !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const signals = computed(() => evaluate(circuit.value))
  const selected = ref<string | null>(null)
  const selectedWire = ref<string | null>(null)
  const selectedNode = computed(() => circuit.value.nodes.find((n) => n.id === selected.value))
  const testResult = ref<LevelResult | null>(null)
  const resetKey = ref(0)
  const hintStep = ref(0)
  const savedState = ref<'saved' | 'saving' | 'error'>(startupError ? 'error' : 'saved')
  const toast = ref(startupError)
  const history = ref<Circuit[]>([])
  const future = ref<Circuit[]>([])
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function notify(message: string) {
    toast.value = message
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toast.value = ''
    }, 5500)
  }
  function currentProject(): Project {
    return { name: name.value.trim() || '未命名电路', circuit: cloneCircuit(circuit.value) }
  }
  function stash() {
    if (activeLevel.value) drafts.value[String(activeLevel.value)] = cloneCircuit(circuit.value)
    else sandbox.value = currentProject()
  }
  function flushSave() {
    clearTimeout(saveTimer)
    if (corruptedSave) {
      savedState.value = 'error'
      return
    }
    stash()
    const state: StudioSave = {
      version: 2,
      activeLevel: activeLevel.value,
      sandbox: sandbox.value,
      drafts: drafts.value,
      completed: completed.value,
      works: works.value,
      chips: chips.value,
      motion: motion.value,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      savedState.value = 'saved'
    } catch {
      savedState.value = 'error'
      notify('浏览器存储不可用或空间不足。请用「导出」保存作品文件。')
    }
  }
  function scheduleSave() {
    savedState.value = 'saving'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(flushSave, 350)
  }
  watch(
    circuit,
    () => {
      testResult.value = null
      scheduleSave()
    },
    { deep: true, flush: 'sync' },
  )
  watch([name, motion, completed, works, chips], scheduleSave, { deep: true })
  function select(id: string | null, wire = false) {
    selected.value = wire ? null : id
    selectedWire.value = wire ? id : null
  }
  function remember() {
    history.value = [...history.value.slice(-49), cloneCircuit(circuit.value)]
    future.value = []
  }
  function undo() {
    const last = history.value.pop()
    if (!last) return
    future.value.push(cloneCircuit(circuit.value))
    circuit.value = last
    select(null)
  }
  function redo() {
    const next = future.value.pop()
    if (!next) return
    history.value.push(cloneCircuit(circuit.value))
    circuit.value = next
    select(null)
  }
  function newContext(next: Circuit, title: string) {
    circuit.value = cloneCircuit(next)
    name.value = title
    history.value = []
    future.value = []
    select(null)
    hintStep.value = 0
    testResult.value = null
    resetKey.value++
    scheduleSave()
  }
  function openSandbox() {
    stash()
    activeLevel.value = null
    newContext(sandbox.value.circuit, sandbox.value.name)
  }
  function openLevel(id: number) {
    const next = LEVELS.find((l) => l.id === id)
    if (!next) return
    stash()
    activeLevel.value = id
    newContext(drafts.value[String(id)] ?? createLevelCircuit(next), next.title)
  }
  function newSandbox() {
    stash()
    activeLevel.value = null
    newContext({ nodes: [], wires: [] }, '未命名电路')
    notify('新的工作台准备好了，拖入一个元件开始吧。')
  }
  function resetCircuit() {
    remember()
    circuit.value = level.value ? createLevelCircuit(level.value) : { nodes: [], wires: [] }
    select(null)
    resetKey.value++
    notify('工作台已重置，可使用撤销恢复。')
  }
  function add(kind: Kind, x: number, y: number) {
    if (kind === 'CHIP') return
    if (level.value && !level.value.allowed.includes(kind)) {
      notify('本关使用固定输入输出，请选择已解锁的逻辑门。')
      return
    }
    if (circuit.value.nodes.length >= MAX_NODES) {
      notify(`一个作品最多支持 ${MAX_NODES} 个元件。`)
      return
    }
    const node = makeNode(kind, x, y)
    if (kind === 'INPUT' || kind === 'OUTPUT')
      node.label = `${PARTS[kind].name} ${circuit.value.nodes.filter((n) => n.kind === kind).length + 1}`
    remember()
    circuit.value.nodes.push(node)
    select(node.id)
  }
  function move(id: string, x: number, y: number) {
    const node = circuit.value.nodes.find((n) => n.id === id)
    if (node) {
      node.x = x
      node.y = y
    }
  }
  function toggle(id: string) {
    const node = circuit.value.nodes.find((n) => n.id === id)
    if (node?.kind !== 'INPUT') return
    remember()
    node.value = node.value === 1 ? 0 : 1
  }
  function connect(from: string, to: string, pin: number, fromPin = 0) {
    const wire = { id: crypto.randomUUID(), from, to, pin, fromPin }
    const error = connectionError(circuit.value, wire)
    if (error) {
      notify(error)
      return
    }
    remember()
    circuit.value.wires.push(wire)
  }
  function removeSelected() {
    if (selectedWire.value) {
      remember()
      circuit.value.wires = circuit.value.wires.filter((w) => w.id !== selectedWire.value)
      select(null)
      return
    }
    if (!selected.value) return
    if (isFixedPort(level.value, selected.value)) {
      notify('这是本关的固定端口，可以移动或断开导线，不能删除。')
      return
    }
    remember()
    circuit.value.nodes = circuit.value.nodes.filter((n) => n.id !== selected.value)
    circuit.value.wires = circuit.value.wires.filter(
      (w) => w.from !== selected.value && w.to !== selected.value,
    )
    select(null)
  }
  function renameNode(label: string) {
    if (!selectedNode.value || isFixedPort(level.value, selectedNode.value.id)) return
    const trimmed = label.trim().slice(0, 32)
    if (!trimmed || trimmed === selectedNode.value.label) return
    remember()
    selectedNode.value.label = trimmed
  }
  function disconnectNode() {
    if (!selectedNode.value) return
    const id = selectedNode.value.id
    if (!circuit.value.wires.some((w) => w.from === id || w.to === id)) return
    remember()
    circuit.value.wires = circuit.value.wires.filter((w) => w.from !== id && w.to !== id)
  }
  function duplicateSelected() {
    const node = selectedNode.value
    if (!node || isFixedPort(level.value, node.id)) return
    if (circuit.value.nodes.length >= MAX_NODES) return notify(`一个作品最多支持 ${MAX_NODES} 个元件。`)
    remember()
    const copy = cloneCircuit({ nodes: [node], wires: [] }).nodes[0]
    copy.id = crypto.randomUUID()
    copy.x = snap(copy.x + 32)
    copy.y = snap(copy.y + 32)
    circuit.value.nodes.push(copy)
    select(copy.id)
    notify('已复制元件，按方向键或拖动放置。')
  }
  function addChip(id: string, x: number, y: number) {
    if (level.value && !level.value.allowed.includes('CHIP'))
      return notify('自制芯片从第 7 关开始可用，也可在沙盒自由使用。')
    const chip = chips.value.find((item) => item.id === id)
    if (!chip) return
    if (circuit.value.nodes.length >= MAX_NODES) return notify(`一个作品最多支持 ${MAX_NODES} 个元件。`)
    const node = makeChipNode(chip, x, y)
    remember()
    circuit.value.nodes.push(node)
    select(node.id)
  }
  function saveChip(chip: Chip) {
    try {
      chip = parseChip(chip)
    } catch (error) {
      notify((error as Error).message)
      return false
    }
    if (chips.value.length >= MAX_CHIPS) {
      notify('芯片库已满（24 个），请先移除不需要的芯片。')
      return false
    }
    if (chips.value.some((item) => item.name === chip.name)) {
      notify('芯片库中已有这个名称，请换个名字。')
      return false
    }
    chips.value.push({ ...cloneChip(chip), id: crypto.randomUUID() })
    flushSave()
    notify(
      savedState.value === 'saved'
        ? `「${chip.name}」已加入芯片库，可以反复搭建了。`
        : '芯片已加入本次芯片库，但本地保存失败。请将芯片放入作品并导出。',
    )
    return true
  }
  function packageChip(title: string) {
    try {
      return saveChip(compileChip(circuit.value, title.trim()))
    } catch (error) {
      notify((error as Error).message)
      return false
    }
  }
  function collectChip() {
    if (!selectedNode.value?.chip) return
    const chip = cloneChip(selectedNode.value.chip)
    chip.name = selectedNode.value.label
    saveChip(chip)
  }
  function deleteChip(id: string) {
    chips.value = chips.value.filter((chip) => chip.id !== id)
    flushSave()
    notify('已移除芯片收藏，作品中放置的芯片继续正常工作。')
  }
  function runTests() {
    if (!level.value) return
    const result = validateLevel(level.value, circuit.value)
    testResult.value = result
    if (result.passed) {
      if (!completed.value.includes(level.value.id)) completed.value = [...completed.value, level.value.id]
      flushSave()
      notify(`挑战完成！${level.value.title}，所有输入组合都正确。`)
    } else notify(result.error ?? '还差一点！看看验证表中的反例，再调整一下电路。')
    return result
  }
  function applyTestInputs(inputs: number[]) {
    if (!level.value) return
    remember()
    for (const [i, label] of level.value.inputs.entries()) {
      const node = circuit.value.nodes.find((n) => n.id === inputId(label))
      if (node) node.value = inputs[i] === 1 ? 1 : 0
    }
    notify('已将这组输入应用到画布。')
  }
  function saveWork(title: string) {
    const clean = title.trim().slice(0, 48)
    if (!clean) {
      notify('请先给作品起个名字。')
      return false
    }
    if (works.value.length >= 12) {
      notify('作品库已满（12 个）。可先导出，再移除不需要的作品。')
      return false
    }
    const work = {
      ...currentProject(),
      id: crypto.randomUUID(),
      name: clean,
      savedAt: new Date().toISOString(),
    }
    works.value = [work, ...works.value]
    if (!level.value) name.value = clean
    // A corrupt original is preserved until the user explicitly saves a new work.
    if (corruptedSave) {
      try {
        const original = localStorage.getItem(STORAGE_KEY)
        if (original) localStorage.setItem(`${STORAGE_KEY}:recovery`, original)
        corruptedSave = false
      } catch {
        notify('旧存档无法备份，请先导出作品。')
        return false
      }
    }
    flushSave()
    notify(
      savedState.value === 'saved'
        ? '作品已保存到「我的作品」。'
        : '作品已加入本次作品库，但本地保存失败，请导出文件。',
    )
    return true
  }
  function openWork(work: SavedWork) {
    stash()
    activeLevel.value = null
    newContext(work.circuit, work.name)
    notify('作品已在沙盒中打开。')
  }
  function deleteWork(id: string) {
    works.value = works.value.filter((w) => w.id !== id)
    flushSave()
    notify('已从作品库移除，当前工作台不受影响。')
  }
  function download() {
    const blob = new Blob([exportProject(currentProject())], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(name.value || 'bitcraft').replace(/[<>:"/\\|?*]/g, '-')}.bitcraft.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('作品已导出，可通过「导入」再次打开。')
  }
  async function importFile(file: File) {
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('作品文件不能超过 1 MB。')
      const project = parseProject(await file.text())
      // Parse everything first; failed imports never replace the active circuit.
      stash()
      activeLevel.value = null
      newContext(project.circuit, project.name)
      notify('导入成功，作品已在沙盒打开。')
    } catch (error) {
      notify(`导入失败：${(error as Error).message}`)
    }
  }
  const unload = () => flushSave()
  const visibility = () => {
    if (document.visibilityState === 'hidden') flushSave()
  }
  window.addEventListener('pagehide', unload)
  document.addEventListener('visibilitychange', visibility)
  onUnmounted(() => {
    flushSave()
    clearTimeout(toastTimer)
    window.removeEventListener('pagehide', unload)
    document.removeEventListener('visibilitychange', visibility)
  })

  return {
    activeLevel,
    level,
    circuit,
    name,
    completed,
    works,
    chips,
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
    duplicateSelected,
    addChip,
    packageChip,
    collectChip,
    deleteChip,
    runTests,
    applyTestInputs,
    saveWork,
    openWork,
    deleteWork,
    download,
    importFile,
  }
}
