import { describe, expect, it } from 'vitest'
import { uniqueDefaultName, validateWalletName } from '../wallet-name'

describe('validateWalletName', () => {
  it('trims, collapses inner whitespace and normalises to NFC', () => {
    expect(validateWalletName('  Savings   account ', [])).toEqual({ ok: true, name: 'Savings account' })
    expect(validateWalletName('Café', [])).toEqual({ ok: true, name: 'Café' })
    expect(validateWalletName('a\t\n b', [])).toEqual({ ok: true, name: 'a b' })
  })
  it('removes zero-width, bidi and control characters, so look-alike names are equal', () => {
    expect(validateWalletName('Sav\u200Bings', [])).toEqual({ ok: true, name: 'Savings' })
    expect(validateWalletName('\u202Esavings', [])).toEqual({ ok: true, name: 'savings' })
    expect(validateWalletName('Sav\u200Bings', ['savings'])).toEqual({ ok: false, reason: 'duplicate' })
    expect(validateWalletName('\u200B\u200B', [])).toEqual({ ok: false, reason: 'empty' })
  })
  it('refuses an empty or blank name', () => {
    expect(validateWalletName('', [])).toEqual({ ok: false, reason: 'empty' })
    expect(validateWalletName('   \n ', [])).toEqual({ ok: false, reason: 'empty' })
  })
  it('counts code points: 1 and 40 pass, 41 fails, astral characters count once', () => {
    expect(validateWalletName('a', []).ok).toBe(true)
    expect(validateWalletName('a'.repeat(40), []).ok).toBe(true)
    expect(validateWalletName('a'.repeat(41), [])).toEqual({ ok: false, reason: 'too-long' })
    expect(validateWalletName('\u{1F600}'.repeat(40), []).ok).toBe(true)
    expect(validateWalletName('\u{1F600}'.repeat(41), [])).toEqual({ ok: false, reason: 'too-long' })
  })
  it('length is counted after collapsing', () => {
    expect(validateWalletName(`${'a'.repeat(40)}    `, []).ok).toBe(true)
    expect(validateWalletName(`${'a'.repeat(20)}      ${'b'.repeat(19)}`, []).ok).toBe(true) // 40
  })
  it('refuses another Seed\'s name, case-insensitively on the normalised form', () => {
    expect(validateWalletName('savings', ['Savings'])).toEqual({ ok: false, reason: 'duplicate' })
    expect(validateWalletName('  SAVINGS  ', ['Savings'])).toEqual({ ok: false, reason: 'duplicate' })
    expect(validateWalletName('Sav  ings', ['sav ings'])).toEqual({ ok: false, reason: 'duplicate' })
    expect(validateWalletName('Café', ['CAFÉ'])).toEqual({ ok: false, reason: 'duplicate' })
  })
  it('a name only the caller\'s own Seed holds is free (others excludes it)', () => {
    expect(validateWalletName('Savings', ['Other'])).toEqual({ ok: true, name: 'Savings' })
  })
  it('checks empty before length before duplicate', () => {
    expect(validateWalletName(' ', [''])).toEqual({ ok: false, reason: 'empty' })
  })
})

describe('uniqueDefaultName', () => {
  it('returns the base when free, else the first free suffix from 2', () => {
    expect(uniqueDefaultName('Wallet', [])).toBe('Wallet')
    expect(uniqueDefaultName('Wallet', ['Wallet'])).toBe('Wallet 2')
    expect(uniqueDefaultName('Wallet', ['wallet', 'Wallet 2'])).toBe('Wallet 3')
    expect(uniqueDefaultName('Wallet', ['Wallet', 'Wallet 3'])).toBe('Wallet 2')
  })
})
