import type { NetworkId } from '@/lib/xrpl/networks'

/**
 * AD-28: the one place that says which Open Check and auto-lock combinations
 * are legal. Creation and every edit call it; the UI only renders its answer,
 * reasons included. Story 5 extends it with the Signing Check rules.
 *
 * Floors (`_bmad-output/specs/spec-passkey-signing/check-rules.md`, FR-65):
 *
 * | Network         | Open Check                | Auto-lock |
 * | Mainnet         | required (App PIN/passkey) | >= 1 min  |
 * | Testnet, Devnet | optional                  | any       |
 *
 * A floor applies to what is being created or edited. It never reaches back and
 * changes an existing Wallet: the legacy lock is not made weaker or stronger by
 * this module, and only an edit to its auto-lock is asked to meet the floor.
 */

/** The Open Check a new lock may be created with. `either` is the legacy lock's
 * and cannot be created. */
export type NewOpenCheck = 'pin' | 'passkey' | 'none'

export const MAINNET_MIN_AUTO_LOCK_MINUTES = 1

export type PolicyVerdict = { ok: true } | { ok: false; reason: string }

export interface LockRequest {
  network: NetworkId
  openCheck: NewOpenCheck
  autoLockMinutes: number
}

function validMinutes(minutes: number): boolean {
  return Number.isFinite(minutes) && minutes > 0
}

/** Is this auto-lock allowed on a lock that serves Wallets on `networks`? */
export function checkAutoLock(networks: readonly NetworkId[], autoLockMinutes: number): PolicyVerdict {
  if (!validMinutes(autoLockMinutes)) {
    return { ok: false, reason: 'Auto-lock must be a number of minutes greater than zero.' }
  }
  if (networks.includes('mainnet') && autoLockMinutes < MAINNET_MIN_AUTO_LOCK_MINUTES) {
    return {
      ok: false,
      reason: `A Mainnet wallet must auto-lock after at least ${MAINNET_MIN_AUTO_LOCK_MINUTES} minute of inactivity.`,
    }
  }
  return { ok: true }
}

/** Is a lock with this Open Check and auto-lock allowed for a Wallet on this network? */
export function checkLockRequest(req: LockRequest): PolicyVerdict {
  if (req.network === 'mainnet' && req.openCheck === 'none') {
    return { ok: false, reason: 'A Mainnet wallet needs an Open Check: choose the App PIN or a passkey.' }
  }
  return checkAutoLock([req.network], req.autoLockMinutes)
}
