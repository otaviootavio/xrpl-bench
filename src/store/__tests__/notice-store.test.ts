import { describe, expect, it, beforeEach } from 'vitest'
import { useNoticeStore } from '../notice-store'

describe('useNoticeStore', () => {
  beforeEach(() => {
    useNoticeStore.setState({ notices: [] })
  })

  it('pushes a notice and returns its id', () => {
    const id = useNoticeStore.getState().push({
      tone: 'destructive',
      legend: 'Error',
      message: 'Send failed.',
      persistent: true,
    })
    const { notices } = useNoticeStore.getState()
    expect(notices).toHaveLength(1)
    expect(notices[0].id).toBe(id)
    expect(notices[0].message).toBe('Send failed.')
  })

  it('dismiss removes only the targeted notice', () => {
    const first = useNoticeStore.getState().push({ tone: 'success', legend: 'Confirmed', message: 'A', persistent: false })
    const second = useNoticeStore.getState().push({ tone: 'warning', legend: 'Caution', message: 'B', persistent: true })
    useNoticeStore.getState().dismiss(first)
    const { notices } = useNoticeStore.getState()
    expect(notices).toHaveLength(1)
    expect(notices[0].id).toBe(second)
  })

  it('dismissing an id that is not present is a no-op', () => {
    useNoticeStore.getState().push({ tone: 'default', legend: 'Notice', message: 'A', persistent: false })
    useNoticeStore.getState().dismiss('not-a-real-id')
    expect(useNoticeStore.getState().notices).toHaveLength(1)
  })
})
