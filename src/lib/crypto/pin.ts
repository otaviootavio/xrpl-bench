import { getVaultMeta, mutateVaultMeta } from './db'
import { bufToB64, b64ToBuf } from './encoding'

// OWASP's current guidance for PBKDF2-HMAC-SHA256 is 600,000 iterations.
export const PBKDF2_ITERATIONS = 600_000

export function generateSalt(): string {
  return bufToB64(crypto.getRandomValues(new Uint8Array(16)).buffer)
}

/** Mandatory fallback unlock method alongside the passkey (wallet-security.md
 * US-1 / docs/decisions.md resolved decision) — required for environments
 * with no platform authenticator. */
export async function derivePinKeyBits(pin: string, saltB64: string): Promise<ArrayBuffer> {
  const salt = b64ToBuf(saltB64)
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
}

// AD-25: one App PIN, one failure count. The count lives with the PIN, in the
// vault meta, and is shared by every Open Check and Signing Check that uses it.
export const MAX_ATTEMPTS_BEFORE_HARD_LOCK = 8
export const BACKOFF_STARTS_AT_ATTEMPT = 3

export interface UnlockLockoutState {
  locked: boolean
  hardLocked: boolean // per docs/decisions.md: after 8 fails, require re-import via seed
  backoffMs: number
  remainingMs: number
  /** Absolute epoch-ms the backoff expires at (0 if not backed off). Exposed
   * so the UI can derive a countdown without calling Date.now() during
   * render, which makes the value unstable across re-renders. */
  lockedUntil: number
}

function backoffFor(failedAttempts: number): number {
  return failedAttempts >= BACKOFF_STARTS_AT_ATTEMPT
    ? Math.min(2 ** (failedAttempts - BACKOFF_STARTS_AT_ATTEMPT) * 1000, 60_000)
    : 0
}

export async function getLockoutState(): Promise<UnlockLockoutState> {
  const meta = await getVaultMeta()
  const now = Date.now()
  const remainingMs = meta.lockedUntil ? Math.max(0, meta.lockedUntil - now) : 0
  return {
    locked: remainingMs > 0,
    hardLocked: meta.failedAttempts >= MAX_ATTEMPTS_BEFORE_HARD_LOCK,
    backoffMs: backoffFor(meta.failedAttempts),
    remainingMs,
    lockedUntil: meta.lockedUntil ?? 0,
  }
}

/** Tries left before the hard lock. */
export async function triesRemaining(): Promise<number> {
  const meta = await getVaultMeta()
  return Math.max(0, MAX_ATTEMPTS_BEFORE_HARD_LOCK - meta.failedAttempts)
}

/** Adds one failure inside one IndexedDB transaction. */
export async function recordFailure(): Promise<void> {
  await mutateVaultMeta((meta) => {
    const failedAttempts = meta.failedAttempts + 1
    const backoffMs = backoffFor(failedAttempts)
    return { ...meta, failedAttempts, lockedUntil: backoffMs > 0 ? Date.now() + backoffMs : undefined }
  })
}

export async function resetFailures(): Promise<void> {
  await mutateVaultMeta((meta) => ({ ...meta, failedAttempts: 0, lockedUntil: undefined }))
}

export type PinAttempt<T> =
  | { status: 'ok'; value: T }
  | { status: 'wrong-credential'; triesRemaining: number }
  | { status: 'locked-out'; hard: boolean; lockedUntil: number }

/**
 * The one way a PIN is tried. Refuses while a hard lock or a backoff is in
 * force; otherwise derives the PIN's key bits and hands them to `proof`, which
 * must PROVE them by decrypting known ciphertext and throw if it cannot
 * (deriving always succeeds, even for a wrong PIN). A throw keeps one failure
 * and a return resets the count — both through the shared transactional counter.
 *
 * The attempt is CHARGED before it is tried, in the same transaction that checks
 * the lock: guesses started together (a double click, a script in the page) each
 * take a number, so the 8-try limit and the backoff hold however many run at
 * once. A check followed by a later increment would let all of them through.
 */
export async function attemptPin<T>(pin: string, proof: (bits: ArrayBuffer) => Promise<T>): Promise<PinAttempt<T>> {
  const first = await getVaultMeta()
  if (!first.pinSaltB64) throw new Error('No PIN has been set up for this device.')

  let refusal: { hard: boolean; lockedUntil: number } | null = null
  const charged = await mutateVaultMeta((meta) => {
    const hard = meta.failedAttempts >= MAX_ATTEMPTS_BEFORE_HARD_LOCK
    const lockedUntil = meta.lockedUntil ?? 0
    if (hard || lockedUntil > Date.now()) {
      refusal = { hard, lockedUntil }
      return meta
    }
    const failedAttempts = meta.failedAttempts + 1
    const backoffMs = backoffFor(failedAttempts)
    return { ...meta, failedAttempts, lockedUntil: backoffMs > 0 ? Date.now() + backoffMs : undefined }
  })
  if (refusal) return { status: 'locked-out', ...(refusal as { hard: boolean; lockedUntil: number }) }

  let bits: ArrayBuffer
  try {
    // Deriving fails only for a reason that is not the typed PIN: not a guess.
    bits = await derivePinKeyBits(pin, first.pinSaltB64)
  } catch (err) {
    await refundAttempt()
    throw err
  }
  let value: T
  try {
    value = await proof(bits)
  } catch {
    return { status: 'wrong-credential', triesRemaining: Math.max(0, MAX_ATTEMPTS_BEFORE_HARD_LOCK - charged.failedAttempts) }
  }
  await resetFailures()
  return { status: 'ok', value }
}

/** Gives back the one attempt `attemptPin` charged, for a failure that was not a guess. */
async function refundAttempt(): Promise<void> {
  await mutateVaultMeta((meta) => {
    const failedAttempts = Math.max(0, meta.failedAttempts - 1)
    const backoffMs = backoffFor(failedAttempts)
    return { ...meta, failedAttempts, lockedUntil: backoffMs > 0 ? Date.now() + backoffMs : undefined }
  })
}
