/**
 * The approved words of the Transmitter Wallet (OS-FR-3, OS-FR-4, OS-FR-9,
 * OS-FR-22, OS-FR-12). Each is copied character for character from the offline
 * signing UX spine (`_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md`,
 * P-n approved by the owner on 2026-11-08) or from the spec's fixed strings
 * (`_bmad-output/specs/spec-offline-signing/consequence-texts.md`).
 * `transmitter-words.test.ts` compares each one with its source. A `{name}` is a
 * slot, filled in order by `fill` (`transmit-words.ts`).
 */

/** P-2: the chooser key, the Add Transmitter screen title and its final key. */
export const ADD_TRANSMITTER = 'Add a Transmitter wallet'

/** Fixed string: the Synced address plate key and the quiz step title (OS-FR-4). */
export const SYNC_TO_AN_ADDRESS = 'Sync to an address'

/** P-41: the quiz Sync step line, and its key. */
export const SYNC_LATER = 'You can do this step later in Local settings.'
export const SKIP_THIS_STEP = 'Skip this step'

/** P-46: the Synced address plate key that removes the Sync. */
export const REMOVE_THE_ADDRESS = 'Remove the address'

/** P-8: the same address as an Offline and a Transmitter Wallet. First form: on
 * Add Transmitter and Sync. Second form: on an Offline create or import. */
export const SAME_ADDRESS_OFFLINE_HERE =
  'WARNING: An offline wallet on this device has this address. Thus the offline key is on a device that connects to the internet.'
export const SAME_ADDRESS_TRANSMITTER_HERE =
  'WARNING: A Transmitter wallet on this device has this address. Thus the offline key is on a device that connects to the internet.'

/** P-48, first line: the Transmitter's This wallet plate. */
export const NO_KEY = 'This wallet has no key. It cannot sign.'

/** P-42: the Transmit scanner line. */
export const TRANSMIT_SCANNER_LINE =
  'Scan a code from your offline wallet. The code can be a request for data to sign or a signed transaction.'

/** P-25: the Transmit step check list. */
export const CHECK_LIST = {
  signature: 'Signature: correct',
  account: 'Account: {address}, correct',
  network: 'Network: {Network}',
  timeLimit: 'Time limit: valid until ledger {n}',
} as const

/** P-27: no expected Account (unsynced, not an answered request). */
export const CONFIRM_ACCOUNT = 'Make sure that this is your account: {address}. When you select Send, you confirm the account.'

/** P-36: a code of the wrong kind; on Transmit, an Unsigned Transaction. */
export const WRONG_KIND = 'This code is a {kind}. This screen needs a {kind}.'
export const UNSIGNED_ON_TRANSMIT = 'Scan this code with the offline wallet. Do not scan it here.'

/** P-29: a key-state row whose read failed. */
export const VALUE_UNKNOWN = 'Unknown. The app cannot read this value.'

/** P-32: the Delegates plate. Empty is "None."; a failed read is P-29. */
export const DELEGATE_WARNING = 'WARNING: A delegate can send transactions for this account.'
export const NONE = 'None.'
