import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BEFORE_SENDING_DESCRIPTION,
  BEFORE_SENDING_PLATE,
  COPY_KEY,
  DO_NOT_SEND_KEY,
  EXPIRED_NOTHING_SENT,
  fill,
  LEDGER_UNREAD,
  NOT_SENT,
  REFUSAL,
  SEND_IT_QUESTION,
  SEND_KEY,
  SHOW_BEFORE_SENDING,
  SIGN_KEY,
  STILL_VALID_WARNING,
  TRANSACTION_HASH,
} from '../transmit-words'

/**
 * OS-FR-9, OS-FR-10, OS-FR-12: the Transmit step's words are copied from the UX
 * spine and the spec's fixed strings, never retyped. Each must appear verbatim in
 * its own row, so a drift in either file fails here.
 */
const SPINE = readFileSync('_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md', 'utf8')
const TEXTS = readFileSync('_bmad-output/specs/spec-offline-signing/consequence-texts.md', 'utf8')

/** The one spine row that starts with `| {id} |`. */
function row(id: string): string {
  const found = SPINE.split('\n').filter((l) => l.startsWith(`| ${id} |`))
  expect(found, `exactly one ${id} row`).toHaveLength(1)
  return found[0]
}

describe('Transmit step words (OS-FR-9, OS-FR-10)', () => {
  it('P-26: the heading and every reason, quoted whole', () => {
    const p26 = row('P-26')
    expect(p26).toContain(`"${NOT_SENT}"`)
    for (const reason of Object.values(REFUSAL)) expect(p26).toContain(`"${reason}"`)
    // Expiry is not one of P-26's reasons: the row points to the fixed string
    // instead, so the fixed string is quoted in the row as that pointer.
    expect(p26).toContain(`(Expiry uses the fixed "${EXPIRED_NOTHING_SENT}")`)
  })

  it('P-24: the warning and its decline line, quoted whole', () => {
    const p24 = row('P-24')
    expect(p24).toContain(`"${STILL_VALID_WARNING}"`)
    expect(p24).toContain(`Decline adds "${NOT_SENT}"`)
  })

  it('the fixed strings are in the spec table', () => {
    expect(TEXTS).toContain(`| Transmitter, window passed | "${EXPIRED_NOTHING_SENT}" |`)
    expect(TEXTS).toContain(`| Show-before-sending prompt | "${SEND_IT_QUESTION}" |`)
  })

  it('P-44 and P-52 are quoted whole', () => {
    expect(row('P-44')).toContain(`"${BEFORE_SENDING_DESCRIPTION}"`)
    expect(row('P-52')).toContain(`"${TRANSACTION_HASH}"`)
  })

  it('the words the owner approved on 2026-11-08 (round two) are exactly these literals', () => {
    expect([SEND_KEY, DO_NOT_SEND_KEY, COPY_KEY, SIGN_KEY, BEFORE_SENDING_PLATE, SHOW_BEFORE_SENDING]).toEqual([
      'Send',
      'Do not send',
      'Copy',
      'Sign',
      'Before sending',
      'Show the signed transaction before sending',
    ])
    expect(`${NOT_SENT} ${LEDGER_UNREAD}`).toBe('The app did not send the transaction. The app cannot read the ledger.')
  })

  it('fill puts each value in its own slot, in order, and keeps a slot with no value', () => {
    expect(fill(REFUSAL.network, 'Mainnet', 'Testnet')).toBe('This transaction is for Mainnet. This wallet sends on Testnet.')
    expect(fill(STILL_VALID_WARNING, 1020)).toContain('until ledger 1020.')
    expect(fill(REFUSAL.account, 'rA')).toBe('The account rA signed this transaction. The correct account is {address}.')
  })
})
