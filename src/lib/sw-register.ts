/**
 * The one module that imports the `vite-plugin-pwa` virtual specifier — AD-11.
 *
 * `virtual:pwa-register` only resolves under the real Vite build/dev pipeline
 * — the plugin that provides it is not registered in `vitest.config.ts`, so
 * any file that imports the virtual specifier directly cannot be loaded by a
 * test runner at all, mockable or not. Isolating the import here means a test
 * can replace this whole module (`vi.doMock('@/lib/sw-register', ...)`)
 * without Vite ever attempting to resolve the virtual specifier; the rule this
 * module enforces is tested directly, on `sw-register-core.ts`.
 *
 * Nothing else imports `virtual:pwa-register`. Every caller — the app entry
 * point included — goes through the functions below, which share a single
 * registration.
 */
import { registerSW } from 'virtual:pwa-register'
import { createSwRegistry } from './sw-register-core'

const registry = createSwRegistry(registerSW)

/** Registers the service worker once; later calls return the same result. */
export const registerServiceWorker = registry.register
export const getServiceWorkerRegistration = registry.getRegistration
export const isUpdateWaiting = registry.isUpdateWaiting
export const subscribeToWaitingUpdate = registry.subscribeToWaitingUpdate

export type { UpdateSW } from './sw-register-core'
