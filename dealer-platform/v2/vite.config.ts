import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: 'dist'
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
