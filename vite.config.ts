import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: { port: 5177, strictPort: true },
  preview: { port: 4177, strictPort: true },
  test: { include: ['tests/**/*.test.ts'] },
})
