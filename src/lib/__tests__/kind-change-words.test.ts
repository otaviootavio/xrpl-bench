import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as W from '../kind-change-words'
import type { WarningText } from '../offline-wallet-words'

/**
 * OS-FR-12: Texts C and D are the words in consequence-texts.md, and the P-n the
 * words in the UX spine. Markdown line wraps, bullets, numbers and bold marks are
 * layout; every character of the words themselves must match.
 */
const TEXTS = readFileSync('_bmad-output/specs/spec-offline-signing/consequence-texts.md', 'utf8')
const SPINE = readFileSync('_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md', 'utf8')

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The items under one `###` heading: `- ` bullets and `  1. ` numbered steps, each with its wrapped lines joined. */
function items(heading: string): Array<{ kind: 'bullet' | 'step'; text: string }> {
  const lines = TEXTS.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`### ${heading}`))
  expect(start, heading).toBeGreaterThanOrEqual(0)
  const out: Array<{ kind: 'bullet' | 'step'; text: string }> = []
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('#')) break
    const step = /^\s+\d+\.\s+(.*)$/.exec(line)
    if (line.startsWith('- ')) out.push({ kind: 'bullet', text: line.slice(2) })
    else if (step) out.push({ kind: 'step', text: step[1] })
    else if (line.startsWith('  ') && out.length > 0) out[out.length - 1].text += ` ${line}`
    else if (line.trim() !== '') break
  }
  return out.map((i) => ({ ...i, text: collapse(i.text) }))
}

function warningOf(text: string): WarningText {
  const m = /^\*\*(.+?)\*\* (.+)$/.exec(text)
  expect(m, text).not.toBeNull()
  return { title: m![1], body: m![2] }
}

function row(id: string): string {
  const found = SPINE.split('\n').filter((l) => l.startsWith(`| ${id} |`))
  expect(found, `exactly one ${id} row`).toHaveLength(1)
  return found[0]
}

describe('kind change words (OS-FR-5, OS-FR-6, OS-FR-7, OS-FR-12)', () => {
  it('Text C: five lines, a WARNING, the lead line and its three steps, a WARNING', () => {
    const c = items('Text C.')
    expect(c.map((i) => i.kind)).toEqual(['bullet', 'bullet', 'bullet', 'bullet', 'bullet', 'bullet', 'bullet', 'step', 'step', 'step', 'bullet'])
    expect([...W.TEXT_C.lines]).toEqual(c.slice(0, 5).map((i) => i.text))
    expect(W.TEXT_C.keyWarning).toEqual(warningOf(c[5].text))
    expect(W.TEXT_C.stepsLead).toBe(c[6].text)
    expect([...W.TEXT_C.steps]).toEqual(c.slice(7, 10).map((i) => i.text))
    expect(W.TEXT_C.offlineWarning).toEqual(warningOf(c[10].text))
  })

  it('Text D: five lines, then two WARNINGs', () => {
    const d = items('Text D.')
    expect(d).toHaveLength(7)
    expect([...W.TEXT_D.lines]).toEqual(d.slice(0, 5).map((i) => i.text))
    expect([...W.TEXT_D.warnings]).toEqual(d.slice(5).map((i) => warningOf(i.text)))
  })

  it('the change keys and "Was online" are fixed strings', () => {
    expect(TEXTS).toContain(`| Wallet settings | "${W.CHANGE_TO_OFFLINE}" / "${W.CHANGE_TO_ONLINE}" | OS-FR-5, OS-FR-6 |`)
    expect(TEXTS).toContain(`| Offline Wallet card and settings | "${W.WAS_ONLINE}" (plus one sentence on why it matters) | OS-FR-7 |`)
  })

  it.each([
    ['P-4', W.WAS_ONLINE_WHY],
    ['P-35', W.SAME_ADDRESS_ON_NETWORK],
    ['P-43', W.NOW_OFFLINE],
    ['P-63', W.PASSKEY_SEED_NOT_OFFLINE],
  ])('%s is quoted whole in its spine row', (id, words) => {
    expect(row(id)).toContain(`"${words}"`)
  })

  it('P-39 is the typed-confirm label, and the phrase is the one it quotes', () => {
    expect(row('P-39')).toContain(`| ${W.ONLINE_PHRASE_LABEL} (`)
    expect(W.ONLINE_PHRASE_LABEL).toBe(`Type “${W.ONLINE_PHRASE}” to confirm`)
  })

  it('the three strings the owner approved on 2026-11-09 are exactly as approved', () => {
    expect(W.WALLET_KIND).toBe('Wallet kind')
    expect(W.SHARED_SEED_NO_CHANGE).toBe('This seed has more than one wallet. The app cannot change the kind of this wallet.')
    expect(W.NOW_ONLINE).toBe('This wallet is now an online wallet. The network is {Network}.')
  })
})
