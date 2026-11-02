import { describe, expect, expectTypeOf, it } from 'vitest'
import { listWalletCards, nextActiveWalletId, walletIdsInChooserOrder, type LockedCard, type OpenCard } from '../wallet-groups'

type Meta = Parameters<typeof listWalletCards>[0][number]
const W = (id: string, o: Partial<Meta> = {}): Meta =>
  ({ id, seedId: id, lockId: `L-${id}`, label: id, address: `r${id}`, keyAddress: `r${id}`, createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard', ...o }) as Meta
const OPEN = (...ids: string[]) => Object.fromEntries(ids.map((i) => [i, {}]))

describe('listWalletCards (AD-43, FR-93)', () => {
  it('empty', () => expect(listWalletCards([], {})).toEqual([]))

  it('a locked card holds exactly walletId, lockId, label, address, network and state', () => {
    const [c] = listWalletCards([W('a', { node: 'wss://n', network: 'mainnet' })], {})
    expect(Object.keys(c).sort()).toEqual(['address', 'label', 'lockId', 'network', 'state', 'walletId'])
    expect(c).toEqual({ state: 'locked', walletId: 'a', lockId: 'L-a', label: 'a', address: 'ra', network: 'mainnet' })
  })

  it('locked type holds exactly those keys (a Node, check kind or balance fails to compile)', () => {
    expectTypeOf<keyof LockedCard>().toEqualTypeOf<'state' | 'walletId' | 'lockId' | 'label' | 'address' | 'network'>()
    expectTypeOf<keyof OpenCard>().toEqualTypeOf<keyof LockedCard | 'allowsLock' | 'hasNode'>()
  })

  it('an open card adds allowsLock and hasNode', () => {
    const [c] = listWalletCards([W('a', { node: 'wss://n' })], OPEN('L-a'))
    expect(c).toEqual({ state: 'open', walletId: 'a', lockId: 'L-a', label: 'a', address: 'ra', network: 'testnet', allowsLock: true, hasNode: true })
  })

  it('one card per Wallet: a Seed with a controlled view gives two cards, each with its own address and network', () => {
    const ws = [W('s', { lockId: 'L', network: 'mainnet', createdAt: 1 }), W('v', { seedId: 's', lockId: 'L', network: 'testnet', createdAt: 2 })]
    const cs = listWalletCards(ws, {})
    expect(cs.map((c) => [c.walletId, c.address, c.network])).toEqual([['s', 'rs', 'mainnet'], ['v', 'rv', 'testnet']])
  })

  it('orders by seed createdAt then seedId, views by createdAt then id, independent of locks', () => {
    const ws = [W('z', { createdAt: 1 }), W('b', { createdAt: 2 }), W('a', { createdAt: 2 }), W('x', { createdAt: 0 })]
    expect(listWalletCards(ws, {}).map((c) => c.walletId)).toEqual(['x', 'z', 'a', 'b'])
    expect(listWalletCards(ws, OPEN('L-b')).map((c) => c.walletId)).toEqual(['x', 'z', 'a', 'b'])
    const views = [W('c', { seedId: 's', lockId: 'L', createdAt: 5 }), W('s', { lockId: 'L', createdAt: 9 }), W('b', { seedId: 's', lockId: 'L', createdAt: 5 })]
    expect(listWalletCards(views, {}).map((c) => c.walletId)).toEqual(['b', 'c', 's'])
  })

  it('the order equals walletIdsInChooserOrder', () => {
    const ws = [W('c2', { seedId: 'c', createdAt: 4 }), W('b', { createdAt: 2 }), W('c', { createdAt: 3 }), W('a', { createdAt: 1 })]
    expect(listWalletCards(ws, {}).map((c) => c.walletId)).toEqual(walletIdsInChooserOrder(ws))
  })

  it('a shared lock opens both cards', () => {
    const cs = listWalletCards([W('a', { lockId: 'X' }), W('b', { lockId: 'X', createdAt: 2 })], OPEN('X'))
    expect(cs.map((c) => c.state)).toEqual(['open', 'open'])
  })

  it('no Open Check: allowsLock false, per Wallet', () => {
    const cs = listWalletCards([W('a', { openCheck: 'none' }), W('b', { seedId: 'a', lockId: 'L-a', createdAt: 2 })], OPEN('L-a'))
    expect(cs.map((c) => c.state === 'open' && c.allowsLock)).toEqual([false, true])
  })

  it('an empty node string is not a custom node', () => {
    const [c] = listWalletCards([W('a', { node: '' })], OPEN('L-a'))
    expect(c.state === 'open' && c.hasNode).toBe(false)
  })

  it('does not mutate inputs', () => {
    const ws = [W('b', { createdAt: 2 }), W('a')]
    const locks = OPEN('L-a')
    const before = JSON.stringify([ws, locks])
    Object.freeze(ws); ws.forEach(Object.freeze); Object.freeze(locks)
    listWalletCards(ws, locks)
    expect(JSON.stringify([ws, locks])).toBe(before)
  })
})

describe('nextActiveWalletId (AD-46)', () => {
  it.each([
    ['active is still there: kept', 'x', 'b', ['a', 'b', 'c'], 'b'],
    ['active was the removed one: the first in chooser order', 'b', 'b', ['a', 'c'], 'a'],
    ['active is another that is gone too: the first', 'x', 'gone', ['a', 'c'], 'a'],
    ['no active: the first', 'x', null, ['a', 'c'], 'a'],
    ['nothing remains: null', 'x', 'x', [], null],
    ['the removed id is never picked, whatever the list holds', 'a', 'a', ['a', 'c'], 'c'],
    ['only the removed id listed: null', 'a', null, ['a'], null],
  ] as const)('%s', (_name, removed, active, remaining, expected) => {
    expect(nextActiveWalletId(removed, active, remaining)).toBe(expected)
  })
})

describe('walletIdsInChooserOrder', () => {
  it('lists every view, Seeds by createdAt then id, views by createdAt then id: the order the cards use', () => {
    const wallets = [
      W('c2', { seedId: 'c', createdAt: 4 }),
      W('b', { createdAt: 2 }),
      W('c', { createdAt: 3 }),
      W('a', { createdAt: 1 }),
    ]
    expect(walletIdsInChooserOrder(wallets)).toEqual(['a', 'b', 'c', 'c2'])
    expect(walletIdsInChooserOrder([])).toEqual([])
  })
})
