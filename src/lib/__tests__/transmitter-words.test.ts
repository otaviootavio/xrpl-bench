import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as W from '../transmitter-words'
import { MASTER_KEY, REGULAR_KEY, TRANSMITTER_SCREENS } from '../wallet-kind-words'

/**
 * OS-FR-12: every Transmitter string is copied from its source, never retyped.
 * Each must appear quoted, whole, in its own row of the UX spine (or the spec's
 * fixed strings), so a drift in either file fails here.
 */
const SPINE = readFileSync('_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md', 'utf8')
const FIXED = readFileSync('_bmad-output/specs/spec-offline-signing/consequence-texts.md', 'utf8')

function row(id: string): string {
  const found = SPINE.split('\n').filter((l) => l.startsWith(`| ${id} |`))
  expect(found, `exactly one ${id} row`).toHaveLength(1)
  return found[0]
}
const quoted = (s: string) => `"${s}"`

describe('Transmitter words (OS-FR-3, OS-FR-4, OS-FR-9, OS-FR-22)', () => {
  it.each([
    ['P-2', W.ADD_TRANSMITTER],
    ['P-41', W.SYNC_LATER],
    ['P-41', W.SKIP_THIS_STEP],
    ['P-46', W.REMOVE_THE_ADDRESS],
    ['P-8', W.SAME_ADDRESS_OFFLINE_HERE],
    ['P-8', W.SAME_ADDRESS_TRANSMITTER_HERE],
    ['P-48', W.NO_KEY],
    ['P-42', W.TRANSMIT_SCANNER_LINE],
    ['P-25', W.CHECK_LIST.signature],
    ['P-25', W.CHECK_LIST.account],
    ['P-25', W.CHECK_LIST.network],
    ['P-25', W.CHECK_LIST.timeLimit],
    ['P-27', W.CONFIRM_ACCOUNT],
    ['P-36', W.WRONG_KIND],
    ['P-36', W.UNSIGNED_ON_TRANSMIT],
    ['P-29', W.VALUE_UNKNOWN],
    ['P-32', W.DELEGATE_WARNING],
    ['P-32', W.NONE],
  ])('%s holds %s', (id, words) => {
    expect(row(id)).toContain(quoted(words))
  })

  it('"Sync to an address" is a fixed string of the spec', () => {
    expect(FIXED).toContain(`| Transmitter Wallet | ${quoted(W.SYNC_TO_AN_ADDRESS)} | OS-FR-4 |`)
  })

  it('the Transmitter selector labels and the key words are P-62', () => {
    const p62 = row('P-62')
    for (const { label, title } of Object.values(TRANSMITTER_SCREENS)) {
      expect(p62).toContain(quoted(label))
      expect(p62).toContain(quoted(title))
    }
    expect(p62).toContain(quoted(REGULAR_KEY))
    expect(p62).toContain(quoted(MASTER_KEY))
  })
})
