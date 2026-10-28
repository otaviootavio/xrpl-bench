/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ restoreOpenLocks: async () => [], endLockSession: async () => {}, endAllLockSessions: async () => {} }))
vi.mock('@/pages/Onboarding', () => ({ Onboarding: () => null }))
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
})
