import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { useNoticeStore } from '@/store/notice-store'
import { setNoticeWalletReader, toast } from '../notify'

/**
 * docs/decisions.md §6.5: errors and warnings persist until dismissed;
 * success and info clear themselves. This is the one behaviour that must
 * survive every rewrite of the renderer underneath `toast` — sonner's own
 * default, then the S16 store-backed replacement.
 */
describe('notify (toast)', () => {
  beforeEach(() => {
    useNoticeStore.setState({ notices: [] })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('error notices never auto-dismiss', () => {
    toast.error('Unlock failed.')
    vi.advanceTimersByTime(60_000)
    expect(useNoticeStore.getState().notices).toHaveLength(1)
  })

  it('warning notices never auto-dismiss', () => {
    toast.warning('This transaction expired before validating.')
    vi.advanceTimersByTime(60_000)
    expect(useNoticeStore.getState().notices).toHaveLength(1)
  })

  it('success notices clear themselves', () => {
    toast.success('Wallet imported.')
    expect(useNoticeStore.getState().notices).toHaveLength(1)
    vi.advanceTimersByTime(10_000)
    expect(useNoticeStore.getState().notices).toHaveLength(0)
  })

  it('info notices clear themselves', () => {
    toast.info('Heads up.')
    vi.advanceTimersByTime(10_000)
    expect(useNoticeStore.getState().notices).toHaveLength(0)
  })

  it('carries an optional description alongside the message', () => {
    toast.error('Failed.', { description: 'more detail' })
    const [notice] = useNoticeStore.getState().notices
    expect(notice.message).toBe('Failed.')
    expect(notice.description).toBe('more detail')
  })

  it('maps each type to its own tone and legend', () => {
    toast.success('a')
    toast.info('b')
    toast.error('c')
    toast.warning('d')
    const [success, info, error, warning] = useNoticeStore.getState().notices
    expect(success.tone).toBe('success')
    expect(success.legend).toBe('Confirmed')
    expect(info.tone).toBe('default')
    expect(error.tone).toBe('destructive')
    expect(warning.tone).toBe('warning')
  })

  it('errors still never auto-dismiss when they carry an action or a Wallet', () => {
    setNoticeWalletReader(() => 'w1')
    toast.error('Send failed.', { action: 'send' })
    vi.advanceTimersByTime(60_000)
    expect(useNoticeStore.getState().notices).toHaveLength(1)
    setNoticeWalletReader(() => null)
  })
})

describe('notices taken back when they stop being true', () => {
  beforeEach(() => {
    useNoticeStore.setState({ notices: [] })
    vi.useFakeTimers()
  })
  afterEach(() => {
    setNoticeWalletReader(() => null)
    vi.useRealTimers()
  })
  const messages = () => useNoticeStore.getState().notices.map((n) => n.message)

  it('a new attempt of an action takes back that action\'s notices, and only those', () => {
    toast.error('The send was refused.', { action: 'send' })
    toast.warning('Expired.', { action: 'send' })
    toast.error('Incorrect PIN.', { action: 'unlock' })
    toast.error('The update could not be checked.')
    toast.resolve('send')
    expect(messages()).toEqual(['Incorrect PIN.', 'The update could not be checked.'])
  })

  it('switching Wallet takes back the notices about another Wallet and keeps the app\'s own', () => {
    setNoticeWalletReader(() => 'a')
    toast.error('About A.')
    setNoticeWalletReader(() => 'b')
    toast.error('About B.')
    setNoticeWalletReader(() => null)
    toast.error('About the app.')

    toast.scopeToWallet('b')
    expect(messages()).toEqual(['About B.', 'About the app.'])
    toast.scopeToWallet(null)
    expect(messages()).toEqual(['About the app.'])
  })
})
