import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ANIMATED_QR_CAPTION, ANIMATED_QR_KEYS, SCAN_COMPLETE, scanProgressWords } from '../animated-qr-words'

/** OS-FR-24, OS-FR-12: P-64 and P-65 are copied from the UX spine, never retyped. */
const SPINE = readFileSync('_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md', 'utf8')

function row(id: string): string {
  const found = SPINE.split('\n').filter((l) => l.startsWith(`| ${id} |`))
  expect(found, `exactly one ${id} row`).toHaveLength(1)
  return found[0]
}

describe('animated QR words (OS-FR-24)', () => {
  it('P-64: the three keys and the caption, quoted whole', () => {
    const p64 = row('P-64')
    expect(p64).toContain(`Keys "${ANIMATED_QR_KEYS.pause}" · "${ANIMATED_QR_KEYS.resume}" · "${ANIMATED_QR_KEYS.next}"`)
    expect(p64).toContain(`Caption: "${ANIMATED_QR_CAPTION}"`)
  })

  it('P-65: the progress line with {n}, and the complete line', () => {
    const p65 = row('P-65')
    expect(p65).toContain(`"${scanProgressWords(0).replace('0', '{n}')}"`)
    expect(p65).toContain(`When complete: "${SCAN_COMPLETE}"`)
    expect(scanProgressWords(75)).toBe('The app read 75 percent of the code.')
  })
})
