import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Node for the pure logic suites. A `.tsx` test that needs a DOM opts in
    // per file with `@vitest-environment jsdom` (Vitest 4 removed
    // environmentMatchGlobs).
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
})
