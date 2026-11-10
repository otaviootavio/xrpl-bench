import { sha256 } from '@noble/hashes/sha2.js'
import type { Payment } from 'xrpl'
import { NETWORKS, type NetworkId } from '@/lib/xrpl/networks'
import { feeWithinCap } from '@/lib/xrpl/money'
import { signPrepared } from '@/lib/xrpl/writes'
import { offlineSigningHandleFor, type SigningContext } from '@/lib/crypto/keystore'
import { decodeDataToSign, encodeRequest, encodeSigned, type DataToSignPayload, type RequestTx } from '@/lib/qr-codec'
import { DATA_REFUSAL } from '@/lib/offline-round-words'
import { fill } from '@/lib/transmit-words'

/**
 * The Offline-builds round on the Offline Wallet (OS-FR-13 to OS-FR-16,
 * route-checks.md "Offline Wallet, Offline-builds route"). It never reads from or
 * sends to the ledger: the only values from the online device are the exact Data
 * to Sign set, and the signed transaction is made from the kept Build plus that
 * set, nothing else.
 */

/**
 * The signing window, in ledgers: about ten minutes at about four seconds a ledger
 * (OS-FR-16, "ledger count set by architecture"; decided in story 6). Stated to the
 * user as "approximately 10 minutes", never as a promise (P-12, P-13).
 */
export const OFFLINE_LEDGER_WINDOW = 150

/**
 * The ledger-jump warning (P-14, "~4 s per ledger plus an architecture margin";
 * decided in story 6): a received index may be at most `elapsed / 3 s` plus 30
 * ledgers above the highest seen. Three seconds, not four, so a run of fast
 * closes does not warn; 30 ledgers (about two minutes) for the clock and the
 * time the Transmitter took to answer. A warning, never a refusal.
 */
export const LEDGER_JUMP_SECONDS_PER_LEDGER = 3
export const LEDGER_JUMP_MARGIN = 30

/** What the user Built: in this build, an XRP Payment (story 6). */
export interface PaymentBuild {
  type: 'payment'
  /** The Account the Wallet Signs for: the transaction's `Account`. */
  account: string
  destination: string
  amountDrops: string
  destinationTag?: number
}
export type OfflineBuild = PaymentBuild

/** The Built transaction the request carries: the Build's fields only. */
export function builtTransaction(build: OfflineBuild): RequestTx {
  return {
    TransactionType: 'Payment',
    Account: build.account,
    Destination: build.destination,
    Amount: build.amountDrops,
    ...(build.destinationTag !== undefined ? { DestinationTag: build.destinationTag } : {}),
  }
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/**
 * The Build hash: SHA-256 of the Same Build content (type, destination, amount,
 * token, tag, flags; glossary "Same Build"), in one fixed order. The same Build
 * typed again after a lock has the same hash (story 7 compares it).
 */
export function buildHashOf(build: OfflineBuild): string {
  const content = JSON.stringify(['Payment', build.destination, build.amountDrops, null, build.destinationTag ?? null, 0])
  return toHex(sha256(new TextEncoder().encode(content)))
}

/** A new request ID: 16 random bytes. A new one for every request shown. */
export function newRequestId(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)))
}

/** The Data-to-Sign Request for a Build (OS-FR-14). */
export function requestText(network: NetworkId, build: OfflineBuild, requestId: string): string {
  return encodeRequest({ network, requestId, buildHash: buildHashOf(build), account: build.account, tx: builtTransaction(build) }).text
}

/** The request this Wallet is waiting for an answer to: `null` after a lock or before one is shown. */
export interface KeptRequest {
  requestId: string
  buildHash: string
}

export type DataJudgement = { ok: true; data: DataToSignPayload } | { ok: false; reason: string }

/**
 * Judges a scanned Data to Sign (route-checks "Offline Wallet, Offline-builds
 * route"): the exact set (else malformed), the Wallet's own Network, the kept
 * request's ID and Build hash (any answer after a lock has none to match), the
 * fee cap, and the Account the Wallet Signs for. Returns the reason in P-17's
 * words; P-16 is the heading the screen puts above it.
 */
export function judgeDataToSign(
  text: string,
  wallet: { network: NetworkId; address: string },
  kept: KeptRequest | null,
  build: OfflineBuild | null,
): DataJudgement {
  const decoded = decodeDataToSign(text)
  if (!decoded.ok) return { ok: false, reason: DATA_REFUSAL.malformed }
  const data = decoded.value
  if (data.network !== wallet.network) {
    return { ok: false, reason: fill(DATA_REFUSAL.network, NETWORKS[data.network].label, NETWORKS[wallet.network].label) }
  }
  if (!kept || !build || data.request_id !== kept.requestId || data.build_hash !== kept.buildHash || buildHashOf(build) !== kept.buildHash) {
    return { ok: false, reason: DATA_REFUSAL.request }
  }
  if (!feeWithinCap(data.fee)) return { ok: false, reason: DATA_REFUSAL.fee }
  if (build.account !== wallet.address) return { ok: false, reason: fill(DATA_REFUSAL.account, build.account, wallet.address) }
  return { ok: true, data }
}

/**
 * The transaction the Offline Wallet signs: the kept Build plus Sequence and Fee
 * from the Data to Sign, and LastLedgerSequence set here from the received index
 * (OS-FR-16). No `NetworkID`: Mainnet, Testnet and Devnet omit it.
 */
export function assembleTransaction(build: OfflineBuild, data: Pick<DataToSignPayload, 'sequence' | 'fee' | 'ledger_index'>): Payment {
  return {
    ...builtTransaction(build),
    Sequence: data.sequence,
    Fee: data.fee,
    LastLedgerSequence: data.ledger_index + OFFLINE_LEDGER_WINDOW,
  }
}

/**
 * The highest-seen ledger warning (P-14): `lower` when the received index is
 * below the highest this Wallet accepted, `too-high` when it is further above it
 * than the time since allows, `null` otherwise or when nothing was seen yet.
 */
export function ledgerJumpWarning(received: number, seen: { index: number; at: number } | null, now: number): 'lower' | 'too-high' | null {
  if (!seen) return null
  if (received < seen.index) return 'lower'
  const elapsedSeconds = Math.max(0, (now - seen.at) / 1000)
  const allowed = Math.ceil(elapsedSeconds / LEDGER_JUMP_SECONDS_PER_LEDGER) + LEDGER_JUMP_MARGIN
  return received - seen.index > allowed ? 'too-high' : null
}

/** The signed QR and what its plate states. The blob is held in memory only, while the round lasts. */
export interface SignedRound {
  text: string
  hash: string
  lastLedgerSequence: number
  signedAt: number
}

/**
 * Signs the assembled transaction once (OS-FR-16): the Offline Wallet's own
 * handle (refused for any other kind), then `writes.ts` `signPrepared`, which
 * refuses a fee over the cap or an Account that is not the handle's, runs the
 * Signing Check and disposes the Signer. Returns the signed QR, whose envelope
 * names the Wallet's Network (OS-FR-11). Throws `SigningCheckError` when the
 * check is dismissed or fails: nothing was signed then.
 */
export async function signRound(
  wallet: { id: string; network: NetworkId },
  build: OfflineBuild,
  data: Pick<DataToSignPayload, 'sequence' | 'fee' | 'ledger_index'>,
  ctx: SigningContext,
  now: () => number = Date.now,
): Promise<SignedRound> {
  const tx = assembleTransaction(build, data)
  const signing = await offlineSigningHandleFor(wallet.id, ctx)
  const signed = await signPrepared(signing, tx)
  return {
    text: encodeSigned({ network: wallet.network, txBlob: signed.tx_blob }).text,
    hash: signed.hash,
    lastLedgerSequence: tx.LastLedgerSequence as number,
    signedAt: now(),
  }
}

// ---------------------------------------------------------------------------
// The kept round: in memory only, per Wallet, erased when its lock closes
// (OS-FR-13, OS-FR-16: "Kept Build and its request ID live only while the Wallet
// is unlocked; a lock erases both"). Never persisted.
// ---------------------------------------------------------------------------

export type RoundPhase =
  /** Back on the form after "Change the transaction" (P-10), its values kept. */
  | { name: 'editing' }
  | { name: 'reviewed' }
  | { name: 'request'; requestId: string; notice?: 'not-signed' }
  | { name: 'signing'; requestId: string; data: DataToSignPayload; warning: 'lower' | 'too-high' | null }
  | { name: 'signed'; signed: SignedRound }

export interface Round {
  lockId: string
  build: OfflineBuild
  phase: RoundPhase
}

const rounds = new Map<string, Round>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function roundOf(walletId: string): Round | null {
  return rounds.get(walletId) ?? null
}

export function setRound(walletId: string, round: Round): void {
  rounds.set(walletId, round)
  notify()
}

export function clearRound(walletId: string): void {
  if (rounds.delete(walletId)) notify()
}

/** A lock closed: every round of a Wallet on it is gone, Build, request ID and signed QR. */
export function eraseRoundsOfLocks(lockIds: readonly string[]): void {
  let changed = false
  for (const [walletId, round] of rounds) {
    if (lockIds.includes(round.lockId)) {
      rounds.delete(walletId)
      changed = true
    }
  }
  if (changed) notify()
}

export function subscribeRounds(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test seam: no rounds. */
export function resetRounds(): void {
  rounds.clear()
  notify()
}
