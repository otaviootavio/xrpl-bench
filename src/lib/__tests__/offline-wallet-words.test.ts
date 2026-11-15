import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  KIND_QUESTION,
  ONE_SEED_ONE_NETWORK,
  READ_EACH_WARNING,
  TEXT_A,
  TEXT_B,
  TEXT_E,
  WARNING_READ,
  WARNINGS_CHANGED,
  type WarningText,
} from '../offline-wallet-words'

/**
 * OS-FR-12: Texts A, B and E, the OS-FR-23 warning and the step 1 question are the
 * words in consequence-texts.md, and P-6, P-7 and P-60 the words in the UX spine.
 * Markdown line wraps, bullets and bold marks are layout; every character of the
 * words themselves must match.
 */
const TEXTS = readFileSync('_bmad-output/specs/spec-offline-signing/consequence-texts.md', 'utf8')
const SPINE = readFileSync('_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md', 'utf8')

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The bullets under one `###` heading, each with its wrapped lines joined. */
function bullets(heading: string): string[] {
  const lines = TEXTS.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`### ${heading}`))
  expect(start, heading).toBeGreaterThanOrEqual(0)
  const out: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('#')) break
    if (line.startsWith('- ')) out.push(line.slice(2))
    else if (line.startsWith('  ') && out.length > 0) out[out.length - 1] += ` ${line}`
    else if (line.trim() !== '') break
  }
  return out.map(collapse)
}

/** A bullet `**title** body` as the module's warning shape. */
function warningOf(bullet: string): WarningText {
  const m = /^\*\*(.+?)\*\* (.+)$/.exec(bullet)
  expect(m, bullet).not.toBeNull()
  return { title: m![1], body: m![2] }
}

/** The one spine table row that starts with `| {id} |`. */
function row(id: string): string {
  const found = SPINE.split('\n').filter((l) => l.startsWith(`| ${id} |`))
  expect(found, `exactly one ${id} row`).toHaveLength(1)
  return found[0]
}

describe('offline wallet words (OS-FR-12)', () => {
  it('Text A is the five lines of consequence-texts.md, in order', () => {
    expect([...TEXT_A]).toEqual(bullets('Text A.'))
  })

  it('Text B is six plain lines, then its WARNING split at the bold sentence', () => {
    const b = bullets('Text B.')
    expect(b).toHaveLength(7)
    expect([...TEXT_B.lines]).toEqual(b.slice(0, 6))
    expect(TEXT_B.warning).toEqual(warningOf(b[6]))
  })

  it('Text E is its one WARNING, split at the bold sentence', () => {
    const e = bullets('Text E.')
    expect(e).toHaveLength(1)
    expect(TEXT_E.warning).toEqual(warningOf(e[0]))
  })

  it('the OS-FR-23 warning is quoted whole', () => {
    const section = TEXTS.split('## One Seed on one Network (OS-FR-23)')[1].split('\n## ')[0]
    expect(collapse(section)).toBe(`"${ONE_SEED_ONE_NETWORK}"`)
  })

  it('the step 1 question is the fixed string', () => {
    expect(TEXTS).toContain(`| Create quiz step 1 | "${KIND_QUESTION}" | OS-FR-2 |`)
  })

  it('P-6, P-7 and P-60 are quoted whole in their spine rows', () => {
    expect(row('P-6')).toContain(`"${WARNING_READ}"`)
    expect(row('P-7')).toContain(`"${READ_EACH_WARNING}"`)
    expect(row('P-60')).toContain(`"${WARNINGS_CHANGED}"`)
  })
})
