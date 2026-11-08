import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { KIND_WORDS, NOT_SYNCED, OFFLINE_SCREENS, OFFLINE_SIGN_TITLE, TRANSMITTER_SCREENS } from '../wallet-kind-words'

/**
 * OS-FR-1, OS-FR-12: the kind words and the approved P-3, P-5 and P-62 are copied
 * from the UX spine, never retyped. Each must appear verbatim in its own row of
 * the spine's tables, so a drift in either file fails here.
 */
const SPINE = readFileSync('_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md', 'utf8')

/** The one table row that starts with `| {id} |`. */
function row(id: string): string {
  const found = SPINE.split('\n').filter((l) => l.startsWith(`| ${id} |`))
  expect(found, `exactly one ${id} row`).toHaveLength(1)
  return found[0]
}

describe('wallet kind words (OS-FR-1)', () => {
  it('P-3 is the Offline Sign title, quoted whole', () => {
    expect(row('P-3')).toContain(`"${OFFLINE_SIGN_TITLE}"`)
    expect(OFFLINE_SCREENS.signFromTransmitter.title).toBe(OFFLINE_SIGN_TITLE)
  })

  it('P-5 is "Not synced", quoted whole', () => {
    expect(row('P-5')).toContain(`"${NOT_SYNCED}"`)
  })

  it('every P-62 label and title is quoted in the P-62 row', () => {
    const p62 = row('P-62')
    for (const { label, title } of [...Object.values(OFFLINE_SCREENS), ...Object.values(TRANSMITTER_SCREENS)]) {
      expect(p62).toContain(`"${label}"`)
      // Sign's title is P-3, checked above; every other title is in the P-62 row.
      if (title !== OFFLINE_SIGN_TITLE) expect(p62).toContain(`"${title}"`)
    }
    expect(p62).toContain(`(title "${OFFLINE_SCREENS.signed.title}")`)
  })

  it('the kind words are the card table\'s stamps', () => {
    for (const [kind, word] of Object.entries(KIND_WORDS)) {
      const cardRow = SPINE.split('\n').find((l) => l.startsWith(`| ${word} | \``))
      expect(cardRow, `card row for ${kind}`).toBeDefined()
      expect(cardRow).toContain(`[${word}]`)
    }
  })
})
