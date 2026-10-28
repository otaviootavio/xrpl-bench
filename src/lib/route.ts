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
  | { screen: 'chooser' }
  | { screen: 'settings' }
  | { screen: 'add-wallet' }
  | { screen: 'wallet'; walletId: string }
  | { screen: 'configure'; walletId: string }
  | { screen: 'edit-checks'; walletId: string }
  | { screen: 'two-device'; walletId: string }
  | { screen: 'control'; walletId: string }

export const CHOOSER_PATH = '/'
export const SETTINGS_PATH = '/settings'
export const ADD_WALLET_PATH = '/wallets/new'

/** The path segment after `/wallets/:id` for each in-wallet screen ('' is the wallet itself). */
const SEGMENTS = {
  wallet: '',
  configure: 'configure',
  'edit-checks': 'checks',
  'two-device': 'two-device',
  control: 'control',
} as const
type WalletScreen = keyof typeof SEGMENTS

export function walletScreenPath(screen: WalletScreen, walletId: string): string {
  const base = `/wallets/${encodeURIComponent(walletId)}`
  return SEGMENTS[screen] ? `${base}/${SEGMENTS[screen]}` : base
}

/** The one split between chooser-side and in-wallet screens (AD-32). No consumer re-lists screens. */
export function isWalletScreen(route: Route): route is Extract<Route, { walletId: string }> {
  return (
    route.screen === 'wallet' ||
    route.screen === 'configure' ||
    route.screen === 'edit-checks' ||
    route.screen === 'two-device' ||
    route.screen === 'control'
  )
}

/**
 * The wallet the user is inside (AD-34): `activeWalletId` on an in-wallet screen,
 * `null` on a chooser-side one. A pure derivation — never held in a store or state.
 */
export function enteredWalletId(route: Route, activeWalletId: string | null): string | null {
  return isWalletScreen(route) ? activeWalletId : null
}

/** The routed task screens `WalletScreens` renders in place of the shell. */
export type TaskRoute = Extract<Route, { screen: 'add-wallet' | 'edit-checks' | 'two-device' | 'control' }>

export function isTaskRoute(route: Route): route is TaskRoute {
  return (
    route.screen === 'add-wallet' ||
    route.screen === 'edit-checks' ||
    route.screen === 'two-device' ||
    route.screen === 'control'
  )
}

export function parseRoute(pathname: string): Route {
  // Empty segments are kept (bar one trailing slash): `/wallets//checks` is not a route.
  const parts = pathname.replace(/^\//, '').replace(/\/$/, '').split('/')
  if (parts.length === 1 && parts[0] === 'settings') return { screen: 'settings' }
  if (parts[0] !== 'wallets') return { screen: 'chooser' }
  if (parts.length === 2 && parts[1] === 'new') return { screen: 'add-wallet' }
  if (parts.length === 2 || parts.length === 3) {
    const segment = parts[2] ?? ''
    const screen = (Object.keys(SEGMENTS) as WalletScreen[]).find((s) => SEGMENTS[s] === segment)
    if (screen) {
      try {
        const walletId = decodeURIComponent(parts[1])
        if (walletId) return { screen, walletId }
      } catch {
        // A malformed escape is not a route.
      }
    }
  }
  return { screen: 'chooser' }
}

/**
 * Run once at module scope before the first render: only `/` is guaranteed to be
 * served by the static shell, so a bookmark or reload at any other path (an
 * in-wallet screen, `/settings`) lands on the chooser. Idempotent.
 */
export function rewriteBootLocation(): void {
  // A reload keeps the entry's state: a stale `{ screen, depth }` or overlay marker at `/` would be read as real.
  if (window.location.pathname !== CHOOSER_PATH || window.history.state !== null) {
    window.history.replaceState(null, '', CHOOSER_PATH)
  }
}

// ---- history ---------------------------------------------------------------

const listeners = new Set<() => void>()
let blockers = 0
let blockedPath = CHOOSER_PATH
let blockedDepth = 0
let bypassNext = false
let afterBypass: (() => void) | null = null
let installed = false
let settleScheduled = false

/** The open dialogs and sheets, oldest first. They share ONE history entry (below). */
const overlays: Array<{ close: () => void }> = []

function hasOverlayEntry(): boolean {
  return (window.history.state as { overlay?: boolean } | null)?.overlay === true
}

/** The marker keeps the screen flag of the entry beneath it, and nothing else:
 * no secret, no form data, the same rule as every other state this app writes. */
function pushOverlayEntry() {
  const screen = (window.history.state as { screen?: boolean } | null)?.screen === true
  window.history.pushState(
    screen ? { screen: true, depth: currentDepth(), overlay: true } : { overlay: true },
    '',
    undefined,
  )
}

/** How many app-pushed entries sit above the chooser entry; 0 when absent (a boot's entry). */
function currentDepth(): number {
  const depth = (window.history.state as { depth?: unknown } | null)?.depth
  return typeof depth === 'number' && Number.isInteger(depth) && depth > 0 ? depth : 0
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
    window.history.pushState({ screen: true, depth: blockedDepth }, '', blockedPath)
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
  // An open overlay's entry sits above its screen's and shares its depth: count it,
  // so `depth` stays the true number of entries above the chooser.
  const depth = currentDepth() + (hasOverlayEntry() ? 1 : 0) + 1
  window.history.pushState({ screen: true, depth }, '', path)
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
    afterBypass = () => window.history.replaceState(null, '', CHOOSER_PATH)
    window.history.back()
    return
  }
  window.history.replaceState(null, '', CHOOSER_PATH)
  notify()
}

/**
 * The one return to the chooser from an in-wallet screen (AD-33). Honours a
 * leave-blocker (does nothing while one is active). Unwinds every app-pushed
 * entry, plus the overlay entry if one is open, in a single `history.go`; an
 * entry a boot created has no depth and is replaced instead.
 */
export function leaveToChooser(): void {
  if (blockers > 0) return
  const state = window.history.state as { depth?: unknown; overlay?: boolean } | null
  const depth = currentDepth()
  const overlayEntry = state?.overlay === true
  if (depth > 0) {
    bypassNext = true
    window.history.go(-(depth + (overlayEntry ? 1 : 0)))
    return
  }
  if (overlayEntry) {
    bypassNext = true
    afterBypass = () => window.history.replaceState(null, '', CHOOSER_PATH)
    window.history.back()
    return
  }
  window.history.replaceState(null, '', CHOOSER_PATH)
  notify()
}

/** Replaces an unreachable location (no such Wallet, no Wallets at all) with the shell. */
export function resetToHome(): void {
  if (window.location.pathname === CHOOSER_PATH) return
  window.history.replaceState(null, '', CHOOSER_PATH)
  notify()
}

const blockerListeners = new Set<() => void>()

function notifyBlockers() {
  for (const l of blockerListeners) l()
}

/** Whether an open screen currently cannot be left (a `useSyncExternalStore` snapshot). */
export function isLeaveBlocked(): boolean {
  return blockers > 0
}

/** Subscribes to changes of `isLeaveBlocked`; returns the unsubscribe. */
export function subscribeLeaveBlockers(listener: () => void): () => void {
  blockerListeners.add(listener)
  return () => {
    blockerListeners.delete(listener)
  }
}

/** Registers that the open screen cannot be left; returns the release. */
export function blockLeaving(): () => void {
  if (blockers === 0) {
    blockedPath = window.location.pathname
    blockedDepth = currentDepth()
  }
  blockers += 1
  notifyBlockers()
  let released = false
  return () => {
    if (released) return
    released = true
    blockers -= 1
    notifyBlockers()
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
    // One check per tick: two overlays released together (a sheet and its PIN
    // prompt) must pop the one entry once, not twice.
    if (settleScheduled) return
    settleScheduled = true
    setTimeout(() => {
      settleScheduled = false
      if (overlays.length === 0 && hasOverlayEntry()) {
        bypassNext = true
        window.history.back()
      }
    }, 0)
  }
}
