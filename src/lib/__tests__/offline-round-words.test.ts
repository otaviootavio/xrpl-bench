import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as W from '../offline-round-words'
import { fill } from '../transmit-words'

/**
 * OS-FR-12: the Offline-builds round's words are copied, never retyped. Each P-n
 * must appear quoted, whole, in its own row of the UX spine; each fixed string in
 * the spec's fixed strings; each shipped string in the file that ships it.
 */
const SPINE = readFileSync('_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md', 'utf8')
const FIXED = readFileSync('_bmad-output/specs/spec-offline-signing/consequence-texts.md', 'utf8')
const SEND_TAB = readFileSync('src/pages/tabs/SendTab.tsx', 'utf8')
const FUNDS = readFileSync('src/lib/xrpl/funds-check.ts', 'utf8')
const TWO_DEVICE = readFileSync('src/lib/two-device.ts', 'utf8')
const TRUST_TAB = readFileSync('src/pages/tabs/TrustLinesTab.tsx', 'utf8').replace(/\s+/g, ' ')
const TWO_DEVICE_SIGN = readFileSync('src/components/wallet/TwoDeviceSign.tsx', 'utf8')
const MASTER_KEY_CONTROL = readFileSync('src/components/wallet/MasterKeyControl.tsx', 'utf8')
const CONTROL = readFileSync('src/lib/control.ts', 'utf8')
const MASTER_KEY = readFileSync('src/lib/master-key.ts', 'utf8')
const QR_SCANNER = readFileSync('src/components/wallet/QrScanner.tsx', 'utf8')
const CREATE_FLOW = readFileSync('src/components/wallet/CreateWalletFlow.tsx', 'utf8')

function row(id: string): string {
  const found = SPINE.split('\n').filter((l) => l.startsWith(`| ${id} |`))
  expect(found, `exactly one ${id} row`).toHaveLength(1)
  return found[0]
}
const quoted = (s: string) => `"${s}"`

describe('Offline-builds round words (OS-FR-11, OS-FR-13 to OS-FR-16)', () => {
  it.each([
    ['P-1', W.FROM_TRANSMITTER],
    ['P-9', W.REQUEST_LINE],
    ['P-10', W.CHANGE_THE_TRANSACTION],
    ['P-10', W.CHANGE_RESTARTS],
    ['P-11', W.SCAN_DATA_LINE],
    ['P-12', W.SIGNED_NOT_SENT],
    ['P-12', W.SIGNED_VALID_UNTIL],
    ['P-12', W.TEN_MINUTES],
    ['P-13', W.TIME_LIMIT_TEN_MINUTES],
    ['P-14', W.LEDGER_LOWER],
    ['P-14', W.LEDGER_TOO_HIGH],
    ['P-14', W.CHECK_THE_TRANSMITTER],
    ['P-16', W.NOT_SIGNED],
    ['P-17', W.DATA_REFUSAL.request],
    ['P-17', W.DATA_REFUSAL.malformed],
    ['P-17', W.DATA_REFUSAL.fee],
    ['P-17', W.DATA_REFUSAL.network],
    ['P-17', W.DATA_REFUSAL.account],
    ['P-18', W.KEPT_TITLE],
    ['P-18', W.KEPT_LINE],
    ['P-18', W.I_KNOW_THE_RESULT],
    ['P-18', W.CANCEL_THIS_TRANSACTION],
    ['P-18', W.START_THE_REQUEST_AGAIN],
    ['P-19', W.SIGNED_BEFORE],
    ['P-20', W.RETRY_HIGHER],
    ['P-20', W.CHECK_FIRST],
    ['P-20', W.THIS_IS_A_NEW_PAYMENT],
    ['P-21', W.RETRY_PASSED],
    ['P-22', W.RETRY_SAME_SEQUENCE],
    ['P-23', W.PROBABLY_SENT_BEFORE],
    ['P-23', W.PROBABLY_SENT_BEFORE_LINE],
    ['P-49', W.SIGNED_LIST_LINE],
    ['P-52', W.RECORD_TERMS.sequence],
    ['P-52', W.RECORD_TERMS.hash],
    ['P-52', W.RECORD_TERMS.validUntil],
    ['P-52', W.RECORD_TERMS.signedAt],
    ['P-56', W.SIGNED_LIST_EMPTY],
    ['P-28', W.ANSWER_READ_FAILED],
    ['P-28', W.READ_AGAIN],
    ['P-34', W.DO_NOT_SIGN],
    ['P-34', W.NOT_SIGNED],
    ['P-37', W.SHOW_THE_REQUEST],
    ['P-51', W.VALID_UNTIL_LEDGER],
    ['P-55', W.ANSWER_REFUSAL.network],
    ['P-55', W.ANSWER_REFUSAL.address],
    ['P-57', W.DATA_PLATE_LINE],
    ['P-57', W.CHECKED_ON],
    ['P-57', W.CHECK_RESULT.found],
    ['P-57', W.CHECK_RESULT.supplied],
    ['P-57', W.CHECK_RESULT.sufficient],
    ['P-57', W.CHECK_RESULT.underFeeLimit],
    ['P-57', W.SCAN_DATA_TITLE],
    ['P-58', W.LOCKS_SOON],
    ['P-58', W.KEEP_IT_UNLOCKED],
    ['P-59', W.MAKE_THE_CODE_LARGER],
    ['P-59', W.BACK],
    ['P-61', W.ERASE_QUESTION],
    ['P-61', W.ERASE],
    ['P-61', W.KEEP_IT],
    ['P-62', W.PAYMENT],
  ])('%s holds %s', (id, words) => {
    expect(row(id)).toContain(quoted(words))
  })

  it('"This is a new payment" is a fixed string of the spec', () => {
    expect(FIXED).toContain(quoted(W.THIS_IS_A_NEW_PAYMENT))
  })

  it('the request title is a fixed string of the spec', () => {
    expect(FIXED).toContain(`| Data-to-Sign Request screen | ${quoted(W.DATA_TO_SIGN_NEEDED)} | OS-UJ-1 |`)
  })

  it('the signing-network well is the fixed string with the Wallet\'s Network in its place', () => {
    expect(FIXED).toContain(quoted(fill(W.SIGNING_FOR, 'Mainnet')))
  })

  it('P-52 keeps the ledger field names', () => {
    expect(row('P-52')).toContain('field names in the ledger\'s words')
  })

  it('every shipped string is still shipped by its own screen', () => {
    const S = W.SHIPPED
    for (const words of [S.destinationAddress, S.invalidAddress, S.selfSend, S.destinationTagUnknown, S.networkFee, S.spendable, S.reviewPayment]) {
      expect(SEND_TAB).toContain(words)
    }
    expect(SEND_TAB).toContain('label="Amount"')
    expect(SEND_TAB).toContain(`'${S.tagRequired}'`)
    const [r1, r2] = S.belowReserve.split('{amount}')
    expect(TWO_DEVICE).toContain(`${r1}\${formatXrp(base)}${r2}`)
    expect(FUNDS).toContain(S.accountNotActivated)
    const [before, after] = S.overSpendable.split('{amount}')
    expect(FUNDS).toContain(`${before}\${formatXrp(spendableDrops)}${after}`)
  })

  it('the words approved on 2026-11-10 are pinned as written', () => {
    expect([fill(W.SCAN_COUNT, 1), fill(W.SCAN_COUNT, 2), fill(W.SCAN_COUNT, 3)]).toEqual(['Scan 1 of 3', 'Scan 2 of 3', 'Scan 3 of 3'])
    expect(W.DATA_TO_SIGN_TITLE).toBe('Data to sign')
    expect(W.SIGNED_TRANSACTION_TITLE).toBe('Signed transaction')
    expect(W.CHECKING).toBe('Checking {address} on {Network}')
    expect(W.TYPE_OF_TRANSACTION).toBe('Type of transaction')
    expect(W.SIGNING_KEY).toBe('Signing key')
    expect(W.QR_ALT).toBe('QR code: {payload} for {Network}')
  })

  // Story 8.
  it.each([
    ['P-62', W.TRUST_LINE],
    ['P-62', W.REGULAR_KEY_TYPE],
    ['P-62', W.MASTER_KEY_TYPE],
    ['P-47', W.SET_A_REGULAR_KEY],
    ['P-47', W.REMOVE_THE_REGULAR_KEY],
    ['P-47', W.TURN_OFF_THE_MASTER_KEY],
    ['P-47', W.TURN_ON_THE_MASTER_KEY],
    ['P-50', W.TEST_ELSEWHERE],
    ['P-57', W.SCAN_AN_ADDRESS],
    ['P-57', W.STOP_THE_CAMERA],
  ])('story 8: %s holds %s', (id, words) => {
    expect(row(id)).toContain(quoted(words))
  })

  it('P-56 puts P-1 in place of the current trust lines', () => {
    expect(row('P-56')).toContain('Offline Trust line type, in the place of the current trust lines: P-1')
  })

  it('"Test the Regular Key", W4\'s sentence and W5 are the spec\'s words, verbatim', () => {
    expect(FIXED).toContain(`| Before master key off | ${quoted(W.TEST_THE_REGULAR_KEY)} | OS-FR-21 W4 |`)
    const flat = FIXED.replace(/\s+/g, ' ')
    expect(flat).toContain(quoted(W.W4_SENTENCE))
    expect(flat).toContain(`**W5. Replacing a Regular Key that is set.** ${quoted(W.W5_SENTENCE)}`)
  })

  it('story 8\'s shipped words are still shipped by their own screens', () => {
    const K = W.SHIPPED_KEYS
    for (const words of [K.issuerAddress, K.currencyCode, K.trustLimit, K.newLimit, K.currencyError, K.addLine, K.ownerReserve]) {
      expect(TRUST_TAB).toContain(words)
    }
    expect(TRUST_TAB).toContain(`<CardTitle>${K.trustLines}</CardTitle>`)
    expect(TRUST_TAB).toContain(`<Button>${K.addTrustLine}</Button>`)
    expect(TRUST_TAB).toContain(`<DialogTitle>${K.editTrustLineLimit}</DialogTitle>`)
    expect(TRUST_TAB).toContain(`'${K.closeTrustLine}'`)
    expect(TRUST_TAB).toContain(W.SHIPPED.trustLineNotActivated)
    expect(TRUST_TAB).toContain(`"${W.SHIPPED.trustLineNotEnough}"`)
    expect(CONTROL).toContain(W.SHIPPED.noKeysToChange)
    expect(MASTER_KEY).toContain(W.SHIPPED.noMasterKeySetting)
    // Story 12 retires TwoDeviceSign: pin this as a literal then.
    expect(TWO_DEVICE_SIGN).toContain(`>${K.regularKeyAddress}</Label>`)
    expect(MASTER_KEY_CONTROL).toContain(`text: '${K.masterKeyOn}'`)
    expect(MASTER_KEY_CONTROL).toContain(`text: '${K.masterKeyOff}'`)
    expect(MASTER_KEY_CONTROL).toContain(`const OFF_PHRASE = '${K.offPhrase}'`)
    expect(MASTER_KEY_CONTROL).toContain('Type “{OFF_PHRASE}” to confirm')
    expect(K.offPhraseLabel).toBe(`Type “${K.offPhrase}” to confirm`)
    expect(QR_SCANNER).toContain(`'${K.cameraFailed}'`)
    expect(CREATE_FLOW).toContain(`title: '${K.review}'`)
  })

  it('the words approved on 2026-11-14 (story 8 round two) are pinned as written', () => {
    expect(W.SIGNER_LIST).toBe('Signer list')
    expect(fill(W.SIGNER_LIST_VALUE, 3, 2)).toBe('3 signers, quorum 2')
    expect(W.KEY_STATE).toBe('Key state')
    expect(W.SHIPPED_KEYS.review).toBe('Review')
  })
})
