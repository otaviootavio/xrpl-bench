/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADD_WALLET_PATH,
  blockLeaving,
  enteredWalletId,
  isTaskRoute,
  isWalletScreen,
  leaveScreen,
  leaveToChooser,
  navigate,
  parseRoute,
  pushOverlay,
  resetToHome,
  rewriteBootLocation,
  subscribeRoute,
  walletScreenPath,
  type Route,
} from '../route'

describe('parseRoute', () => {
  it('knows every screen', () => {
    expect(parseRoute('/')).toEqual({ screen: 'chooser' })
    expect(parseRoute('/settings')).toEqual({ screen: 'settings' })
    expect(parseRoute(ADD_WALLET_PATH)).toEqual({ screen: 'add-wallet' })
    expect(parseRoute('/wallets/a')).toEqual({ screen: 'wallet', walletId: 'a' })
    expect(parseRoute('/wallets/a/configure')).toEqual({ screen: 'configure', walletId: 'a' })
    expect(parseRoute('/wallets/a/checks')).toEqual({ screen: 'edit-checks', walletId: 'a' })
    expect(parseRoute('/wallets/a/two-device')).toEqual({ screen: 'two-device', walletId: 'a' })
    expect(parseRoute('/wallets/a/control')).toEqual({ screen: 'control', walletId: 'a' })
  })

  it('round-trips a Wallet id through its path', () => {
    for (const screen of ['wallet', 'configure', 'edit-checks', 'two-device', 'control'] as const) {
      expect(parseRoute(walletScreenPath(screen, 'a b/c'))).toEqual({ screen, walletId: 'a b/c' })
    }
  })

  it.each(['/wallets', '/wallets/abc/other', '/wallets/new/extra', '/wallets/a/checks/x', '/wallets/%E0%A4%A/checks', '/wallets//checks', '/settings/x', '/elsewhere'])(
    'treats %s as the chooser',
    (path) => {
      expect(parseRoute(path)).toEqual({ screen: 'chooser' })
    },
  )
})

describe('isWalletScreen', () => {
  it('splits in-wallet from chooser-side screens', () => {
    const inWallet = ['wallet', 'configure', 'edit-checks', 'two-device', 'control'] as const
    for (const screen of inWallet) expect(isWalletScreen({ screen, walletId: 'a' })).toBe(true)
    const outside: Route[] = [{ screen: 'chooser' }, { screen: 'settings' }, { screen: 'add-wallet' }]
    for (const route of outside) expect(isWalletScreen(route)).toBe(false)
  })
})

describe('isTaskRoute', () => {
  it('names the four routed task screens and nothing else', () => {
    const tasks: Route[] = [
      { screen: 'add-wallet' },
      { screen: 'edit-checks', walletId: 'a' },
      { screen: 'two-device', walletId: 'a' },
      { screen: 'control', walletId: 'a' },
    ]
    for (const route of tasks) expect(isTaskRoute(route)).toBe(true)
    const others: Route[] = [
      { screen: 'chooser' },
      { screen: 'settings' },
      { screen: 'wallet', walletId: 'a' },
      { screen: 'configure', walletId: 'a' },
    ]
    for (const route of others) expect(isTaskRoute(route)).toBe(false)
  })
})

describe('rewriteBootLocation', () => {
  it('clears a stale entry state left at / by a reload', () => {
    window.history.replaceState({ screen: true, depth: 2, overlay: true }, '', '/')
    rewriteBootLocation()
    expect(window.location.pathname).toBe('/')
    expect(window.history.state).toBeNull()
  })

  it('replaces any other path with / and clears state; idempotent at /', () => {
    window.history.replaceState({ screen: true, depth: 1 }, '', '/wallets/x/checks')
    rewriteBootLocation()
    expect(window.location.pathname).toBe('/')
    expect(window.history.state).toBeNull()
    window.history.replaceState({ keep: 1 }, '', '/settings')
    rewriteBootLocation()
    expect(window.location.pathname).toBe('/')
    const spy = vi.spyOn(window.history, 'replaceState')
    rewriteBootLocation()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
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
    expect(window.history.state).toEqual({ screen: true, depth: 1 })
    leaveScreen()
    await settle()
    expect(window.location.pathname).toBe('/')
  })

  it('an overlay entry keeps the screen flag, and leaveScreen pops both entries', async () => {
    navigate(ADD_WALLET_PATH)
    const release = pushOverlay(() => undefined)
    expect(window.history.state).toEqual({ screen: true, depth: 1, overlay: true })
    leaveScreen()
    await settle()
    expect(window.location.pathname).toBe('/')
    release()
    await settle()
    expect(window.location.pathname).toBe('/')
  })

  it('leaveScreen from a booted screen with an overlay open ends on the shell', async () => {
    window.history.replaceState(null, '', '/wallets/new')
    const release = pushOverlay(() => undefined)
    leaveScreen()
    await settle()
    expect(window.location.pathname).toBe('/')
    release()
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

  it('every pushed entry carries depth, one more than the entry beneath', () => {
    navigate('/settings')
    expect(window.history.state).toEqual({ screen: true, depth: 1 })
    navigate(walletScreenPath('wallet', 'a'))
    expect(window.history.state).toEqual({ screen: true, depth: 2 })
  })

  it('leaveToChooser unwinds the whole depth in one go and notifies', async () => {
    navigate('/settings')
    navigate(walletScreenPath('wallet', 'a'))
    navigate(walletScreenPath('configure', 'a'))
    const go = vi.spyOn(window.history, 'go')
    seen.mockClear()
    leaveToChooser()
    await settle()
    expect(go).toHaveBeenCalledTimes(1)
    expect(go).toHaveBeenCalledWith(-3)
    expect(window.location.pathname).toBe('/')
    expect(seen).toHaveBeenCalledTimes(1)
    go.mockRestore()
  })

  it('leaveToChooser with an overlay open adds the overlay entry to the unwind', async () => {
    navigate(walletScreenPath('wallet', 'a'))
    navigate(walletScreenPath('configure', 'a'))
    const release = pushOverlay(() => undefined)
    const go = vi.spyOn(window.history, 'go')
    leaveToChooser()
    await settle()
    expect(go).toHaveBeenCalledWith(-3)
    expect(window.location.pathname).toBe('/')
    go.mockRestore()
    release()
    await settle()
    expect(window.location.pathname).toBe('/')
  })

  it('leaveToChooser replaces an entry a boot created (no depth) and notifies', () => {
    window.history.replaceState(null, '', '/wallets/a/checks')
    seen.mockClear()
    leaveToChooser()
    expect(window.location.pathname).toBe('/')
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('leaveToChooser does nothing while a blocker is active', async () => {
    navigate(walletScreenPath('wallet', 'a'))
    const release = blockLeaving()
    const go = vi.spyOn(window.history, 'go')
    leaveToChooser()
    await settle()
    expect(go).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/wallets/a')
    go.mockRestore()
    release()
  })

  it('the blocked-screen re-push keeps a depth', async () => {
    navigate(walletScreenPath('edit-checks', 'w'))
    const release = blockLeaving()
    window.history.back()
    await settle()
    expect(window.history.state).toEqual({ screen: true, depth: 1 })
    release()
  })

  it('a screen pushed while an overlay is open counts the overlay entry, so one unwind reaches /', async () => {
    navigate(walletScreenPath('wallet', 'a'))
    const release = pushOverlay(() => undefined)
    navigate(walletScreenPath('configure', 'a'))
    expect(window.history.state).toEqual({ screen: true, depth: 3 })
    const go = vi.spyOn(window.history, 'go')
    leaveToChooser()
    await settle()
    expect(go).toHaveBeenCalledWith(-3)
    expect(window.location.pathname).toBe('/')
    go.mockRestore()
    release()
    await settle()
  })

  it('the blocked-screen re-push restores the depth of the blocked screen, however far Back went', async () => {
    navigate('/settings')
    navigate(walletScreenPath('edit-checks', 'w'))
    const release = blockLeaving()
    window.history.go(-2)
    await settle()
    expect(window.location.pathname).toBe(walletScreenPath('edit-checks', 'w'))
    expect(window.history.state).toEqual({ screen: true, depth: 2 })
    release()
  })
})

describe('enteredWalletId (AD-34)', () => {
  it.each([
    [{ screen: 'wallet', walletId: 'a' }, 'a'],
    [{ screen: 'configure', walletId: 'a' }, 'a'],
    [{ screen: 'edit-checks', walletId: 'a' }, 'a'],
    [{ screen: 'two-device', walletId: 'a' }, 'a'],
    [{ screen: 'control', walletId: 'a' }, 'a'],
    [{ screen: 'chooser' }, null],
    [{ screen: 'settings' }, null],
    [{ screen: 'add-wallet' }, null],
  ] as Array<[Route, string | null]>)('%j -> %s', (route, expected) => {
    expect(enteredWalletId(route, 'a')).toBe(expected)
  })

  it('is null on a wallet screen only when there is no active wallet', () => {
    expect(enteredWalletId({ screen: 'wallet', walletId: 'a' }, null)).toBeNull()
  })
})
