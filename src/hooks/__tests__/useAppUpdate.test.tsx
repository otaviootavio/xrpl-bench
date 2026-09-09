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
 * `@/lib/sw-register` (the one-line indirection around the
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
    let onNeedRefresh: (() => void) | undefined
    const declinedUpdateVersions: string[] = []
    const declineUpdateVersion = vi.fn((v: string) => declinedUpdateVersions.push(v))

    vi.doMock('@/lib/sw-register', () => ({
      registerSW: (opts: { onRegisteredSW?: (url: string, reg: unknown) => void; onNeedRefresh?: () => void }) => {
        onNeedRefresh = opts.onNeedRefresh
        opts.onRegisteredSW?.('sw.js', {})
        return vi.fn(async () => {})
      },
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
      onNeedRefresh?.()
    })
    await waitFor(() => expect(hook.result.current.updateReady).toBe(true))
    await waitFor(() => expect(hook.result.current.pendingRelease).toEqual(manifest))

    return { hook, useNoticeStore, declinedUpdateVersions }
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
})
