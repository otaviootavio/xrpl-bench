import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BLACK_HOLES, blackHoleLockout, endsSetRegularKey, isBlackHole, keyWalletHere, masterOffToBlackHole, regularKeyTester } from '../key-warnings'

/** Story 11 (OS-FR-21): which key warning applies. Warnings only: nothing here refuses. */
const FIXED = readFileSync('_bmad-output/specs/spec-offline-signing/consequence-texts.md', 'utf8').replace(/\s+/g, ' ')
const ACCT = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const KEY = 'rGWrZyQqhTp9Xu7G5Pkayo7bXjH4k4QYpf'
const base = { seedId: 's', lockId: 'L', createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard', kind: 'online' } as const
const MASTER = { ...base, id: 'm', label: 'Vault', address: ACCT, keyAddress: ACCT }
const HOLDER = { ...base, id: 'k', seedId: 'k', lockId: 'K', label: 'Phone', address: ACCT, keyAddress: KEY }
const OPEN = { L: {}, K: {} }

describe('W2\'s black holes', () => {
  it('are the two addresses the spec names, and only those', () => {
    expect(FIXED).toContain(`**W2. A black-hole address** (\`${BLACK_HOLES[0]}\`, \`${BLACK_HOLES[1]}\`)`)
    expect(BLACK_HOLES.every(isBlackHole)).toBe(true)
    expect(isBlackHole(ACCT)).toBe(false)
    expect(isBlackHole(null)).toBe(false)
  })
})

describe('P-30 or W1', () => {
  it('a key Wallet here of any kind and Network holds the key; a Transmitter never does', () => {
    expect(keyWalletHere([MASTER, HOLDER], KEY)?.id).toBe('k')
    expect(keyWalletHere([{ ...HOLDER, kind: 'offline', network: 'mainnet' }], KEY)?.id).toBe('k')
    expect(keyWalletHere([{ id: 't', kind: 'transmitter', address: KEY } as never], KEY)).toBeUndefined()
    expect(keyWalletHere([MASTER], KEY)).toBeUndefined()
    expect(keyWalletHere([MASTER], '')).toBeUndefined()
  })
})

describe('W5 and W2 on master key off, from the key state', () => {
  const set = { regular_key: KEY, master_key: 'on', signer_list: null } as const
  it.each([
    [ACCT, set, true],
    [KEY, set, false],
    [null, set, true],
    [undefined, set, true],
    [ACCT, { ...set, regular_key: null }, false],
    [null, 'unknown', false],
    [ACCT, null, false],
  ] as const)('new %s, state %j: W5 %s', (newKey, state, expected) => {
    expect(endsSetRegularKey(newKey, state as never)).toBe(expected)
  })
  it('W2 only when the state names a black-hole Regular Key', () => {
    expect(masterOffToBlackHole({ ...set, regular_key: BLACK_HOLES[1] })).toBe(true)
    expect(masterOffToBlackHole(set)).toBe(false)
    expect(masterOffToBlackHole('unknown')).toBe(false)
    expect(masterOffToBlackHole(null)).toBe(false)
  })
})

describe('the in-place "Test the Regular Key" Wallet', () => {
  it('an open Online Wallet on the Network whose key is the Regular Key and which Signs for the Account', () => {
    expect(regularKeyTester([MASTER, HOLDER], MASTER, KEY, OPEN)?.id).toBe('k')
  })
  it.each([
    ['its lock is closed', [MASTER, HOLDER], { L: {} }],
    ['it signs for its own address', [MASTER, { ...HOLDER, address: KEY }], OPEN],
    ['it is Offline', [MASTER, { ...HOLDER, kind: 'offline' }], OPEN],
    ['it is on another Network', [MASTER, { ...HOLDER, network: 'devnet' }], OPEN],
  ] as const)('none when %s: the test points elsewhere (P-50)', (_why, wallets, open) => {
    expect(regularKeyTester(wallets as never, MASTER, KEY, open)).toBeNull()
  })
  it('none without a Regular Key (none set, or an unknown state)', () => {
    expect(regularKeyTester([MASTER, HOLDER], MASTER, null, OPEN)).toBeNull()
    expect(regularKeyTester([MASTER, HOLDER], MASTER, undefined, OPEN)).toBeNull()
  })
})

describe('owner 2026-11-15: a black-hole Regular Key with the master key known off is irreversible-class', () => {
  const off = { regular_key: KEY, master_key: 'off', signer_list: null } as const
  it.each([
    [BLACK_HOLES[0], off, true],
    [BLACK_HOLES[1], { ...off, signer_list: 'unknown' }, true],
    [BLACK_HOLES[1], { ...off, signer_list: { signers: 2, quorum: 2 } }, false],
    [BLACK_HOLES[1], { ...off, master_key: 'on' }, false],
    [BLACK_HOLES[1], 'unknown', false],
    [BLACK_HOLES[1], null, false],
    [KEY, off, false],
    [null, off, false],
  ] as const)('key %s, state %j: %s', (k, state, expected) => {
    expect(blackHoleLockout(k, state as never)).toBe(expected)
  })
})
