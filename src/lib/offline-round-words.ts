/**
 * The words of the Offline-builds round (OS-FR-11, OS-FR-13 to OS-FR-16,
 * OS-FR-12). Each P-n is copied character for character from the offline signing
 * UX spine (`_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md`,
 * approved by the owner on 2026-11-08); each fixed string from the spec's
 * `consequence-texts.md`; each shipped string from the screen that already shows
 * it (online Send, the funds check; two-device signing's, retired by story 12, are
 * pinned as literals). `offline-round-words.test.ts` compares every one with its source. A `{name}` is a slot, filled in order by
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

/** P-18: the Kept transaction plate. */
export const KEPT_TITLE = 'Kept transaction'
export const KEPT_LINE = 'This device keeps the transaction until you record the result. A lock erases the transaction.'
export const I_KNOW_THE_RESULT = 'I know the result'
export const START_THE_REQUEST_AGAIN = 'Start the request again'
export const CANCEL_THIS_TRANSACTION = 'Cancel this transaction'

/** P-19: the Same Build notice at review, above the earlier-signing record. */
export const SIGNED_BEFORE = 'You signed the same transaction before.'
/** P-20: retry case (a), a higher Sequence received, and its two keys. */
export const RETRY_HIGHER =
  'The ledger probably applied the earlier transaction. The ledger used its Sequence. Look at the history on the Transmitter wallet before you pay again.'
export const CHECK_FIRST = 'Check first'
/** Fixed string: the key that signs with the received, higher Sequence. */
export const THIS_IS_A_NEW_PAYMENT = 'This is a new payment'
/** P-21: retry case (b), the earlier window passed. */
export const RETRY_PASSED = 'The ledger cannot apply the earlier transaction now. Only this transaction can apply.'
/** P-22: retry case (c), the earlier one still valid. */
export const RETRY_SAME_SEQUENCE = 'This transaction uses the Sequence of the earlier transaction. The ledger can apply only one of the two.'
/** P-23: the Transmit step, `tefPAST_SEQ` on a same-Sequence retry. Never "Failed". */
export const PROBABLY_SENT_BEFORE = 'Probably sent before'
export const PROBABLY_SENT_BEFORE_LINE = 'The ledger probably applied the earlier transaction. Look at the history before you pay again.'
/** P-52: the earlier-signing record's terms. */
export const RECORD_TERMS = {
  sequence: 'Sequence',
  hash: 'Transaction hash',
  validUntil: 'Valid until ledger',
  signedAt: 'Signed at',
} as const
/** P-49: the Signed by this wallet plate line. */
export const SIGNED_LIST_LINE = 'The app does not keep signed transactions. This list has no secret.'
/** P-56: Signed by this wallet, empty. */
export const SIGNED_LIST_EMPTY = 'This wallet did not sign a transaction yet.'

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
 * thing (online Send, the funds check). The test finds each one in the file that
 * ships it, or pins it as a literal when that screen was retired (story 12).
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
  /** Online Send's words for a recipient that requires a tag (its tag label). */
  tagRequired: 'Destination tag (required by recipient)',
  /** Two-device's words (FR-78, retired by story 12) for a payment below the base reserve to a destination not on the ledger. */
  belowReserve: 'The destination is not on the ledger yet and needs at least {amount} to be created. Nothing was built.',
  accountNotActivated: "This account isn't activated yet, so there is no spendable balance to check this against.",
  overSpendable: "That's more than your spendable balance ({amount}) once the network fee is included.",
  /** The online trust-line screen's add refusals (`TrustLinesTab`). */
  trustLineNotActivated: 'This account is not activated on the ledger, so it has no spendable XRP to cover the reserve and fee.',
  trustLineNotEnough: "You don't have enough spendable XRP to cover the reserve and fee.",
  /** The FR-75/FR-77 key screens' words (retired by story 12) for an Account not on the ledger. */
  noKeysToChange: 'This account is not on the ledger yet, so it has no keys to change.',
  noMasterKeySetting: 'This account is not on the ledger yet, so it has no master key setting to change.',
} as const

/** Check-list and field terms are the ledger's own field names (P-52 keeps them as the ledger names them). */
export const FIELD = { destination: 'Destination', destinationTag: 'DestinationTag', fee: 'Fee' } as const

/**
 * Approved by the owner on 2026-11-10 (story 6, review round two), exactly as
 * written. They have no source file, so `offline-round-words.test.ts` pins them
 * as literals.
 */
export const SCAN_COUNT = 'Scan {n} of 3'
export const DATA_TO_SIGN_TITLE = 'Data to sign'
export const SIGNED_TRANSACTION_TITLE = 'Signed transaction'
export const CHECKING = 'Checking {address} on {Network}'
export const TYPE_OF_TRANSACTION = 'Type of transaction'
export const SIGNING_KEY = 'Signing key'
export const QR_ALT = 'QR code: {payload} for {Network}'

// ---------------------------------------------------------------------------
// Story 8: trust lines and key actions on the Offline-builds route.
// ---------------------------------------------------------------------------

/** P-62: the other type words of the Offline type list. */
export const TRUST_LINE = 'Trust line'
export const REGULAR_KEY_TYPE = 'Regular Key'
export const MASTER_KEY_TYPE = 'Master key'

/** P-47: the Regular Key and Master key types' actions in New transaction. */
export const SET_A_REGULAR_KEY = 'Set a Regular Key'
export const REMOVE_THE_REGULAR_KEY = 'Remove the Regular Key'
export const TURN_OFF_THE_MASTER_KEY = 'Turn off the master key'
export const TURN_ON_THE_MASTER_KEY = 'Turn on the master key'

/** Fixed string (OS-FR-21 W4), and P-50: the test on an Offline Wallet points elsewhere. */
export const TEST_THE_REGULAR_KEY = 'Test the Regular Key'
export const TEST_ELSEWHERE = 'The test is optional. If the Regular Key is a wallet on this device, do the test with that wallet. If not, do the test in the wallet that has the key.'

/** P-57: the address scan key, and today's scanner word to stop it. */
export const SCAN_AN_ADDRESS = 'Scan an address with the camera'
export const STOP_THE_CAMERA = 'Stop the camera'

/** W4's sentence and W5 (`consequence-texts.md`, OS-FR-21), verbatim. */
export const W4_SENTENCE = 'After this, the master key cannot sign for this account. Only the Regular Key or a signer list can turn on the master key again.'
export const W5_SENTENCE = 'The old Regular Key stops working.'

/**
 * Shipped words of the online trust-line and key screens, reused for the same facts.
 * The test finds each in the file that ships it.
 */
export const SHIPPED_KEYS = {
  /** TrustLinesTab: the card title (P-56 puts P-1 in place of its list), the three actions, the fields. */
  trustLines: 'Trust Lines',
  addTrustLine: 'Add trust line',
  editTrustLineLimit: 'Edit trust line limit',
  closeTrustLine: 'Close trust line',
  issuerAddress: 'Issuer address',
  currencyCode: 'Currency code',
  trustLimit: 'Trust limit',
  newLimit: 'New limit',
  ownerReserve: 'Owner reserve',
  currencyError: 'Use a 3-character code (like USD) or a 40-character hex code.',
  addLine: 'A trust line locks one more owner reserve while it is open, refunded when you close it. Creating it also spends the network fee.',
  /** TwoDeviceSign's Regular Key address field (retired by story 12). */
  regularKeyAddress: 'Regular Key address',
  /** MasterKeyControl: the state words and the Mainnet typed confirm. */
  masterKeyOn: 'Master key on',
  masterKeyOff: 'Master key off',
  offPhrase: 'turn off',
  offPhraseLabel: 'Type “turn off” to confirm',
  /** QrScanner: a camera that does not open (the address field takes a paste). */
  cameraFailed: 'The camera could not be opened. Paste the text instead.',
  /** The create and Add Transmitter quizzes' review step title: the review key of the types other than Payment. */
  review: 'Review',
} as const

/**
 * Approved by the owner on 2026-11-14 (story 8, review round two), exactly as written:
 * the signer list's row name and value, and the heading over the key state. "Review" as
 * the review key of Trust line, Regular Key and Master key was approved the same day
 * (`SHIPPED_KEYS.review`). No source file, so `offline-round-words.test.ts` pins them.
 * The empty signer list reads "None." (P-32's word, `transmitter-words.ts` `NONE`).
 */
export const SIGNER_LIST = 'Signer list'
export const SIGNER_LIST_VALUE = '{n} signers, quorum {q}'
export const KEY_STATE = 'Key state'

// ---------------------------------------------------------------------------
// Story 9: the Transmitter-builds route (OS-FR-17, OS-FR-18, OS-FR-21).
// ---------------------------------------------------------------------------

/** P-13 (Transmitter-builds): the well's scale mark, the window in ledgers. */
export const TIME_LIMIT_LEDGERS = 'Time limit: {n} ledgers'
/** P-15: a window longer than the usual one (150 ledgers, story 6's window). */
export const LONGER_THAN_USUAL = 'This transaction is valid for more time than usual: {n} ledgers. During this time, a person who has the transaction can send it.'
/** P-17: the refusal reasons of this route, besides story 6's. `{name}` is the field, flag or type. */
export const SIGN_REFUSAL = {
  cannotShow: 'The app cannot show {name} in words.',
  presigned: 'This transaction has a signature already.',
  partialPayment: 'This is a partial payment. The app does not sign partial payments.',
} as const
/** P-33: the Unsigned QR plate line. No plate title is approved, so it heads the plate. */
export const UNSIGNED_LINE = 'Scan this code with the offline wallet. Then scan the signed code from the offline wallet.'
/** P-38: the Synced Transmitter's review key. */
export const MAKE_THE_UNSIGNED = 'Make the unsigned transaction'
/** P-48, second line: the Transmitter's key types in New transaction. */
export const KEY_CHANGE_UNSIGNED = 'When you change a key here, the app makes an unsigned transaction for the offline wallet.'
/** P-57: the signed-QR scan plate title. */
export const SCAN_SIGNED_TITLE = 'Scan the signed transaction'

/**
 * P-53: one caution under each risky row of the offline signing review. `{memo text}` and
 * `{flag in words}` are slots with a space, filled by `fillRisky`; `{flag in words}` takes the
 * ledger's own flag name (P-52 keeps the ledger's names).
 */
export const RISKY = {
  sendMax: 'Not more than {amount} can leave your account. This is more than the amount above.',
  paths: 'The ledger can send this payment through other currencies. Thus the amount that leaves your account can change.',
  deliverMin: 'The destination can receive less than the amount above. The minimum is {amount}.',
  memo: 'This transaction has a memo. All persons can read the memo on the ledger: {memo text}.',
  delegate: 'A delegate sends this transaction for the account {address}.',
  ticket: 'This transaction uses a Ticket, not a Sequence. It can stay valid for a longer time.',
  irreversible: '{flag in words}. You cannot undo this.',
} as const

/** Fills P-53's one slot, whatever its name. */
export function fillRisky(template: string, value: string): string {
  return template.replace(/\{[A-Za-z ]+\}/, () => value)
}

/** W1 and W3 (`consequence-texts.md`, OS-FR-21), verbatim; P-30 when the new key is a Wallet here. */
export const W1_SENTENCE = 'This app cannot sign with this key. Make sure that you hold the key in a different wallet.'
export const W3_SENTENCE = 'This transaction gives control of your account to the key below. Sign it only if you hold that key. Scammers use this to take accounts.'
export const KEY_IS_WALLET_HERE = 'This key is the wallet {name} on this device.'

/** P-12's `{duration}` on this route: the window in minutes at about 4 s a ledger ("10 minutes" for 150). */
export function windowMinutes(ledgers: number): string {
  const minutes = Math.max(1, Math.round((ledgers * 4) / 60))
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

/**
 * Online Send's shipped words the Synced Transmitter's Payment form reuses for the same
 * facts (story 9: "the online fields and reads"). The test finds each in `SendTab.tsx`.
 */
export const SHIPPED_SEND = {
  asset: 'Asset',
  xrp: 'XRP',
  tagOptional: 'Destination tag (optional)',
  checkingDestination: 'Checking destination…',
  notActivatedTitle: 'Destination not activated',
  notActivatedLine: "This address doesn't exist on-ledger yet. If you send less than the base reserve in XRP, this payment will fail to activate it.",
  noTrustLineTitle: "Recipient can't hold this token",
  noTrustLineLine: "They don't have a trust line to this issuer yet, so this payment will most likely fail.",
  destFailedTitle: 'Destination check failed',
  destFailedLine:
    'This address could not be checked against the ledger, so the app cannot tell whether it exists or whether the recipient requires a destination tag. Sending is held until the check succeeds — an untagged payment to an address that requires one cannot be recovered from here.',
  destStaleTitle: 'Destination check is out of date',
  /** `{n}`: the freshness window in seconds, as online Send fills it. */
  destStaleLine:
    'This address was checked more than {n} seconds ago. The answer may no longer hold — an account can start requiring a destination tag at any time — so sending is held until the check is run again.',
  checkAgain: 'Check again',
  linesFailedTitle: 'Token balances could not be read',
  linesFailedLine:
    'Your trust lines could not be read from the ledger, so the tokens you hold cannot be listed and a token amount cannot be checked against your balance. Sending a token is held until this read succeeds; sending XRP does not depend on it and is not held.',
  feeFailedTitle: 'Network fee could not be read',
  feeFailedLine:
    'The current network fee could not be read from the ledger, so it cannot be shown and an XRP amount cannot be checked against your spendable balance with the fee added. Sending XRP is held until this read succeeds; a token send does not depend on this figure and is not held.',
} as const

// ---------------------------------------------------------------------------
// Story 11: Regular Key and master key warnings (OS-FR-21, CAP-14).
// ---------------------------------------------------------------------------

/** W2 (`consequence-texts.md`), verbatim: a black-hole Regular Key, or master key off when the Regular Key is one. */
export const W2_SENTENCE =
  'Nobody holds the key for this address. If you turn off the master key, nobody can use this account again. The funds are lost. A delegate can still act for the account, and old offers and escrows can still run.'

/**
 * P-31: the three key-action ledger refusals in words, as the reason inside today's
 * outcome. `temBAD_REGKEY` is a failed outcome (nothing applied); the two `tec` codes are
 * claimed outcomes (applied, fee taken), shown with each route's claimed fee sentence.
 */
export const LEDGER_REFUSAL = {
  temBAD_REGKEY: 'The Regular Key cannot be the address of the account.',
  tecNO_ALTERNATIVE_KEY: 'The ledger needs a Regular Key or a signer list first.',
  tecNEED_MASTER_KEY: 'Only the master key can turn off the master key.',
} as const
