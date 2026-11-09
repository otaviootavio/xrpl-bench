import type { WarningText } from '@/lib/offline-wallet-words'

/**
 * The approved words for changing a Wallet's kind and the Was-online mark
 * (OS-FR-5, OS-FR-6, OS-FR-7, OS-FR-12). Texts C and D and the fixed strings are
 * copied character for character from
 * `_bmad-output/specs/spec-offline-signing/consequence-texts.md`; P-4, P-35, P-39,
 * P-43 and P-63 from the offline signing UX spine (`EXPERIENCE.md`), approved by
 * the owner on 2026-11-08. `kind-change-words.test.ts` compares each one with its
 * source. Never reword one here. A `{name}` is a slot, filled by `fill`
 * (`transmit-words.ts`).
 */

/** Fixed strings (OS-FR-5, OS-FR-6): the Wallet kind plate key, the task screen title and its confirm key. */
export const CHANGE_TO_OFFLINE = 'Change to an offline wallet'
export const CHANGE_TO_ONLINE = 'Change to an online wallet'

/** Fixed string (OS-FR-7): the card stamp and the Wallet kind plate stamp, always with P-4. */
export const WAS_ONLINE = 'Was online'

/** P-4: beside "Was online". */
export const WAS_ONLINE_WHY = 'The key of this wallet was on a device that connected to the internet.'

/** Text C. Change an online wallet to an offline wallet: five lines, a WARNING, the
 * never-online steps under their lead line, then a second WARNING. */
export const TEXT_C: {
  lines: readonly string[]
  keyWarning: WarningText
  stepsLead: string
  steps: readonly string[]
  offlineWarning: WarningText
} = {
  lines: [
    'This wallet stops all connections to the XRP Ledger.',
    'This device does not show the balance or history of this wallet after the change.',
    'The node setting goes away. The network does not change.',
    'The address and the funds do not change.',
    'To send a transaction after the change, you must have a Transmitter wallet on a second device.',
  ],
  keyWarning: {
    title: 'WARNING: This change does not make your key safe.',
    body:
      'The key was on a device that connected to the internet. If malware found the key before the change, ' +
      'the malware still has it. The change cannot remove that risk.',
  },
  stepsLead: 'To get a key that was never online:',
  steps: [
    'Create a new offline wallet on a device that is disconnected.',
    'Move your funds to the new address, or set the new key as the Regular Key of this account.',
    'If you set a Regular Key, turn off the master key of this account. You must sign this with the old key.',
  ],
  offlineWarning: {
    title: 'WARNING: The app cannot make your device offline.',
    body: 'Disconnect the device before you sign with this wallet.',
  },
}

/** Text D. Change an offline wallet to an online wallet: five lines, then two WARNINGs. */
export const TEXT_D: { lines: readonly string[]; warnings: readonly WarningText[] } = {
  lines: [
    'This wallet connects to the XRP Ledger.',
    'The wallet keeps its network. You must select a node.',
    'This device shows the balance and history of this wallet.',
    'This wallet can sign and send transactions without a second device.',
    'Signed transactions that you did not send are still valid until they expire.',
  ],
  warnings: [
    {
      title: 'WARNING: The key will be on a device that connects to the internet.',
      body: 'Malware or a dangerous browser extension can find it. After this change, the key is not an offline key.',
    },
    {
      title: 'WARNING: You cannot undo this risk.',
      body: 'If you change the wallet back to offline later, the key is still a key that was online. For a large amount, keep this wallet offline.',
    },
  ],
}

/** P-35: Change to an online wallet refused, the same address on the same Network. */
export const SAME_ADDRESS_ON_NETWORK = 'Another wallet on this device has this address on {Network}.'

/** P-39: the typed confirm on Mainnet, and the phrase it asks for (today's "turn off" pattern). */
export const ONLINE_PHRASE = 'change to online'
export const ONLINE_PHRASE_LABEL = 'Type “change to online” to confirm'

/** P-43: the result of Change to an offline wallet. */
export const NOW_OFFLINE = 'This wallet is now an offline wallet. The app removed the node setting. The network is {Network}.'

/** P-63: why "Change to an offline wallet" is not available for a Passkey-Derived Seed Wallet. */
export const PASSKEY_SEED_NOT_OFFLINE =
  'This wallet uses a Passkey-Derived Seed. The passkey syncs to the cloud. Thus this wallet cannot be an offline wallet.'
