/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { blockLeaving } from '../route'
import { launchFromConfigure, peekConfigureFocusReturn, resetConfigureFocusReturn } from '../configure-launch'

afterEach(() => {
  resetConfigureFocusReturn()
  window.history.replaceState(null, '', '/')
})

describe('the Configure launch', () => {
  it('a launch navigates and remembers the key to focus on return', () => {
    launchFromConfigure('/wallets/a/checks', 'edit-checks')
    expect(peekConfigureFocusReturn()).toBe('edit-checks')
    expect(window.location.pathname).toBe('/wallets/a/checks')
  })

  it('a navigation a leave-blocker refused leaves nothing behind', () => {
    window.history.replaceState(null, '', '/wallets/a/configure')
    const release = blockLeaving()
    launchFromConfigure('/wallets/a/checks', 'edit-checks')
    release()
    expect(window.location.pathname).toBe('/wallets/a/configure')
    expect(peekConfigureFocusReturn()).toBeNull()
  })

  it('resetting the focus return lands the next entry fresh', () => {
    launchFromConfigure('/wallets/a/checks', 'edit-checks')
    resetConfigureFocusReturn()
    expect(peekConfigureFocusReturn()).toBeNull()
  })

  it('keeps no one-shot marker: the Back label is always `Back to Configure`', async () => {
    const mod = await import('../configure-launch')
    expect(Object.keys(mod).sort()).toEqual(['launchFromConfigure', 'peekConfigureFocusReturn', 'resetConfigureFocusReturn'])
  })
})
