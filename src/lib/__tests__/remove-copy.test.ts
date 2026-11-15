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
  it('a device that also stores a Seed record listing no Wallet (story 12) is not emptied: sole, never last', () => {
    expect(removeBodyFor([W('a', 's1', 'rA')], 'a', true)).toBe('sole')
    expect(removeBodyFor([{ id: 't', kind: 'transmitter' } as WalletMeta], 't', true)).toBe('transmitter')
  })
  it('a Signs-for Wallet is sole: its Seed goes with it (no sibling body since story 12)', () => {
    expect(removeBodyFor([W('a', 's1', 'rM', 'rA'), W('b', 's2', 'rB')], 'a')).toBe('sole')
  })
})
