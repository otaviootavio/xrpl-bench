import { wipeVaultDatabase } from './db'
import { getLockoutState } from './pin'

// Opening a lock lives in lock.ts (AD-26). The shared PIN counter lives in
// pin.ts (AD-25) and is re-exported for the lock screen.
export { getLockoutState }
export type { UnlockLockoutState } from './pin'

/** Full teardown for wallet removal / logout — clears the vault entirely. */
export async function wipeVault(): Promise<void> {
  await wipeVaultDatabase()
}
