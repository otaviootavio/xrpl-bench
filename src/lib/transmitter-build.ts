import type { QueryClient } from '@tanstack/react-query'
import type { TransmitterMeta } from '@/lib/crypto/keystore'
import { decode } from 'xrpl'
import { encodeUnsigned, type KeyState } from '@/lib/qr-codec'
import { builtTransaction, canonicalLimit, type MasterKeyBuild, type RegularKeyBuild, type TrustLineBuild } from '@/lib/offline-round'
import { OFFLINE_LEDGER_WINDOW } from '@/lib/offline-window'
import { preflight, type AnswerChecks, type CheckedTx } from '@/lib/answer-request'

/**
 * The Synced Transmitter's Builds (OS-FR-17, route-checks "Transmitter Wallet":
 * "Builds only when Synced, only for the Synced address, for every write the app
 * can build"). The online app builds an XRP Payment, a token Payment, a TrustSet,
 * a SetRegularKey and the master key flag; the Transmitter builds each of them,
 * and nothing more. It never signs.
 */

type WithoutAccount<T> = Omit<T, 'account'>
export type TransmitterBuild =
  | { type: 'payment'; destination: string; amountDrops: string; destinationTag?: number }
  /** Online Send's issued Payment: no SendMax, no Paths, no flags. */
  | { type: 'token-payment'; destination: string; currency: string; issuer: string; value: string; destinationTag?: number }
  | WithoutAccount<TrustLineBuild>
  | WithoutAccount<RegularKeyBuild>
  | WithoutAccount<MasterKeyBuild>

/** The Built fields for the Synced address: the same transaction online sending builds. */
export function transmitterTx(account: string, build: TransmitterBuild): CheckedTx {
  switch (build.type) {
    case 'payment':
      return builtTransaction({ ...build, account })
    case 'token-payment':
      return {
        TransactionType: 'Payment',
        Account: account,
        Destination: build.destination,
        // The value in one canonical form ("5.10", ".5" and "05" as the codec writes them), so the
        // Offline Wallet, which refuses a value the codec would rewrite, can show it (round two).
        Amount: { currency: build.currency, issuer: build.issuer, value: canonicalLimit(build.value) ?? build.value },
        ...(build.destinationTag !== undefined ? { DestinationTag: build.destinationTag } : {}),
      }
    default:
      return builtTransaction({ ...build, account })
  }
}

export type MakeResult =
  | {
      status: 'made'
      /** The Unsigned Transaction QR: `{v, network_id, ledger_index, tx}`. */
      text: string
      tx: Record<string, unknown>
      /** The validated ledger index it was built on: the envelope's. */
      ledgerIndex: number
      checks: AnswerChecks
      /** For a key change: the Account's key state the pre-flight read (W5 on this screen). */
      keyState?: KeyState
    }
  | { status: 'refused'; reason: string }
  | { status: 'read-failed' }

/**
 * Makes the Unsigned Transaction (OS-FR-17): the online pre-flight for the Synced
 * address on fresh reads (the same function that answers a request, so the same
 * refusals in the same words), then the Built fields plus the Sequence and Fee it
 * read and LastLedgerSequence = the validated index + the usual window (150, about
 * ten minutes, as the other route), in an envelope with this Wallet's Network and
 * that index. A failed read never makes one.
 */
export async function makeUnsigned(wallet: TransmitterMeta, build: TransmitterBuild, ctx: { queryClient: QueryClient }): Promise<MakeResult> {
  const account = wallet.address
  // Only when Synced, only for the Synced address.
  if (account === null) return { status: 'read-failed' }
  const built = transmitterTx(account, build)
  const checked = await preflight(wallet, account, built, ctx)
  if (checked.status !== 'ok') return checked
  const { values } = checked
  const tx: Record<string, unknown> = {
    ...built,
    Fee: values.fee,
    Sequence: values.sequence,
    LastLedgerSequence: values.ledgerIndex + OFFLINE_LEDGER_WINDOW,
  }
  const text = encodeUnsigned({ network: wallet.network, tx, ledgerIndex: values.ledgerIndex }).text
  return { status: 'made', text, tx, ledgerIndex: values.ledgerIndex, checks: checked.checks, ...(checked.keyState !== undefined ? { keyState: checked.keyState } : {}) }
}

/** Keys sorted at every level, a missing `Flags` read as 0, hex letter case aside. */
function canonicalText(tx: Record<string, unknown>): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]))
        : v
  return JSON.stringify(sort({ Flags: 0, ...tx })).toUpperCase()
}

/**
 * Whether a scanned signed blob is the Unsigned Transaction this screen made (round two): the
 * decoded blob less `SigningPubKey` and `TxnSignature` equals it. A signed code from an earlier
 * Build (before "Change the transaction") is not, and is never sent from this plate.
 */
export function signedIsMade(txBlob: string, made: Record<string, unknown>): boolean {
  try {
    const { SigningPubKey: _k, TxnSignature: _s, ...rest } = decode(txBlob) as Record<string, unknown>
    return canonicalText(rest) === canonicalText(made)
  } catch {
    return false
  }
}
