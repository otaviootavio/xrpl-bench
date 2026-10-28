/**
 * A one-shot signal from Add wallet to the Chooser (AD-40): which Seed card was
 * just created, so the Chooser can put focus on its h2 when it mounts. Module
 * state, not store or route: nothing here is a secret, and a cold start (nothing
 * announced) consumes nothing. A seedId only, never a name.
 */
let added: string | null = null

export function announceAdded(seedId: string): void {
  added = seedId
}

/** Returns the announced seedId once, then nothing until the next announcement. */
export function consumeAdded(): string | null {
  const seedId = added
  added = null
  return seedId
}

/** Drops an announcement the Chooser never saw (the user went elsewhere). */
export function clearAdded(): void {
  added = null
}
