import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { useNoticeStore } from '@/store/notice-store'
import { toast } from '../notify'

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
})
