import type { NetworkId } from '@/lib/xrpl/networks'
import type { SeedMethod } from './db'

export type { SeedMethod }

/**
 * AD-28: the one place that says which Open Check and auto-lock combinations
 * are legal. Creation and every edit call it; the UI only renders its answer,
 * reasons included. It also carries the Signing Check rules (FR-67), the
 * written-Seed rule (FR-72) and `describeOptions`, which is what the creation
 * flow renders.
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

// ---------------------------------------------------------------------------
// The whole Wallet request (story 5): Seed Method, Signing Check, FR-72
// ---------------------------------------------------------------------------

/** FR-66. `standard` is no Signing Check: the Open Key opens the Seed. */
export type SigningKind = 'standard' | 'passkey' | 'pin'
/** Whether this device can do WebAuthn PRF. `unknown` is the honest answer on
 * most browsers before a passkey exists. */
export type PasskeyCapability = 'yes' | 'no' | 'unknown'

export interface WalletRequest {
  network: NetworkId
  seedMethod: SeedMethod
  openCheck: NewOpenCheck
  autoLockMinutes: number
  signing: SigningKind
  passkey: PasskeyCapability
  /** The host the build's rpId is bound to (`getRpId()`), passed in as context:
   * the Mainnet rule for a Passkey-Derived Seed reads it (AD-24). Absent on
   * Mainnet is refused, never allowed. */
  origin?: string
  /** The written, word-confirmed Seed (FR-72), already confirmed. */
  writtenSeedConfirmed?: boolean
  /** The caller will make the person write the Seed down and confirm it before
   * anything is written (story 7). Without it, or `writtenSeedConfirmed`, a
   * Mainnet passkey-only Wallet is refused. Testnet and Devnet never ask. */
  canConfirmWrittenSeed?: boolean
}

/** A Passkey-Derived Seed is bound to the domain it was made under. The preview
 * host is not a domain anyone should bind Mainnet funds to (Related Origin
 * Requests are not used). */
export const MAINNET_DERIVED_ORIGIN_REASON =
  'A Passkey-Derived Seed on Mainnet is not available on this address: it would be tied to a temporary web address. Use Testnet or Devnet, or a Stored Seed.'
export const MAINNET_DERIVED_UNKNOWN_ORIGIN_REASON =
  "A Passkey-Derived Seed on Mainnet is not available because this app's web address could not be determined."
const TEMPORARY_HOST_SUFFIX = '.b-cdn.net'

/** True when `origin` (a host) is a temporary `*.b-cdn.net` address. */
export function isTemporaryOrigin(origin: string | undefined): boolean {
  return !!origin && origin.toLowerCase().endsWith(TEMPORARY_HOST_SUFFIX)
}

/** Why a Passkey-Derived Seed cannot be made here, whatever else is chosen. */
function derivedBlock(network: NetworkId, passkey: PasskeyCapability, origin: string | undefined): PolicyVerdict {
  if (passkey === 'no') return { ok: false, reason: NO_PRF_REASON }
  // Fails closed: an unknown origin cannot be shown not to be a temporary one.
  if (network === 'mainnet' && !origin) return { ok: false, reason: MAINNET_DERIVED_UNKNOWN_ORIGIN_REASON }
  if (network === 'mainnet' && isTemporaryOrigin(origin)) return { ok: false, reason: MAINNET_DERIVED_ORIGIN_REASON }
  return { ok: true }
}
export const NO_PRF_REASON = 'This device or browser cannot use a passkey to protect a wallet.'
export const PRF_CHECKED_LATER_NOTE = 'Checked when the passkey is created.'
export const WRITTEN_SEED_REASON =
  'A Mainnet wallet whose only check is a passkey needs a written, confirmed Seed, so it can be recovered if the passkey is lost. This screen cannot ask for that confirmation: use the App PIN for one of the two checks.'

/** The auto-lock choices the creation flow offers, in minutes. */
export const AUTO_LOCK_CHOICES = [0.5, 1, 5, 15, 30] as const

/** FR-67 (check-rules.md): which Signing Checks a Seed Method allows. */
export function checkSigningCheck(seedMethod: SeedMethod, signing: SigningKind): PolicyVerdict {
  if (seedMethod === 'passkey-derived' && signing !== 'passkey') {
    return { ok: false, reason: 'A Passkey-Derived Seed can only be protected by a passkey Signing Check.' }
  }
  return { ok: true }
}

/** FR-72: a Mainnet Wallet whose only check is a passkey (Open Check passkey,
 * Signing Check passkey or Standard) must have a written Seed. */
export function requiresWrittenSeed(network: NetworkId, openCheck: NewOpenCheck, signing: SigningKind): boolean {
  return network === 'mainnet' && openCheck === 'passkey' && (signing === 'passkey' || signing === 'standard')
}

function usesPasskey(openCheck: NewOpenCheck, signing: SigningKind): boolean {
  return openCheck === 'passkey' || signing === 'passkey'
}

/** The one verdict on a Wallet being created: Seed Method and Signing Check
 * (FR-67), the Open Check and auto-lock floors (FR-65), passkey capability and
 * the written-Seed rule (FR-72). Creation calls it and refuses before any write. */
export function checkWalletRequest(req: WalletRequest): PolicyVerdict {
  if (req.seedMethod === 'passkey-derived') {
    const block = derivedBlock(req.network, req.passkey, req.origin)
    if (!block.ok) return block
  }
  const signing = checkSigningCheck(req.seedMethod, req.signing)
  if (!signing.ok) return signing
  const lock = checkLockRequest(req)
  if (!lock.ok) return lock
  if (usesPasskey(req.openCheck, req.signing) && req.passkey === 'no') return { ok: false, reason: NO_PRF_REASON }
  if (requiresWrittenSeed(req.network, req.openCheck, req.signing) && !req.writtenSeedConfirmed && !req.canConfirmWrittenSeed) {
    return { ok: false, reason: WRITTEN_SEED_REASON }
  }
  return { ok: true }
}

/** One answer to one question: available or not, and why. `note` is shown on an
 * available answer (a passkey that can only be checked at creation). */
export interface OptionState {
  available: boolean
  reason?: string
  note?: string
}

export interface OptionsContext {
  network: NetworkId
  seedMethod: SeedMethod
  openCheck: NewOpenCheck
  autoLockMinutes: number
  signing: SigningKind
  passkey: PasskeyCapability
  /** The host the build's rpId is bound to; see `WalletRequest.origin`. */
  origin?: string
  /** See `WalletRequest.canConfirmWrittenSeed`. */
  canConfirmWrittenSeed?: boolean
}

export interface DescribedOptions {
  seedMethod: Record<SeedMethod, OptionState>
  openCheck: Record<NewOpenCheck, OptionState>
  autoLock: Array<OptionState & { minutes: number }>
  signing: Record<SigningKind, OptionState>
  /** The verdict on the answers as chosen together. Creation cannot proceed
   * unless it is ok; its reason is shown as visible text. */
  combination: PolicyVerdict
  /** True when creating this combination makes the person write down and confirm
   * the Seed first (FR-72). The screen renders the step; it never decides it. */
  writtenSeedRequired: boolean
}

function passkeyState(passkey: PasskeyCapability): OptionState {
  if (passkey === 'no') return { available: false, reason: NO_PRF_REASON }
  if (passkey === 'unknown') return { available: true, note: PRF_CHECKED_LATER_NOTE }
  return { available: true }
}

function derivedState(ctx: OptionsContext): OptionState {
  const block = derivedBlock(ctx.network, ctx.passkey, ctx.origin)
  if (!block.ok) return { available: false, reason: block.reason }
  return passkeyState(ctx.passkey)
}

function fromVerdict(verdict: PolicyVerdict): OptionState {
  return verdict.ok ? { available: true } : { available: false, reason: verdict.reason }
}

/** What the creation flow renders: per-option availability with reasons, taken
 * from the same rules `checkWalletRequest` enforces, so a screen never decides
 * legality itself (AD-28). The FR-72 refusal is a property of the combination,
 * not of one option, and is reported as `combination`. */
export function describeOptions(ctx: OptionsContext): DescribedOptions {
  const seedMethod: Record<SeedMethod, OptionState> = {
    stored: { available: true },
    'passkey-derived': derivedState(ctx),
  }
  // `none` is judged on the network alone: the chosen minutes are a different question.
  const openCheck: Record<NewOpenCheck, OptionState> = {
    pin: { available: true },
    passkey: passkeyState(ctx.passkey),
    none: fromVerdict(checkLockRequest({ network: ctx.network, openCheck: 'none', autoLockMinutes: MAINNET_MIN_AUTO_LOCK_MINUTES })),
  }
  const signingFor = (kind: SigningKind): OptionState => {
    const allowed = checkSigningCheck(ctx.seedMethod, kind)
    if (!allowed.ok) return fromVerdict(allowed)
    return kind === 'passkey' ? passkeyState(ctx.passkey) : { available: true }
  }
  const signing: Record<SigningKind, OptionState> = {
    standard: signingFor('standard'),
    passkey: signingFor('passkey'),
    pin: signingFor('pin'),
  }
  const autoLock = AUTO_LOCK_CHOICES.map((minutes) => ({ minutes, ...fromVerdict(checkAutoLock([ctx.network], minutes)) }))
  return {
    seedMethod,
    openCheck,
    autoLock,
    signing,
    combination: checkWalletRequest(ctx),
    writtenSeedRequired: requiresWrittenSeed(ctx.network, ctx.openCheck, ctx.signing),
  }
}
