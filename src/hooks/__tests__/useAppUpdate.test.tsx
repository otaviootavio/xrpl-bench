/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

/**
 * app-versioning-and-updates.md US-6/V4: "a major release presents the
 * update more insistently — a persistent, clearly-worded notice — while
 * minor and patch releases surface quietly in Settings." Before this test
 * existed, the only bump-dependent behaviour was a louder `Alert` variant
 * *inside* the Settings tab's Version card — invisible to anyone who has not
 * already opened Settings, which is not "more insistently" than a quiet
 * indicator. These tests pin the real Annunciator notice this hook now
 * raises for major/security releases, and its interaction with decline
 * (US-4) and with minor/patch staying quiet.
 *
 * `@/lib/sw-register` (the single registration path around the
 * `virtual:pwa-register` Vite plugin module, which this test runner cannot
 * resolve at all) and `@/lib/release-check` are mocked per test via
 * `vi.doMock` + `vi.resetModules`, because `useAppUpdate` registers its
 * service worker and its `onNeedRefresh` callback at MODULE scope (so
 * StrictMode's double-invoke can't register two workers) — the only way to
 * get a fresh, per-test-controllable module instance is to re-import it.
 * `@/store/app-store` is mocked too: it persists via `idb-keyval`, which has
 * no jsdom implementation, and this suite is testing the notice, not the
 * store.
 */
describe('useAppUpdate — insistent notice for major/security releases', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  interface FakeManifest {
    version: string
    commit: string
    releasedAt: string
    bump: 'major' | 'minor' | 'patch'
    security: boolean
    notes: string
    verify: string
  }

  async function setup(manifest: FakeManifest) {
    const declinedUpdateVersions: string[] = []
    const declineUpdateVersion = vi.fn((v: string) => declinedUpdateVersions.push(v))

    // AD-11: the hook no longer registers the worker itself — it asks the
    // single registry in `@/lib/sw-register` and subscribes to it. The mock
    // stands in for that registry, and `onNeedRefresh` here is the trigger the
    // real registry would fire when a new worker installs and waits.
    const waitingListeners = new Set<(v: boolean) => void>()
    let waiting = false
    const onNeedRefresh = () => {
      waiting = true
      waitingListeners.forEach((l) => l(true))
    }
    const updateSW = vi.fn(async () => {})
    const registerServiceWorker = vi.fn(() => updateSW)
    const subscribeToWaitingUpdate = vi.fn((listener: (v: boolean) => void) => {
      waitingListeners.add(listener)
      if (waiting) listener(true)
      return () => {
        waitingListeners.delete(listener)
      }
    })
    vi.doMock('@/lib/sw-register', () => ({
      registerServiceWorker,
      getServiceWorkerRegistration: () => ({}) as ServiceWorkerRegistration,
      isUpdateWaiting: () => waiting,
      subscribeToWaitingUpdate,
    }))
    vi.doMock('@/lib/release-check', () => ({
      checkForRelease: vi.fn(async () => ({ ok: true, manifest })),
    }))
    vi.doMock('@/store/app-store', () => ({
      useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({ txInFlight: false, declinedUpdateVersions, declineUpdateVersion }),
    }))
    // `build-info.ts` reads `__APP_VERSION__`/`__COMMIT_SHA__`/`__BUILD_DATE__`,
    // globals injected by `vite.config.ts`'s `define` at real build/dev time
    // only; vitest never defines them. `checkForUpdate` is the sole consumer
    // in this hook and isn't exercised here, so the mock only needs to satisfy
    // the import, not carry real values.
    vi.doMock('@/lib/build-info', () => ({
      BUILD: { version: '0.0.0-test', commitSha: '0'.repeat(40), builtAt: '2026-01-01T00:00:00.000Z' },
    }))

    const { useAppUpdate } = await import('../useAppUpdate')
    const { useNoticeStore } = await import('@/store/notice-store')
    const hook = renderHook(() => useAppUpdate())

    act(() => {
      onNeedRefresh()
    })
    await waitFor(() => expect(hook.result.current.updateReady).toBe(true))
    await waitFor(() => expect(hook.result.current.pendingRelease).toEqual(manifest))

    return { hook, useNoticeStore, declinedUpdateVersions, registerServiceWorker, subscribeToWaitingUpdate, updateSW }
  }

  it('raises a persistent warning notice for a major release', async () => {
    const manifest: FakeManifest = {
      version: '2.0.0',
      commit: 'a'.repeat(40),
      releasedAt: '2026-01-01T00:00:00.000Z',
      bump: 'major',
      security: false,
      notes: 'https://example.com/notes',
      verify: 'https://example.com#security',
    }
    const { useNoticeStore } = await setup(manifest)

    await waitFor(() => {
      const notices = useNoticeStore.getState().notices
      expect(notices).toHaveLength(1)
      expect(notices[0]).toMatchObject({ tone: 'warning', persistent: true })
      expect(notices[0].message).toContain('major update')
      expect(notices[0].message).toContain('2.0.0')
    })
  })

  it('raises the notice for a security release even when the bump is patch', async () => {
    const manifest: FakeManifest = {
      version: '1.0.1',
      commit: 'b'.repeat(40),
      releasedAt: '2026-01-01T00:00:00.000Z',
      bump: 'patch',
      security: true,
      notes: 'https://example.com/notes',
      verify: 'https://example.com#security',
    }
    const { useNoticeStore } = await setup(manifest)

    await waitFor(() => {
      const notices = useNoticeStore.getState().notices
      expect(notices).toHaveLength(1)
      expect(notices[0].message).toContain('security update')
    })
  })

  it('stays quiet in the Annunciator for an ordinary minor/patch release', async () => {
    const manifest: FakeManifest = {
      version: '1.1.0',
      commit: 'c'.repeat(40),
      releasedAt: '2026-01-01T00:00:00.000Z',
      bump: 'minor',
      security: false,
      notes: 'https://example.com/notes',
      verify: 'https://example.com#security',
    }
    const { useNoticeStore } = await setup(manifest)

    // Give the (absent) effect a tick to have fired if it were going to.
    await act(async () => {
      await Promise.resolve()
    })
    expect(useNoticeStore.getState().notices).toHaveLength(0)
  })

  it('declining the update also dismisses its insistent notice (US-4: not re-prompted)', async () => {
    const manifest: FakeManifest = {
      version: '3.0.0',
      commit: 'd'.repeat(40),
      releasedAt: '2026-01-01T00:00:00.000Z',
      bump: 'major',
      security: false,
      notes: 'https://example.com/notes',
      verify: 'https://example.com#security',
    }
    const { hook, useNoticeStore, declinedUpdateVersions } = await setup(manifest)

    await waitFor(() => expect(useNoticeStore.getState().notices).toHaveLength(1))

    act(() => {
      hook.result.current.declineCurrent()
    })

    expect(declinedUpdateVersions).toContain(manifest.commit)
    expect(useNoticeStore.getState().notices).toHaveLength(0)
  })

  it('takes its worker and its waiting state from the shared registry (AD-11)', async () => {
    const manifest: FakeManifest = {
      version: '1.2.0',
      commit: 'e'.repeat(40),
      releasedAt: '2026-01-01T00:00:00.000Z',
      bump: 'minor',
      security: false,
      notes: 'https://example.com/notes',
      verify: 'https://example.com#security',
    }
    const { hook, registerServiceWorker, subscribeToWaitingUpdate, updateSW } = await setup(manifest)

    // The hook does not register a second worker and does not track the
    // waiting flag itself — it asks the one registry and subscribes to it.
    expect(registerServiceWorker).toHaveBeenCalledTimes(1)
    expect(subscribeToWaitingUpdate).toHaveBeenCalledTimes(1)

    // And the action that swaps the running code calls the function that
    // single registration returned, not one of its own.
    await act(async () => {
      await hook.result.current.applyUpdate()
    })
    expect(updateSW).toHaveBeenCalledWith(true)
  })
})

const minorRelease = {
  version: '1.3.0',
  commit: 'f'.repeat(40),
  releasedAt: '2026-01-01T00:00:00.000Z',
  bump: 'minor' as const,
  security: false,
  notes: 'https://example.com/notes',
  verify: 'https://example.com#security',
}

/**
 * Story 7.2's second half: `applyUpdate` reads `txInFlight` as its sole
 * interlock (US-5). The choke point now keeps that flag raised until the LAST
 * of several overlapping writes settles (`writes.test.ts`); this pins that the
 * hook, given the raised flag, refuses to activate the waiting worker.
 */
describe('useAppUpdate — refuses to activate while a transaction is in flight', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('does not activate the waiting worker, and says why, while txInFlight is raised', async () => {
    const { hook, updateSW } = await setupHook({ txInFlight: true })

    await act(async () => {
      await hook.result.current.applyUpdate()
    })

    expect(updateSW, 'US-5/AD-9: an update must never activate with a transaction in flight').not.toHaveBeenCalled()
    expect(hook.result.current.applying).toBe(false)
    expect(hook.result.current.blockedReason).toMatch(/transaction is in progress/)
  })
})

/**
 * Story 7.3. When activation fails, two things must hold TOGETHER: the control
 * becomes available again (`applying` back to false), and the prompt keeps
 * showing (`updateReady` stays true) — because a worker genuinely is still
 * waiting. Either half alone is a defect: a stranded control, or a prompt that
 * claims nothing is waiting while something is (AD-15 inverted; G-26 refuted).
 */
describe('useAppUpdate — a failed activation keeps telling the truth about what is waiting', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('makes the control available again AND keeps the prompt showing, because the worker is still waiting (AD-15)', async () => {
    const { hook, updateSW } = await setupHook({
      updateSW: async () => {
        throw new Error('activation failed')
      },
    })

    await act(async () => {
      await hook.result.current.applyUpdate()
    })

    expect(updateSW).toHaveBeenCalledWith(true)
    expect(hook.result.current.applying, 'after a failed activation the control must be usable again, not stranded').toBe(false)
    expect(
      hook.result.current.updateReady,
      'AD-15: the worker whose activation failed is still waiting — hiding the prompt would claim nothing is waiting while something is (G-26 was refuted for exactly this)',
    ).toBe(true)
  })
})

/**
 * The same registry/store/release mocks as the first suite's `setup`, with
 * the store's `txInFlight` and the activation's outcome controllable.
 */
async function setupHook(opts: { txInFlight?: boolean; updateSW?: () => Promise<void> } = {}) {
  let waiting = false
  const listeners = new Set<(v: boolean) => void>()
  const updateSW = vi.fn(opts.updateSW ?? (async () => {}))
  vi.doMock('@/lib/sw-register', () => ({
    registerServiceWorker: () => updateSW,
    getServiceWorkerRegistration: () => ({}) as ServiceWorkerRegistration,
    isUpdateWaiting: () => waiting,
    subscribeToWaitingUpdate: (listener: (v: boolean) => void) => {
      listeners.add(listener)
      if (waiting) listener(true)
      return () => {
        listeners.delete(listener)
      }
    },
  }))
  vi.doMock('@/lib/release-check', () => ({
    checkForRelease: vi.fn(async () => ({ ok: true, manifest: minorRelease })),
  }))
  vi.doMock('@/store/app-store', () => ({
    useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ txInFlight: opts.txInFlight ?? false, declinedUpdateVersions: [], declineUpdateVersion: vi.fn() }),
  }))
  vi.doMock('@/lib/build-info', () => ({
    BUILD: { version: '0.0.0-test', commitSha: '0'.repeat(40), builtAt: '2026-01-01T00:00:00.000Z' },
  }))

  const { useAppUpdate } = await import('../useAppUpdate')
  const hook = renderHook(() => useAppUpdate())
  act(() => {
    waiting = true
    listeners.forEach((l) => l(true))
  })
  await waitFor(() => expect(hook.result.current.updateReady).toBe(true))
  return { hook, updateSW }
}
