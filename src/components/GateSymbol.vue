<script setup lang="ts">
import type { Kind } from '../core/circuit'
defineProps<{ kind: Kind; size?: number }>()
</script>

<template>
  <svg
    :width="size ?? 42"
    :height="(size ?? 42) * 0.7"
    viewBox="0 0 60 42"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="kind === 'AND'">
      <path d="M15 7h14a14 14 0 0 1 0 28H15zM4 13h11M4 29h11m28-8h13" />
    </template>
    <template v-else-if="kind === 'OR' || kind === 'XOR'">
      <path d="M14 7q11 14 0 28 25 2 33-14Q39 5 14 7zM4 13h14M4 29h14m29-8h9" />
      <path v-if="kind === 'XOR'" d="M8 7q11 14 0 28" />
    </template>
    <template v-else-if="kind === 'NOT'">
      <path d="m15 6 26 15-26 15zM4 21h11m34 0h7" />
      <circle cx="45" cy="21" r="4" />
    </template>
    <template v-else-if="kind === 'INPUT'">
      <rect x="8" y="11" width="40" height="22" rx="11" />
      <circle cx="36" cy="22" r="6" fill="currentColor" stroke="none" />
      <path d="M48 22h8" />
    </template>
    <template v-else>
      <path d="M24 31h12m-10 5h8M22 26a13 13 0 1 1 16 0l-2 5H24z" />
      <path d="M30 1v-3M12 7 8 3m40 4 4-4" />
    </template>
  </svg>
</template>
