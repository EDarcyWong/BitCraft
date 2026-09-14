<script setup lang="ts">
defineProps<{ name: string; size?: number }>()
const paths: Record<string, string> = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  circuit: 'M4 5h6v6h10 M4 19h6v-8 M4 3v4 M4 17v4 M20 9v4',
  flag: 'M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0',
  folder: 'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  book: 'M12 5v16M12 5C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-2-1-6-2-10 1z',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  chevron: 'm9 5 7 7-7 7',
  close: 'm6 6 12 12M6 18 18 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  undo: 'm9 4-6 6 6 6M3 10h11a7 7 0 0 1 7 7v3',
  redo: 'm15 4 6 6-6 6m6-6H10a7 7 0 0 0-7 7v3',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  save: 'M4 3h13l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5',
  cursor: 'm5 3 14 9-7 1-3 7z',
  hand: 'M8 12V5a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v9c0 7-10 7-12 3l-5-7a2 2 0 0 1 3-2l2 2',
  fit: 'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6M8 8h8v8H8z',
  bulb: 'M9 18h6m-5 3h4M8 15c-6-6-2-12 4-12s10 6 4 12l-1 3H9z',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-7z',
  help: 'M9 9c0-5 8-5 7 0 0 2-4 2-4 5m0 3v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  play: 'm7 4 14 8-14 8z',
  trophy: 'M8 3h8v7a4 4 0 0 1-8 0zM8 5H3v3a4 4 0 0 0 5 4m8-7h5v3a4 4 0 0 1-5 4M12 14v5m-5 2h10m-7-2h4',
  search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  reset: 'M3 10a9 9 0 1 1 1 7M3 3v7h7',
  spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
  info: 'M12 11v6m0-10v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  sound: 'M12 3v18l-7-6H2V9h3zm4 4c4 3 4 7 0 10m3-13c6 5 6 11 0 16',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zm7 4v3',
}
</script>

<template>
  <svg
    :width="size ?? 20"
    :height="size ?? 20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] ?? paths.circuit" />
  </svg>
</template>
