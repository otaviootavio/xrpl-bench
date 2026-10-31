import type { SigningKind } from '@/lib/crypto/policy'

/** The words for a Wallet's checks. The Edit checks screen and the Configure
 * Checks plate both read from here, so a check is never summarised two ways
 * (copy issues 8a-8i). */

export const OPEN_CHECK_QUESTION = 'Authentication required to open the wallet'
export const SIGNING_CHECK_QUESTION = 'Authentication required to sign a transaction'
export const NO_OPEN_CHECK_ANSWER = 'No authentication required to open the wallet'
export const STANDARD_SIGNING_ANSWER = 'Nothing is asked for signing.'

export function openCheckWords(kind: string): string {
  switch (kind) {
    case 'pin':
      return 'App PIN'
    case 'passkey':
      return 'Passkey'
    case 'either':
      return 'Passkey or App PIN, shared with the other wallets on this lock'
    default:
      return NO_OPEN_CHECK_ANSWER
  }
}

export function signingWords(kind: SigningKind): string {
  return kind === 'standard' ? STANDARD_SIGNING_ANSWER : kind === 'passkey' ? 'Passkey only' : 'App PIN only'
}

/** The sentence under the no-check answer where the choice list gives one. */
export const NO_OPEN_CHECK_DETAIL = 'Testnet and Devnet only.'

/** One plain line beside the Create wallet / Import wallet action. */
export function createConsequence(network: string, imported: boolean): string {
  if (network === 'mainnet') return imported ? 'This wallet holds real funds. Nobody can recover its Seed for you.' : 'This wallet will hold real funds. Nobody can recover its Seed for you.'
  return 'This wallet holds test funds only.'
}

/** The Review's Network row note: the row has no Change button, so it says where to change it and what that costs. */
export const NETWORK_LOCKED_NOTE = 'Locked. To change it, go Back to step 1; the questions then start again.'
