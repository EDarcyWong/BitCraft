<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Icon from './Icon.vue'
defineProps<{ title: string; eyebrow?: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement>()
let previousFocus: HTMLElement | null = null
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
  }
  if (event.key !== 'Tab') return
  const items = panel.value?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]',
  )
  if (!items?.length) {
    event.preventDefault()
    return
  }
  const first = items[0],
    last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
onMounted(() => {
  previousFocus = document.activeElement as HTMLElement | null
  panel.value?.querySelector<HTMLElement>('button')?.focus()
  document.addEventListener('keydown', keyboard, true)
})
onUnmounted(() => {
  document.removeEventListener('keydown', keyboard, true)
  previousFocus?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="modal-scrim" @click.self="emit('close')">
      <section
        ref="panel"
        class="modal"
        :class="{ 'modal-wide': wide }"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <header class="modal-header">
          <div>
            <span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span>
            <h2>{{ title }}</h2>
          </div>
          <button class="icon-button" aria-label="关闭对话框" @click="emit('close')">
            <Icon name="close" />
          </button>
        </header>
        <div class="modal-body"><slot /></div>
      </section>
    </div>
  </Teleport>
</template>
