/**
 * A one-line indirection around the `vite-plugin-pwa` virtual module.
 *
 * `virtual:pwa-register` only resolves under the real Vite build/dev pipeline
 * — the plugin that provides it is not registered in `vitest.config.ts`, so
 * any file that imports the virtual specifier directly cannot be loaded by a
 * test runner at all, mockable or not. Isolating the import here means a test
 * can replace this whole module (`vi.doMock('@/lib/sw-register', ...)`)
 * without Vite ever attempting to resolve the virtual specifier.
 */
export { registerSW } from 'virtual:pwa-register'
