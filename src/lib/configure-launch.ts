import { navigate } from '@/lib/route'

/**
 * Where focus goes when a task screen opened from the Wallet tab returns to it (Story 14). Edit
 * checks, Let another wallet sign and Two-device signing are opened only from the Wallet tab, so
 * the Back label is always `Back to Wallet` (`WalletScreens`) and what remains to remember is the
 * key that opened the screen. It is module state, never carried in the URL or the history state
 * (the route module's rule: a path holds a screen and a walletId and nothing else). It holds no
 * secret: the id of a key. A return is pending once per round trip: the Wallet tab uses it, then
 * clears it.
 */
let focusReturn: string | null = null

/** Opens a task screen from the Wallet tab and remembers the key that opened it. */
export function launchFromConfigure(path: string, keyId: string): void {
  focusReturn = keyId
  const before = window.location.pathname
  navigate(path)
  // A blocked navigation went nowhere: nothing launched, so nothing may linger.
  if (window.location.pathname === before) focusReturn = null
}

/** Read by the Wallet tab on mount: the key to focus when a task screen returns to it.
 * Not consumed here (a dev double mount would lose it); the tab clears it once it has used it. */
export function peekConfigureFocusReturn(): string | null {
  return focusReturn
}

/** The Wallet tab has used the return (or there was none): a later visit lands fresh. */
export function clearConfigureFocusReturn(): void {
  focusReturn = null
}
