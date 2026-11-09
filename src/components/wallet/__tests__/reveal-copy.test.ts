import { describe, expect, it } from 'vitest'
import type { KeyWalletMeta } from '@/lib/crypto/keystore'
import { revealCheckSentence } from '@/components/wallet/reveal-copy'

const w = (over: Partial<KeyWalletMeta>) => ({ seedMethod: 'stored', signingCheck: 'standard', openCheck: 'pin', ...over }) as KeyWalletMeta
const PIN = 'After you confirm, your App PIN will be asked.'
const PASSKEY = 'After you confirm, your passkey will be asked.'

describe('revealCheckSentence', () => {
  it('names the check the reveal will ask, and only Open Check none says nothing more is asked', () => {
    expect(revealCheckSentence(w({ seedMethod: 'passkey-derived' }))).toBe(PASSKEY)
    expect(revealCheckSentence(w({ signingCheck: 'pin' }))).toBe(PIN)
    expect(revealCheckSentence(w({ signingCheck: 'passkey' }))).toBe(PASSKEY)
    expect(revealCheckSentence(w({ openCheck: 'pin' }))).toBe(PIN)
    expect(revealCheckSentence(w({ openCheck: 'passkey' }))).toBe(PASSKEY)
    expect(revealCheckSentence(w({ openCheck: 'none' }))).toMatch(/nothing more will be asked/)
  })
})
