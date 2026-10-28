import { describe, expect, expectTypeOf, it } from 'vitest'
import { groupWalletsBySeed, nextActiveWalletId, walletIdsInChooserOrder, type LockedGroup } from '../wallet-groups'

type Meta = Parameters<typeof groupWalletsBySeed>[0][number]
const W = (id: string, o: Partial<Meta> = {}): Meta =>
  ({ id, seedId: id, lockId: `L-${id}`, label: id, address: `r${id}`, keyAddress: `r${id}`, createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard', ...o }) as Meta
const OPEN = (...ids: string[]) => Object.fromEntries(ids.map((i) => [i, {}]))

describe('groupWalletsBySeed (AD-43)', () => {
  it('empty', () => expect(groupWalletsBySeed([], {}, null)).toEqual([]))

  it('one wallet, locked: exactly five keys', () => {
    const [g] = groupWalletsBySeed([W('a')], {}, null)
    expect(Object.keys(g).sort()).toEqual(['entryWalletId', 'label', 'lockId', 'seedId', 'state'])
    expect(g.state).toBe('locked')
  })

  it('locked type holds exactly the five keys', () => {
    expectTypeOf<keyof LockedGroup>().toEqualTypeOf<'state' | 'seedId' | 'lockId' | 'label' | 'entryWalletId'>()
  })

  it('one wallet, open', () => {
    const [g] = groupWalletsBySeed([W('a', { node: 'wss://n' })], OPEN('L-a'), null)
    expect(g).toEqual({
      state: 'open', seedId: 'a', lockId: 'L-a', label: 'a', entryWalletId: 'a', allowsLock: true,
      views: [{ walletId: 'a', network: 'testnet', address: 'ra', hasNode: true }],
    })
  })

  it('several views of one seed, ordered by createdAt then id', () => {
    const ws = [W('c', { seedId: 's', lockId: 'L', createdAt: 5 }), W('s', { lockId: 'L', createdAt: 9 }), W('b', { seedId: 's', lockId: 'L', createdAt: 5 })]
    const gs = groupWalletsBySeed(ws, OPEN('L'), null)
    expect(gs).toHaveLength(1)
    const g = gs[0]
    if (g.state !== 'open') throw new Error('open')
    expect(g.views.map((v) => v.walletId)).toEqual(['b', 'c', 's'])
    expect(g.views.every((v) => !v.hasNode)).toBe(true)
  })

  it('orders by seed createdAt then seedId, independent of storage, locks and active', () => {
    const ws = [W('z', { createdAt: 1 }), W('b', { createdAt: 2 }), W('a', { createdAt: 2 }), W('x', { createdAt: 0 })]
    const ids = (l: Record<string, unknown>, active: string | null) => groupWalletsBySeed(ws, l, active).map((g) => g.seedId)
    expect(ids({}, null)).toEqual(['x', 'z', 'a', 'b'])
    expect(ids(OPEN('L-b'), 'b')).toEqual(['x', 'z', 'a', 'b'])
  })

  it('seed createdAt is the smallest among its views', () => {
    const ws = [W('a', { createdAt: 5 }), W('v', { seedId: 'a', lockId: 'L-a', createdAt: 1 }), W('b', { createdAt: 3 })]
    expect(groupWalletsBySeed(ws, {}, null).map((g) => g.seedId)).toEqual(['a', 'b'])
  })

  it('entry view: active in group', () => {
    const ws = [W('s', { lockId: 'L' }), W('v', { seedId: 's', lockId: 'L', label: 'V' })]
    const [g] = groupWalletsBySeed(ws, {}, 'v')
    expect(g.entryWalletId).toBe('v')
    expect(g.label).toBe('V')
  })

  it('entry view: not active falls to seedId, else earliest', () => {
    const ws = [W('v', { seedId: 's', lockId: 'L', createdAt: 1 }), W('s', { lockId: 'L', createdAt: 2 })]
    expect(groupWalletsBySeed(ws, {}, 'other')[0].entryWalletId).toBe('s')
    expect(groupWalletsBySeed(ws, {}, null)[0].entryWalletId).toBe('s')
    const noSeed = [W('q', { seedId: 's', lockId: 'L', createdAt: 4 }), W('p', { seedId: 's', lockId: 'L', createdAt: 3 })]
    expect(groupWalletsBySeed(noSeed, {}, null)[0].entryWalletId).toBe('p')
  })

  it('shared lock opens both groups', () => {
    const gs = groupWalletsBySeed([W('a', { lockId: 'X' }), W('b', { lockId: 'X', createdAt: 2 })], OPEN('X'), null)
    expect(gs.map((g) => g.state)).toEqual(['open', 'open'])
  })

  it('no Open Check: allowsLock false', () => {
    const [g] = groupWalletsBySeed([W('a', { openCheck: 'none' })], OPEN('L-a'), null)
    expect(g.state === 'open' && g.allowsLock).toBe(false)
  })

  it('does not mutate inputs', () => {
    const ws = [W('b', { createdAt: 2 }), W('a')]
    const locks = OPEN('L-a')
    const before = JSON.stringify([ws, locks])
    Object.freeze(ws); ws.forEach(Object.freeze); Object.freeze(locks)
    groupWalletsBySeed(ws, locks, 'a')
    expect(JSON.stringify([ws, locks])).toBe(before)
  })

  it('a locked multi-view seed still holds exactly the five keys, whatever the views carry', () => {
    const views = [W('a', { node: 'wss://n', network: 'mainnet' }), W('b', { seedId: 'a', lockId: 'L-a', network: 'devnet' })]
    const [g] = groupWalletsBySeed(views, {}, 'b')
    expect(Object.keys(g).sort()).toEqual(['entryWalletId', 'label', 'lockId', 'seedId', 'state'])
    expect(g.entryWalletId).toBe('b')
  })

  it('allowsLock follows the Open Check of the entry view', () => {
    const views = [W('a', { openCheck: 'pin' }), W('b', { seedId: 'a', lockId: 'L-a', openCheck: 'none', createdAt: 2 })]
    const open = OPEN('L-a')
    expect((groupWalletsBySeed(views, open, 'b')[0] as { allowsLock: boolean }).allowsLock).toBe(false)
    expect((groupWalletsBySeed(views, open, null)[0] as { allowsLock: boolean }).allowsLock).toBe(true)
  })

  it('an empty node string is not a custom node', () => {
    const [g] = groupWalletsBySeed([W('a', { node: '' })], OPEN('L-a'), null)
    expect((g as { views: { hasNode: boolean }[] }).views[0].hasNode).toBe(false)
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
    expect(groupWalletsBySeed(wallets, {}, null).map((g) => g.seedId)).toEqual(['a', 'b', 'c'])
    expect(walletIdsInChooserOrder([])).toEqual([])
  })
})
