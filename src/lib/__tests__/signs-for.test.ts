import { describe, expect, it } from 'vitest'
import { signsForDraftState, signsForTarget } from '../signs-for'
import { regularKeySetBy } from '../transmit-step'
import type { WalletMeta } from '../crypto/keystore'
import type { TransmitOutcome } from '../xrpl/writes'

const K = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY'
const X = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const validated: TransmitOutcome = { status: 'validated', hash: 'H', resultCode: 'tesSUCCESS' } as TransmitOutcome

describe('signsForDraftState', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['rNOT', 'invalid'],
    [` ${X} `, 'valid'],
  ])('%j is %s', (draft, state) => expect(signsForDraftState(draft)).toBe(state))
})

describe("P-54's trigger: a validated SetRegularKey that sets a key (OS-FR-20)", () => {
  const tx = { TransactionType: 'SetRegularKey', Account: X, RegularKey: K }
  it('is the Account, the key and the Network', () => {
    expect(regularKeySetBy(tx, validated, 'testnet')).toEqual({ account: X, regularKey: K, network: 'testnet' })
  })
  it('is nothing for a removal, another type, or any outcome but validated', () => {
    expect(regularKeySetBy({ TransactionType: 'SetRegularKey', Account: X }, validated, 'testnet')).toBeUndefined()
    expect(regularKeySetBy({ TransactionType: 'Payment', Account: X }, validated, 'testnet')).toBeUndefined()
    for (const outcome of [
      { status: 'claimed', hash: 'H', resultCode: 'tecNO_ALTERNATIVE_KEY' },
      { status: 'failed', hash: 'H', resultCode: 'temBAD_REGKEY' },
      { status: 'unknown', hash: 'H' },
      { status: 'sent-before', hash: 'H', resultCode: 'tefPAST_SEQ' },
    ] as TransmitOutcome[])
      expect(regularKeySetBy(tx, outcome, 'testnet')).toBeUndefined()
  })
})

describe('signsForTarget: which Wallet P-54 offers to set', () => {
  const key = (id: string, o: Partial<WalletMeta> = {}) =>
    ({ id, seedId: id, lockId: id, label: id, createdAt: 1, network: 'testnet', openCheck: 'pin', kind: 'offline', address: K, keyAddress: K, algorithm: 'ed25519', seedMethod: 'stored', signingCheck: 'standard', ...o }) as WalletMeta
  const set = { account: X, regularKey: K, network: 'testnet' as const }
  it('a key Wallet here with that key on that Network (Online or Offline)', () => {
    expect(signsForTarget([key('a')], set)).toMatchObject({ id: 'a' })
    expect(signsForTarget([key('a', { kind: 'online' })], set)).toMatchObject({ id: 'a' })
  })
  it('none on another Network, another key, or a Transmitter: the second form', () => {
    expect(signsForTarget([key('a', { network: 'mainnet' })], set)).toBeNull()
    expect(signsForTarget([key('a', { keyAddress: X, address: X })], set)).toBeNull()
    expect(signsForTarget([{ ...key('t'), kind: 'transmitter', address: K } as WalletMeta], set)).toBeNull()
  })
  it("'done' when a Wallet with that key already signs for the Account", () => {
    expect(signsForTarget([key('a'), key('b', { address: X })], set)).toBe('done')
  })
})
