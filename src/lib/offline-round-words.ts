/**
 * The words of the Offline-builds round (OS-FR-11, OS-FR-13 to OS-FR-16,
 * OS-FR-12). Each P-n is copied character for character from the offline signing
 * UX spine (`_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md`,
 * approved by the owner on 2026-11-08); each fixed string from the spec's
 * `consequence-texts.md`; each shipped string from the screen that already shows
 * it (online Send, two-device signing, the funds check). `offline-round-words.test.ts`
 * compares every one with its source. A `{name}` is a slot, filled in order by
 * `fill` (`transmit-words.ts`).
 */

/** P-1: in the slot of every reading the online screen shows. */
export const FROM_TRANSMITTER = 'The Transmitter wallet gives this value.'

/** Fixed string: the request QR plate's title. */
export const DATA_TO_SIGN_NEEDED = 'Data to sign needed'
/** P-9: the request QR plate line. */
export const REQUEST_LINE = 'Scan this code with the Transmitter wallet on your online device.'
/** P-10: the request plate's change key, and its line. */
export const CHANGE_THE_TRANSACTION = 'Change the transaction'
export const CHANGE_RESTARTS = 'If you change the transaction, the app starts the request again.'
/** P-11: the Data-to-Sign scan plate line. */
export const SCAN_DATA_LINE = 'Scan the data to sign from the Transmitter wallet.'
/** P-37: the Offline review key. */
export const SHOW_THE_REQUEST = 'Show the request'

/** P-57: the Data to Sign plate line, the check heading and results, the scan plate title. */
export const DATA_PLATE_LINE = 'Scan this code with the offline wallet.'
export const CHECKED_ON = 'Checked on {Network}'
export const CHECK_RESULT = {
  found: 'found',
  supplied: 'supplied',
  sufficient: 'sufficient',
  underFeeLimit: 'less than the fee limit',
} as const
export const SCAN_DATA_TITLE = 'Scan the data to sign'

/** Fixed string, with the Wallet's Network in place of "Mainnet": the signing-network well. */
export const SIGNING_FOR = 'You are signing for {Network}'
/** P-13 (Offline-builds) and P-51: the well's scale marks. */
export const TIME_LIMIT_TEN_MINUTES = 'Time limit: approximately 10 minutes'
export const VALID_UNTIL_LEDGER = 'Valid until ledger {n}'

/** P-14: the highest-seen ledger warning, one of the two first lines, then the third. */
export const LEDGER_LOWER = 'The ledger index is lower than an index that this wallet received before.'
export const LEDGER_TOO_HIGH = 'The ledger index is too high for the time since the last index.'
export const CHECK_THE_TRANSMITTER = 'Make sure that the Transmitter wallet is correct before you sign.'

/** P-16: the refusal heading on the offline device; P-34's result is the same sentence. */
export const NOT_SIGNED = 'The app did not sign the transaction.'
/** P-17: the refusal reasons used by this route. */
export const DATA_REFUSAL = {
  request: 'This data is for a different request.',
  malformed: 'This data has an incorrect value, or a value is missing.',
  fee: 'The fee is more than the fee limit.',
  network: 'This transaction is for {Network}. This wallet is for {Network}.',
  account: 'This transaction is for {address}. This wallet signs for {address}.',
} as const

/** P-34: the Offline refuse key. */
export const DO_NOT_SIGN = 'Do not sign'

/** P-12: the signed QR plate lines; {duration} is "10 minutes" on this route. */
export const SIGNED_NOT_SENT = 'The app did not send this transaction. To send it, scan this code with the Transmitter wallet.'
export const SIGNED_VALID_UNTIL = 'This transaction is valid until ledger {n}. That is approximately {duration} after {time}.'
export const TEN_MINUTES = '10 minutes'

/** P-18: the Kept transaction plate. ("Start the request again" is story 7's.) */
export const KEPT_TITLE = 'Kept transaction'
export const KEPT_LINE = 'This device keeps the transaction until you record the result. A lock erases the transaction.'
export const I_KNOW_THE_RESULT = 'I know the result'
export const CANCEL_THIS_TRANSACTION = 'Cancel this transaction'

/** P-61: the confirm before the kept transaction is erased. */
export const ERASE_QUESTION = 'Erase the kept transaction? The signed transaction is valid until ledger {n}.'
export const ERASE = 'Erase'
export const KEEP_IT = 'Keep it'

/** P-58: before an auto-lock during a round. */
export const LOCKS_SOON = 'This wallet locks in 1 minute. A lock erases the kept transaction.'
export const KEEP_IT_UNLOCKED = 'Keep it unlocked'

/** P-59: the QR plate key; "Back" returns from the larger code. */
export const MAKE_THE_CODE_LARGER = 'Make the code larger'
export const BACK = 'Back'

/** P-28: the Transmitter answer screen, failed read, and its key. */
export const ANSWER_READ_FAILED = 'The app cannot read the ledger. The app did not make data to sign.'
export const READ_AGAIN = 'Read again'

/** P-55: the Transmitter answer refusals. */
export const ANSWER_REFUSAL = {
  network: 'The app did not answer. This request is for {Network}. This wallet is for {Network}.',
  address: 'The app did not answer. This request is for {address}. This wallet is synced to {address}.',
} as const

/** P-62: the type word on New transaction (this build has the Payment type only). */
export const PAYMENT = 'Payment'

/**
 * Shipped words, reused unchanged where the online screens already say the same
 * thing (online Send, the funds check, two-device signing). The test finds each
 * one in the file that ships it.
 */
export const SHIPPED = {
  destinationAddress: 'Destination address',
  invalidAddress: "That doesn't look like a valid XRPL address.",
  selfSend: "You can't send a payment to your own address.",
  destinationTagUnknown: 'Destination tag (requirement unknown)',
  amount: 'Amount',
  networkFee: 'Network fee',
  spendable: 'Spendable',
  reviewPayment: 'Review payment',
  destinationNotActivatedTitle: 'Destination not activated',
  destinationNotActivated:
    "This address doesn't exist on-ledger yet. If you send less than the base reserve in XRP, this payment will fail to activate it.",
  tagRequired: 'The destination requires a destination tag. Nothing was built.',
  accountNotActivated: "This account isn't activated yet, so there is no spendable balance to check this against.",
  overSpendable: "That's more than your spendable balance ({amount}) once the network fee is included.",
} as const

/** Check-list and field terms are the ledger's own field names (P-52 keeps them as the ledger names them). */
export const FIELD = { destination: 'Destination', destinationTag: 'DestinationTag', fee: 'Fee' } as const
