import type { SigningKind } from '@/lib/crypto/policy'

/** The words for a Wallet's checks. The Edit checks screen and the Configure
 * Checks plate both read from here, so a check is never summarised two ways
 * (copy issues 8a-8i). */

export function openCheckWords(kind: string): string {
  switch (kind) {
    case 'pin':
      return 'App PIN'
    case 'passkey':
      return 'Passkey'
    case 'either':
      return 'Passkey or App PIN, shared with the other wallets on this lock'
    default:
      return 'No Open Check'
  }
}

export function signingWords(kind: SigningKind): string {
  return kind === 'standard' ? 'Standard' : kind === 'passkey' ? 'Passkey only' : 'App PIN only'
}

/** The sentence under a check's name where the choice list gives one. */
export const NO_OPEN_CHECK_DETAIL = 'Nothing is asked to open the wallet. Testnet and Devnet only.'
export const STANDARD_SIGNING_DETAIL = 'Nothing is asked for signing.'
