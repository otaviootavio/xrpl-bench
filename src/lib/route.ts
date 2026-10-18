/**
 * The app's one location scheme: the four task screens and nothing else.
 *
 * There is no router dependency. Four screens' worth of paths do not justify
 * one on a wallet, and the app is a static shell: only `/` is guaranteed to be
 * served on a first load, so every other path is entered by an in-app
 * navigation and a boot at one falls back to the shell (`Gate`).
 *
 * A path carries a screen name and, at most, a Wallet id. Never a secret, never
 * form data — the same goes for the history `state`, which holds one boolean.
 * Pure parsing is separate from the history calls so the former is testable
 * without a DOM.
 */

export type Route =
  | { screen: 'home' }
  | { screen: 'add-wallet' }
  | { screen: 'edit-checks'; walletId: string }
  | { screen: 'two-device'; walletId: string }
  | { screen: 'control'; walletId: string }

export const HOME_PATH = '/'
export const ADD_WALLET_PATH = '/wallets/new'

const SEGMENTS = { 'edit-checks': 'checks', 'two-device': 'two-device', control: 'control' } as const
type WalletScreen = keyof typeof SEGMENTS

export function walletScreenPath(screen: WalletScreen, walletId: string): string {
  return `/wallets/${encodeURIComponent(walletId)}/${SEGMENTS[screen]}`
}

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'wallets') return { screen: 'home' }
  if (parts.length === 2 && parts[1] === 'new') return { screen: 'add-wallet' }
  if (parts.length === 3) {
    const screen = (Object.keys(SEGMENTS) as WalletScreen[]).find((s) => SEGMENTS[s] === parts[2])
    if (screen) {
      try {
        const walletId = decodeURIComponent(parts[1])
        if (walletId) return { screen, walletId }
      } catch {
        // A malformed escape is not a route.
      }
    }
  }
  return { screen: 'home' }
}

// ---- history ---------------------------------------------------------------

const listeners = new Set<() => void>()
let blockers = 0
let blockedPath = HOME_PATH
let bypassNext = false
let afterBypass: (() => void) | null = null
let installed = false

/** The open dialogs and sheets, oldest first. They share ONE history entry (below). */
const overlays: Array<{ close: () => void }> = []

function hasOverlayEntry(): boolean {
  return (window.history.state as { overlay?: boolean } | null)?.overlay === true
}

/** The marker keeps the screen flag of the entry beneath it, and nothing else:
 * no secret, no form data, the same rule as every other state this app writes. */
function pushOverlayEntry() {
  const screen = (window.history.state as { screen?: boolean } | null)?.screen === true
  window.history.pushState(screen ? { screen: true, overlay: true } : { overlay: true }, '', undefined)
}

function notify() {
  for (const l of listeners) l()
}

function onPopState() {
  if (bypassNext) {
    bypassNext = false
    const after = afterBypass
    afterBypass = null
    after?.()
    notify()
    return
  }
  // Back popped the entry an open dialog or sheet pushed: it closes the newest
  // overlay and the app stays where it was. If that overlay refuses to close (it
  // is mid-write), the entry is put back so the next Back still has one to pop.
  if (overlays.length > 0 && !hasOverlayEntry()) {
    overlays[overlays.length - 1].close()
    setTimeout(() => {
      if (overlays.length > 0 && !hasOverlayEntry()) pushOverlayEntry()
    }, 0)
    return
  }
  // A key-changing write or a Seed backup is running on the screen: the browser's
  // Back must not hide its outcome. Put the screen's entry back.
  if (blockers > 0 && window.location.pathname !== blockedPath) {
    window.history.pushState({ screen: true }, '', blockedPath)
    return
  }
  notify()
}

function install() {
  if (!installed) {
    window.addEventListener('popstate', onPopState)
    installed = true
  }
}

export function subscribeRoute(listener: () => void): () => void {
  install()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function currentPathname(): string {
  return window.location.pathname
}

/** Opens a screen as a new history entry, so Back returns to where the user was. */
export function navigate(path: string): void {
  if (blockers > 0) return
  window.history.pushState({ screen: true }, '', path)
  notify()
}

/**
 * Leaves the current screen for the shell. Used by a screen when its own work is
 * done, so it ignores a leave-blocker (the blocker only guards the user's Back).
 * An entry this app pushed is popped; a screen entered by a boot at its path is replaced.
 */
export function leaveScreen(): void {
  const pushedHere = (window.history.state as { screen?: boolean } | null)?.screen === true
  // An overlay's entry sits on top of the screen's: pop both.
  const overlayEntry = hasOverlayEntry()
  if (pushedHere) {
    bypassNext = true
    window.history.go(overlayEntry ? -2 : -1)
    return
  }
  if (overlayEntry) {
    bypassNext = true
    afterBypass = () => window.history.replaceState(null, '', HOME_PATH)
    window.history.back()
    return
  }
  window.history.replaceState(null, '', HOME_PATH)
  notify()
}

/** Replaces an unreachable location (no such Wallet, no Wallets at all) with the shell. */
export function resetToHome(): void {
  if (window.location.pathname === HOME_PATH) return
  window.history.replaceState(null, '', HOME_PATH)
  notify()
}

/** Registers that the open screen cannot be left; returns the release. */
export function blockLeaving(): () => void {
  if (blockers === 0) blockedPath = window.location.pathname
  blockers += 1
  let released = false
  return () => {
    if (released) return
    released = true
    blockers -= 1
  }
}

/**
 * Registers an open dialog or sheet so the browser's (and the phone's hardware)
 * Back closes it instead of leaving the app. The first open overlay pushes one
 * history entry carrying only `{ overlay: true }`; further overlays share it. Back
 * pops it and calls the newest overlay's `close`. When the last overlay closes
 * by any other route, the entry is popped again, so Back is not left with a dead
 * step. The release is deferred a tick so a sheet handing over to a PIN prompt
 * keeps the one entry rather than popping and re-pushing it.
 */
export function pushOverlay(close: () => void): () => void {
  install()
  const overlay = { close }
  overlays.push(overlay)
  if (!hasOverlayEntry()) pushOverlayEntry()
  let released = false
  return () => {
    if (released) return
    released = true
    const at = overlays.indexOf(overlay)
    if (at !== -1) overlays.splice(at, 1)
    setTimeout(() => {
      if (overlays.length === 0 && hasOverlayEntry()) {
        bypassNext = true
        window.history.back()
      }
    }, 0)
  }
}
