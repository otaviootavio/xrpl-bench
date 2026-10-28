/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ restoreOpenLocks: async () => [], endLockSession: async () => {}, endAllLockSessions: async () => {} }))
vi.mock('@/pages/Onboarding', () => ({ Onboarding: () => null }))
vi.mock('@/hooks/useAppUpdate', () => ({ useAppUpdate: () => ({ updateReady: false, declined: false }) }))
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0', commitSha: 'x', builtAt: '' }, shortSha: 'x', sourceUrl: 'https://example.invalid', formatBuiltAt: () => '' }))
vi.mock('@/pages/Main', () => ({ Main: () => null }))
vi.mock('@/components/AppHeader', () => ({ AppHeader: () => null }))

/** Notices are scoped to the wallet in view, recomputed on store AND route changes (App.tsx, module scope). */
describe('notice scoping', () => {
  beforeEach(() => {
    vi.resetModules()
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('a notice about wallet a goes when another wallet is in view; app-level notices stay', async () => {
    await import('@/App')
    const { useAppStore } = await import('@/store/app-store')
    const { useNoticeStore } = await import('@/store/notice-store')
    const { toast } = await import('@/lib/notify')
    const messages = () => useNoticeStore.getState().notices.map((n) => n.message)

    // On a wallet route the wallet in view is the active one; on the chooser it is none (AD-34).
    window.history.replaceState(null, '', '/wallets/a')
    useAppStore.setState({ activeWalletId: 'a' })
    toast.error('About A.')
    useAppStore.setState({ activeWalletId: null })
    toast.error('About the app.')
    useAppStore.setState({ activeWalletId: 'a' })
    expect(messages()).toEqual(['About the app.'])
    toast.error('About A again.')
    useAppStore.setState({ activeWalletId: 'b' })
    expect(messages()).toEqual(['About the app.'])
  })

  it('a notice about the wallet left goes when the route returns to the chooser', async () => {
    await import('@/App')
    const { useAppStore } = await import('@/store/app-store')
    const { useNoticeStore } = await import('@/store/notice-store')
    const { toast } = await import('@/lib/notify')
    const { leaveToChooser } = await import('@/lib/route')
    window.history.replaceState(null, '', '/wallets/a')
    useAppStore.setState({ activeWalletId: 'a' })
    toast.error('About A.')
    expect(useNoticeStore.getState().notices).toHaveLength(1)
    leaveToChooser()
    expect(useNoticeStore.getState().notices).toHaveLength(0)
  })
})
