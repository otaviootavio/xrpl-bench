/**
 * A one-shot signal from Add wallet to the Chooser (AD-40): which Wallet card was
 * just created, so the Chooser can put focus on its h2 when it mounts. Module
 * state, not store or route: nothing here is a secret, and a cold start (nothing
 * announced) consumes nothing. A walletId only, never a name.
 */
let added: string | null = null

export function announceAdded(walletId: string): void {
  added = walletId
}

/** Returns the announced walletId once, then nothing until the next announcement. */
export function consumeAdded(): string | null {
  const walletId = added
  added = null
  return walletId
}

/** Drops an announcement the Chooser never saw (the user went elsewhere). */
export function clearAdded(): void {
  added = null
}
