/**
 * The approved words for choosing a Wallet's kind on create and import
 * (OS-FR-2, OS-FR-7, OS-FR-12, OS-FR-23). Texts A, B and E, the OS-FR-23 warning
 * and the question are copied character for character from
 * `_bmad-output/specs/spec-offline-signing/consequence-texts.md`; P-6, P-7 and
 * P-60 from the offline signing UX spine (`EXPERIENCE.md`), approved by the owner
 * on 2026-11-08. `offline-wallet-words.test.ts` compares each one with its source.
 * Never reword one here: a change needs a PRD change first.
 */

/** A bold WARNING line: its bold first sentence, then the rest of the line. */
export interface WarningText {
  title: string
  body: string
}

/** The fixed string for quiz step 1 (OS-FR-2): the kind radio group's legend. */
export const KIND_QUESTION = 'Online wallet or offline wallet?'

/** Text A. Online wallet (create quiz). No acknowledgement. */
export const TEXT_A: readonly string[] = [
  'This device keeps the key and connects to the XRP Ledger.',
  'This device can show your balance and history.',
  'This device can sign and send transactions without help.',
  'The key is on a device that connects to the internet. Malware or a dangerous browser extension can find it.',
  'Use an online wallet for small amounts and for daily payments.',
]

/** Text B. Offline wallet (create quiz): six plain lines, then one WARNING that must be acknowledged. */
export const TEXT_B: { lines: readonly string[]; warning: WarningText } = {
  lines: [
    'This device keeps the key. It does not connect to the XRP Ledger.',
    'This device cannot show your balance or history.',
    'To send a transaction, you must have a second device with a Transmitter wallet.',
    'You move each transaction between the two devices with a QR code.',
    'The offline wallet does not connect to the network. Before you sign, make sure that the network on the screen is correct.',
    'Use an offline wallet for large amounts.',
  ],
  warning: {
    title: 'WARNING: The app cannot make your device offline.',
    body: 'You must disconnect it before you create this wallet. Turn off Wi-Fi, mobile data and Bluetooth. Do not connect the device again.',
  },
}

/** Text E. Import a seed into an offline wallet: one WARNING that must be acknowledged. */
export const TEXT_E: { warning: WarningText } = {
  warning: {
    title: 'WARNING: An offline wallet does not make an unsafe seed safe.',
    body:
      'The app cannot know where the seed was before. If malware or another person found the seed, they can take the funds. ' +
      'Make sure that you made the seed on an offline device. Make sure that the seed was only on paper. ' +
      'If you are not sure, do not import the seed. Create a new offline wallet. Then move your funds to its new address.',
  },
}

/** OS-FR-23: on the Review, for every kind that holds a Seed, before the Seed is saved. */
export const ONE_SEED_ONE_NETWORK = 'Do not use one seed on more than one network. A transaction signed for one network can be sent on another.'

/** P-6: the acknowledgement checkbox under a warning. */
export const WARNING_READ = 'I read this warning.'

/** P-7: why Next is blocked while a warning is not acknowledged. */
export const READ_EACH_WARNING = 'Read each warning. Then select the box below it.'

/** P-60: status when the kind radio changed after warnings were ticked. */
export const WARNINGS_CHANGED = 'The text below changed. Select the box below each warning again.'
