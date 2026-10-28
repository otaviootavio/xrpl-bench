/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { blockLeaving } from '../route'
import { clearConfigureLaunch, launchFromConfigure, peekConfigureFocusReturn, peekConfigureLaunch, resetConfigureFocusReturn } from '../configure-launch'

afterEach(() => {
  clearConfigureLaunch()
  resetConfigureFocusReturn()
  window.history.replaceState(null, '', '/')
})

describe('the Configure launch marker', () => {
  it('a launch sets the marker and the key to focus on return', () => {
    launchFromConfigure('/wallets/a/checks', 'edit-checks')
    expect(peekConfigureLaunch()).toBe(true)
    expect(peekConfigureFocusReturn()).toBe('edit-checks')
    expect(window.location.pathname).toBe('/wallets/a/checks')
  })

  it('a navigation a leave-blocker refused leaves no marker behind', () => {
    window.history.replaceState(null, '', '/wallets/a/configure')
    const release = blockLeaving()
    launchFromConfigure('/wallets/a/checks', 'edit-checks')
    release()
    expect(window.location.pathname).toBe('/wallets/a/configure')
    expect(peekConfigureLaunch()).toBe(false)
    expect(peekConfigureFocusReturn()).toBeNull()
  })

  it('clearing the launch consumes it; resetting the focus return lands the next entry fresh', () => {
    launchFromConfigure('/wallets/a/checks', 'edit-checks')
    clearConfigureLaunch()
    expect(peekConfigureLaunch()).toBe(false)
    resetConfigureFocusReturn()
    expect(peekConfigureFocusReturn()).toBeNull()
  })
})
