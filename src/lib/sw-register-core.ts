/**
 * The service-worker registration rule, with no Vite virtual module in sight.
 *
 * AD-11 says there is ONE registration path. Two callers ask for it — the app
 * entry point (`main.tsx`, which only wants the shell cached) and
 * `useAppUpdate` (which wants the waiting-worker lifecycle). Memoising on
 * "first caller wins" would make the update prompt depend on module evaluation
 * order: whichever call happened to run first would decide whether
 * `onNeedRefresh` was ever wired. So the registry owns the callbacks itself and
 * hands the results out through subscriptions — the order callers arrive in
 * cannot change the outcome, and a subscriber that arrives after a worker is
 * already waiting is told immediately.
 *
 * This file deliberately imports nothing. `virtual:pwa-register` only resolves
 * under the real Vite pipeline, so the logic lives here where a test runner can
 * load it and pass a fake `registerSW` in.
 */

/** The reload callback `registerSW` returns. */
export type UpdateSW = (reloadPage?: boolean) => Promise<void>

export interface SwRegisterOptions {
  immediate?: boolean
  onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void
  onNeedRefresh?: () => void
}

export type RegisterSWFn = (options?: SwRegisterOptions) => UpdateSW

export interface SwRegistry {
  /** Registers on the first call; every later call returns the same result. */
  register: () => UpdateSW
  getRegistration: () => ServiceWorkerRegistration | undefined
  /** True once a new worker has installed and is waiting. */
  isUpdateWaiting: () => boolean
  /** Fires on transition to waiting, and immediately if already waiting. */
  subscribeToWaitingUpdate: (listener: (waiting: boolean) => void) => () => void
}

export function createSwRegistry(registerSW: RegisterSWFn): SwRegistry {
  let updateSW: UpdateSW | null = null
  // Memoised on an explicit flag set only AFTER a successful call, not on the
  // truthiness of the result: a `registerSW` that returns nothing would
  // otherwise let every caller register again, and a `registerSW` that throws
  // must leave the registry able to try once more rather than recording a
  // registration that never happened.
  let registered = false
  let registration: ServiceWorkerRegistration | undefined
  let waiting = false
  const listeners = new Set<(waiting: boolean) => void>()

  return {
    register() {
      if (registered) return updateSW as UpdateSW
      const result = registerSW({
        immediate: true,
        onRegisteredSW(_url, reg) {
          registration = reg
        },
        onNeedRefresh() {
          // Recorded, never applied: US-2 says the running code is not
          // replaced until the user asks.
          //
          // Deliberately never set back to false — not even when an
          // activation fails. After a failed `applyUpdate` the new worker is
          // genuinely still waiting, so `true` is the true answer; clearing it
          // would make the app claim no update is waiting while one is, which
          // is AD-15 ("an empty state is a claim, not a default") inverted.
          // `useAppUpdate` makes the control usable again instead
          // (`setApplying(false)`). G-26 proposed the clear and was refuted on
          // 2026-09-15; `sw-register-core.test.ts` and `useAppUpdate.test.tsx`
          // fail if it comes back.
          waiting = true
          listeners.forEach((l) => l(true))
        },
      })
      updateSW = result
      registered = true
      return updateSW
    },
    getRegistration: () => registration,
    isUpdateWaiting: () => waiting,
    subscribeToWaitingUpdate(listener) {
      listeners.add(listener)
      if (waiting) listener(true)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
