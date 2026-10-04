import { describe, expect, it, vi } from 'vitest'
import { createSwRegistry, type SwRegisterOptions, type UpdateSW } from '../sw-register-core'

/**
 * AD-11: one service-worker registration path. Two callers ask — `main.tsx`
 * and `useAppUpdate` — and before this the app registered twice, once from
 * each. This suite covers `sw-register-core.ts`, the registry itself, with a
 * fake `registerSW` passed in: `sw-register.ts` is three lines of wiring
 * around the `virtual:pwa-register` specifier, which no test runner can
 * resolve, so that it is the ONE importer is enforced by
 * `scripts/check-sw-register.mjs` instead (see `sw-register-guard.test.ts`).
 */
function fakeRegisterSW() {
  let captured: SwRegisterOptions | undefined
  const updateSW: UpdateSW = vi.fn(async () => {})
  const registerSW = vi.fn((options?: SwRegisterOptions) => {
    captured = options
    return updateSW
  })
  return { registerSW, updateSW, options: () => captured }
}

describe('the service-worker registry', () => {
  it('registers once however many callers ask, and hands back the same result', () => {
    const fake = fakeRegisterSW()
    const registry = createSwRegistry(fake.registerSW)

    const first = registry.register()
    const second = registry.register()
    const third = registry.register()

    expect(fake.registerSW).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(first).toBe(fake.updateSW)
  })

  it('registers immediately, as the app shell cache requires', () => {
    const fake = fakeRegisterSW()
    createSwRegistry(fake.registerSW).register()
    expect(fake.options()?.immediate).toBe(true)
  })

  it('does not register until somebody asks', () => {
    const fake = fakeRegisterSW()
    createSwRegistry(fake.registerSW)
    expect(fake.registerSW).not.toHaveBeenCalled()
  })

  it('still registers only once when the plugin hands back nothing usable', () => {
    // Memoising on the truthiness of the result would let every caller
    // register again here, which is the double registration AD-11 forbids.
    const registerSW = vi.fn(() => undefined as unknown as UpdateSW)
    const registry = createSwRegistry(registerSW)

    registry.register()
    registry.register()

    expect(registerSW).toHaveBeenCalledTimes(1)
  })

  it('exposes the registration the plugin reports back', () => {
    const fake = fakeRegisterSW()
    const registry = createSwRegistry(fake.registerSW)
    registry.register()
    expect(registry.getRegistration()).toBeUndefined()

    const reg = {} as ServiceWorkerRegistration
    fake.options()?.onRegisteredSW?.('sw.js', reg)
    expect(registry.getRegistration()).toBe(reg)
  })

  it('records a waiting worker and never applies it', () => {
    const fake = fakeRegisterSW()
    const registry = createSwRegistry(fake.registerSW)
    registry.register()
    expect(registry.isUpdateWaiting()).toBe(false)

    fake.options()?.onNeedRefresh?.()

    expect(registry.isUpdateWaiting()).toBe(true)
    // US-2: the running code is not replaced until the user asks.
    expect(fake.updateSW).not.toHaveBeenCalled()
  })

  it('notifies subscribers when a worker starts waiting, and stops on unsubscribe', () => {
    const fake = fakeRegisterSW()
    const registry = createSwRegistry(fake.registerSW)
    registry.register()
    const listener = vi.fn()
    const unsubscribe = registry.subscribeToWaitingUpdate(listener)

    expect(listener).not.toHaveBeenCalled()
    fake.options()?.onNeedRefresh?.()
    expect(listener).toHaveBeenCalledWith(true)

    unsubscribe()
    fake.options()?.onNeedRefresh?.()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('tells a late subscriber that a worker is already waiting', () => {
    // The whole point of the registry owning the callbacks: the caller that
    // cares about the update flow may mount long after the worker installed.
    const fake = fakeRegisterSW()
    const registry = createSwRegistry(fake.registerSW)
    registry.register()
    fake.options()?.onNeedRefresh?.()

    const listener = vi.fn()
    registry.subscribeToWaitingUpdate(listener)
    expect(listener).toHaveBeenCalledWith(true)
  })

  it('wires the update callbacks regardless of which caller registered first', () => {
    // The bare `main.tsx`-shaped call used to pass no callbacks at all. If it
    // wins the race, the update prompt must still work.
    const fake = fakeRegisterSW()
    const registry = createSwRegistry(fake.registerSW)
    registry.register() // the entry point, wanting only the shell cached
    registry.register() // the update hook, later

    const listener = vi.fn()
    registry.subscribeToWaitingUpdate(listener)
    fake.options()?.onNeedRefresh?.()

    expect(fake.registerSW).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(true)
    expect(registry.isUpdateWaiting()).toBe(true)
  })
})

/**
 * Story 7.3. G-26 filed "the waiting flag never returns to false" as a defect;
 * it was refuted on 2026-09-15. After an activation that fails, the new worker
 * is genuinely still waiting, so `true` is the true answer — clearing it would
 * be AD-15 ("an empty state is a claim, not a default") inverted. These tests
 * are named for that reason so nobody "fixes" correct behaviour into a lie.
 */
describe('a failed update activation keeps telling the truth about what is waiting', () => {
  function registryWhoseActivationRejects() {
    let options: SwRegisterOptions | undefined
    const updateSW: UpdateSW = vi.fn(async () => {
      throw new Error('activation failed')
    })
    const registry = createSwRegistry((o) => {
      options = o
      return updateSW
    })
    const activate = registry.register()
    options?.onNeedRefresh?.()
    return { registry, activate }
  }

  it('still reports a waiting worker after an activation that rejects, because one still is (AD-15, G-26 refuted)', async () => {
    const { registry, activate } = registryWhoseActivationRejects()
    expect(registry.isUpdateWaiting()).toBe(true)

    // The `applyUpdate` path: activate the waiting worker, and it fails.
    await expect(activate(true)).rejects.toThrow('activation failed')

    expect(
      registry.isUpdateWaiting(),
      'AD-15: a worker whose activation failed is still waiting — reporting "nothing waiting" would claim an empty state that was never established (why G-26 was refuted)',
    ).toBe(true)
  })

  it('still tells a subscriber that arrives after the failed activation that a worker is waiting (AD-15)', async () => {
    const { registry, activate } = registryWhoseActivationRejects()
    await activate(true).catch(() => {})

    const listener = vi.fn()
    registry.subscribeToWaitingUpdate(listener)
    expect(listener, 'AD-15: a late subscriber must still learn that the worker is waiting').toHaveBeenCalledWith(true)
  })
})
