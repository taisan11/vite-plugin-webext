import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  platform: 'node',
  target: 'node18',
  deps: {
    onlyBundle: false,
    neverBundle: ['vite'],
  },
})
