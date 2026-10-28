import { navigate } from '@/lib/route'

/**
 * Where a task screen was opened from (Story 14). Edit checks, Let another wallet
 * sign and Sign with two devices can be opened from the Configure screen or, until
 * Story 19.4 removes it, from the Settings tab: the Back label and the return
 * differ. The launch is a one-shot marker set by the Configure keys and read once
 * by `WalletScreens` at mount, never carried in the URL or the history state (the
 * route module's rule: a path holds a screen and a walletId and nothing else).
 * It holds no secret: two booleans' worth of module state.
 */
let launchedFromConfigure = false
let focusReturn: string | null = null

/** Opens a task screen from Configure: marks the launch and remembers the key that opened it. */
export function launchFromConfigure(path: string, keyId: string): void {
  launchedFromConfigure = true
  focusReturn = keyId
  const before = window.location.pathname
  navigate(path)
  // A blocked navigation went nowhere: nothing launched, so nothing may linger.
  if (window.location.pathname === before) {
    launchedFromConfigure = false
    focusReturn = null
  }
}

/** Read by `WalletScreens` while rendering. Does not consume: `clearConfigureLaunch` does, after mount. */
export function peekConfigureLaunch(): boolean {
  return launchedFromConfigure
}

export function clearConfigureLaunch(): void {
  launchedFromConfigure = false
}

/** Read by the Configure screen on mount: the key to focus when a task screen returns to it.
 * Not consumed (a dev double mount would lose it); the next way in resets it. */
export function peekConfigureFocusReturn(): string | null {
  return focusReturn
}

/** Any other way into Configure (the card key, the header key) lands fresh. */
export function resetConfigureFocusReturn(): void {
  focusReturn = null
}
