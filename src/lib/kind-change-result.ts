/**
 * A change of kind that was just written (OS-FR-5, OS-FR-6). The Wallet's shell is
 * chosen by its kind (`Main`), so the write swaps the whole tree under the task
 * screen: anything the screen held is gone with it. This one-shot marker carries
 * what the new shell needs across that swap: that the change screen is leaving
 * (so it is not reset meanwhile), that its tabs open on Local settings, and, for
 * Change to offline, the result plate (P-43 and Text C's steps).
 *
 * Module state, like `configure-launch`: never in the URL, the history state or
 * any store. It holds no secret: a Wallet id and the kind it became.
 */
export interface KindChanged {
  walletId: string
  to: 'offline' | 'online'
}

let pending: KindChanged | null = null

/** Set by a change screen right after the keystore wrote the change, before the store hears of it. */
export function markKindChanged(change: KindChanged): void {
  pending = change
}

/** The change just written for `walletId`, if any. Not consumed here: a dev double mount would lose it. */
export function peekKindChanged(walletId: string): KindChanged | null {
  return pending?.walletId === walletId ? pending : null
}

/** Local settings has shown the result (or the Wallet was left): a later visit lands fresh. */
export function clearKindChanged(): void {
  pending = null
}
