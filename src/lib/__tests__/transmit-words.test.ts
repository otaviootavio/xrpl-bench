import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EXPIRED_NOTHING_SENT, fill, LEDGER_UNREAD, NOT_SENT, REFUSAL, STILL_VALID_WARNING } from '../transmit-words'

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
    // Expiry is not a P-26 reason: it uses the fixed string.
    expect(p26).toContain(`"${EXPIRED_NOTHING_SENT}"`)
  })

  it('P-24: the warning and its decline line, quoted whole', () => {
    const p24 = row('P-24')
    expect(p24).toContain(`"${STILL_VALID_WARNING}"`)
    expect(p24).toContain(`Decline adds "${NOT_SENT}"`)
  })

  it('P-28: the failed-read sentence is its first sentence', () => {
    expect(row('P-28')).toContain(`"${LEDGER_UNREAD} `)
  })

  it('the fixed expiry string is in the spec table', () => {
    expect(TEXTS).toContain(`| Transmitter, window passed | "${EXPIRED_NOTHING_SENT}" |`)
  })

  it('fill puts each value in its own slot, in order, and keeps a slot with no value', () => {
    expect(fill(REFUSAL.network, 'Mainnet', 'Testnet')).toBe('This transaction is for Mainnet. This wallet sends on Testnet.')
    expect(fill(STILL_VALID_WARNING, 1020)).toContain('until ledger 1020.')
    expect(fill(REFUSAL.account, 'rA')).toBe('The account rA signed this transaction. The correct account is {address}.')
  })
})
