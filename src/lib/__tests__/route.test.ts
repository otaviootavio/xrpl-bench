/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ADD_WALLET_PATH, blockLeaving, leaveScreen, navigate, parseRoute, resetToHome, subscribeRoute, walletScreenPath } from '../route'

describe('parseRoute', () => {
  it('knows the four screens and nothing else', () => {
    expect(parseRoute('/')).toEqual({ screen: 'home' })
    expect(parseRoute(ADD_WALLET_PATH)).toEqual({ screen: 'add-wallet' })
    expect(parseRoute('/wallets/abc/checks')).toEqual({ screen: 'edit-checks', walletId: 'abc' })
    expect(parseRoute('/wallets/abc/two-device')).toEqual({ screen: 'two-device', walletId: 'abc' })
    expect(parseRoute('/wallets/abc/control')).toEqual({ screen: 'control', walletId: 'abc' })
  })

  it('round-trips a Wallet id through its path', () => {
    for (const screen of ['edit-checks', 'two-device', 'control'] as const) {
      expect(parseRoute(walletScreenPath(screen, 'a b/c'))).toEqual({ screen, walletId: 'a b/c' })
    }
  })

  it.each(['/wallets', '/wallets/abc', '/wallets/abc/other', '/wallets/new/extra', '/wallets/%E0%A4%A/checks', '/elsewhere'])(
    'treats %s as the shell',
    (path) => {
      expect(parseRoute(path)).toEqual({ screen: 'home' })
    },
  )
})

describe('history', () => {
  let unsubscribe: () => void
  const seen = vi.fn()
  const settle = () => new Promise((r) => setTimeout(r, 20))

  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    seen.mockReset()
    unsubscribe = subscribeRoute(seen)
  })
  afterEach(() => unsubscribe())

  it('navigate pushes an entry whose state carries no data, and leaveScreen pops it', async () => {
    navigate(ADD_WALLET_PATH)
    expect(window.location.pathname).toBe('/wallets/new')
    expect(window.history.state).toEqual({ screen: true })
    leaveScreen()
    await settle()
    expect(window.location.pathname).toBe('/')
  })

  it('leaveScreen replaces a screen entered by a boot at its path', () => {
    window.history.replaceState(null, '', '/wallets/new')
    leaveScreen()
    expect(window.location.pathname).toBe('/')
  })

  it('while leaving is blocked, the browser Back is undone and navigate does nothing', async () => {
    navigate(walletScreenPath('edit-checks', 'w'))
    const release = blockLeaving()
    window.history.back()
    await settle()
    expect(window.location.pathname).toBe('/wallets/w/checks')
    navigate('/wallets/new')
    expect(window.location.pathname).toBe('/wallets/w/checks')
    // A screen's own exit still works: it is the screen that decides its work is done.
    leaveScreen()
    await settle()
    expect(window.location.pathname).toBe('/')
    release()
  })

  it('resetToHome replaces an unreachable location and says so', () => {
    window.history.replaceState(null, '', '/wallets/x/control')
    resetToHome()
    expect(window.location.pathname).toBe('/')
    expect(seen).toHaveBeenCalled()
  })
})
