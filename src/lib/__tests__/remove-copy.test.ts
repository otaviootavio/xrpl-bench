import { describe, expect, it } from 'vitest'
import { removeBodyFor } from '../remove-copy'
import type { WalletMeta } from '@/lib/crypto/keystore'

const W = (id: string, seedId: string, address: string, keyAddress = address) => ({ id, seedId, address, keyAddress }) as WalletMeta

describe('removeBodyFor', () => {
  it('last when it is the only Wallet', () => {
    expect(removeBodyFor([W('a', 's1', 'rA')], 'a')).toBe('last')
  })
  it('sole when no other Wallet shares the Seed', () => {
    expect(removeBodyFor([W('a', 's1', 'rA'), W('b', 's2', 'rB')], 'a')).toBe('sole')
  })
  it('sibling only with a controlled account on the same Seed, from either side', () => {
    const key = W('a', 's1', 'rA')
    const controlled = W('c', 's1', 'rM', 'rA')
    expect(removeBodyFor([key, controlled], 'a')).toBe('sibling')
    expect(removeBodyFor([key, controlled], 'c')).toBe('sibling')
  })
  it('two key holders on one Seed (no controlled account) are not a sibling', () => {
    expect(removeBodyFor([W('a', 's1', 'rA'), W('b', 's1', 'rA')], 'a')).toBe('sole')
  })
})
