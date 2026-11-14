import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as W from '../signs-for-words'
import { DATA_REFUSAL } from '../offline-round-words'

/** OS-FR-12: every Signs-for string is copied from its source, never retyped. */
const SPINE = readFileSync('_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md', 'utf8')
const FIXED = readFileSync('_bmad-output/specs/spec-offline-signing/consequence-texts.md', 'utf8')

function row(id: string): string {
  const found = SPINE.split('\n').filter((l) => l.startsWith(`| ${id} |`))
  expect(found, `exactly one ${id} row`).toHaveLength(1)
  return found[0]
}
const quoted = (s: string) => `"${s}"`

describe('Signs-for words (OS-FR-20)', () => {
  it('"This key signs for another account" is a fixed string of the spec', () => {
    expect(FIXED).toContain(`| Create/import, optional step | ${quoted(W.SIGNS_FOR_ANOTHER_ACCOUNT)} | OS-FR-20 |`)
  })

  it.each([
    ['P-40', W.MUST_BE_REGULAR_KEY],
    ['P-54', W.SET_WALLET_TO_SIGN_FOR],
    ['P-54', W.SET_IT],
    ['P-54', W.NOT_NOW],
    ['P-54', W.SET_IT_ELSEWHERE],
  ])('%s holds %s', (id, words) => {
    expect(row(id)).toContain(quoted(words))
  })

  it("the card line is P-17's Account sentence, unchanged", () => {
    expect(row('P-17')).toContain(`This wallet signs for {address}."`)
    expect(DATA_REFUSAL.account.endsWith(` ${W.WALLET_SIGNS_FOR}`)).toBe(true)
  })
})
