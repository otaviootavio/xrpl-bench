import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { ECDSA, Wallet, decode, deriveAddress } from 'xrpl'

/**
 * Story 11 (OS-FR-21, CAP-14): the Online key actions send what the user asked whatever
 * the key state (no app refusal), and the outcome is the ledger's. Pinned on the signed
 * blob that left the process (anti-patterns.md §11): the Wallet's Signing Check is the
 * keystore's (`signingHandleFor`, replaced here by a handle over a real xrpl.js Wallet,
 * with the expected Account it is asked for checked as the keystore checks it).
 */
const h = vi.hoisted(() => ({ handles: [] as Array<{ walletId: string; expected: string }>, openThrows: null as Error | null, beforeOpen: null as Error | null }))

const master = Wallet.fromSeed('sEdTM1uX8pu2do5XvTnutH6HsouMaM2')
const KEY_SEED = 'sEd7rBGm5kxzauRTAV2hbsNz7N45X91'
const keyOwn = Wallet.fromSeed(KEY_SEED)
const keyFor = Wallet.fromSeed(KEY_SEED, { algorithm: ECDSA.ed25519, masterAddress: master.address })

vi.mock('@/lib/crypto/keystore', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/crypto/keystore')>()
  return {
    ...real,
    signingHandleFor: async (walletId: string, _ctx: unknown, expected: string) => {
      h.handles.push({ walletId, expected })
      const w = walletId === 'k' ? keyFor : master
      if (w.classicAddress !== expected) throw new real.SignsForChangedError(expected, w.classicAddress)
      return {
        address: w.classicAddress,
        signsAsMaster: walletId === 'm',
        async open() {
          if (h.openThrows) throw h.openThrows
          return { sign: (tx: never) => w.sign(tx), dispose: () => {} }
        },
      }
    },
  }
})

import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '@/lib/xrpl/client'
import { resetTxInFlightReporter } from '@/lib/xrpl/writes'
import { runKeyAction, testRegularKey } from '../key-actions'
import { SigningCheckError, type KeyWalletMeta } from '@/lib/crypto/keystore'
import { NOT_SIGNED } from '../offline-round-words'
import { NOT_SENT } from '../transmit-words'

const ledger = { submitted: [] as string[], result: 'tesSUCCESS', flags: 0, autofillThrows: false, submitThrows: false, windowFails: false }
const base = { seedId: 's', lockId: 'L', createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard', kind: 'online' } as const
const MASTER: KeyWalletMeta = { ...base, id: 'm', label: 'Vault', address: master.address, keyAddress: master.address }
const HOLDER: KeyWalletMeta = { ...base, id: 'k', seedId: 'k', label: 'Phone', address: master.address, keyAddress: keyOwn.address }
const ctx = () => ({ queryClient: new QueryClient(), openKey: null, prompts: { pin: async () => null } as never })
const sent = () => decode(ledger.submitted.at(-1)!)

beforeEach(() => {
  h.handles = []
  h.openThrows = null
  Object.assign(ledger, { submitted: [], result: 'tesSUCCESS', flags: 0, autofillThrows: false, submitThrows: false, windowFails: false })
  resetXrplClients()
  setXrplClientFactory(
    () =>
      ({
        isConnected: () => true,
        connect: async () => {},
        autofill: async (tx: Record<string, unknown>) => {
          if (ledger.autofillThrows) throw new Error('actNotFound')
          return { Sequence: 7, Fee: '12', ...tx }
        },
        request: async (req: { command: string }) => {
          if (req.command === 'account_info') return { result: { account_data: { Balance: '100000000', OwnerCount: 0, Sequence: 7, Flags: ledger.flags } } }
          if (ledger.windowFails) throw new Error('socket closed')
          return { result: { ledger_index: 80 } }
        },
        submitAndWait: async (blob: string) => {
          ledger.submitted.push(blob)
          if (ledger.submitThrows) throw new Error('socket closed')
          return { result: { meta: { TransactionResult: ledger.result }, ledger_index: 90 } }
        },
      }) as never,
  )
})
afterEach(() => {
  resetXrplClientFactory()
  resetXrplClients()
  resetTxInFlightReporter()
})

describe('runKeyAction: no app refusal, the ledger answers', () => {
  it('Set to any address (the Account\'s own, a black hole): a SetRegularKey with that RegularKey; P-54 on validated', async () => {
    const r = await runKeyAction(MASTER, { type: 'set', regularKey: keyOwn.address }, ctx())
    expect(sent()).toMatchObject({ TransactionType: 'SetRegularKey', Account: master.address, RegularKey: keyOwn.address })
    expect(r).toMatchObject({ kind: 'outcome', outcome: { status: 'validated' }, regularKeySet: { account: master.address, regularKey: keyOwn.address, network: 'testnet' } })
    await runKeyAction(MASTER, { type: 'set', regularKey: master.address }, ctx())
    expect(sent().RegularKey).toBe(master.address)
    await runKeyAction(MASTER, { type: 'set', regularKey: 'rrrrrrrrrrrrrrrrrrrrrhoLvTp' }, ctx())
    expect(sent().RegularKey).toBe('rrrrrrrrrrrrrrrrrrrrrhoLvTp')
  })

  it('Remove: no RegularKey field; a claimed tec passes through with no P-54', async () => {
    ledger.result = 'tecNO_ALTERNATIVE_KEY'
    const r = await runKeyAction(MASTER, { type: 'remove' }, ctx())
    expect('RegularKey' in sent()).toBe(false)
    expect(r).toEqual({ kind: 'outcome', outcome: expect.objectContaining({ status: 'claimed', resultCode: 'tecNO_ALTERNATIVE_KEY' }) })
  })

  it('Master key off and on: AccountSet SetFlag / ClearFlag 4, with no Regular Key and from a Regular Key Wallet alike', async () => {
    await runKeyAction(MASTER, { type: 'master', enable: false }, ctx())
    expect(sent()).toMatchObject({ TransactionType: 'AccountSet', Account: master.address, SetFlag: 4 })
    ledger.result = 'tecNEED_MASTER_KEY'
    const r = await runKeyAction(HOLDER, { type: 'master', enable: false }, ctx())
    expect(deriveAddress(sent().SigningPubKey as string)).toBe(keyOwn.address)
    expect(r).toMatchObject({ outcome: { status: 'claimed', resultCode: 'tecNEED_MASTER_KEY' } })
    ledger.result = 'tesSUCCESS'
    ledger.flags = 0x00100000
    await runKeyAction(HOLDER, { type: 'master', enable: true }, ctx())
    expect(sent()).toMatchObject({ TransactionType: 'AccountSet', Account: master.address, ClearFlag: 4 })
    expect(deriveAddress(sent().SigningPubKey as string)).toBe(keyOwn.address)
  })

  it('signs for the Wallet\'s own Account only (the keystore\'s check), as asked by this module', async () => {
    await runKeyAction(HOLDER, { type: 'remove' }, ctx())
    expect(h.handles.at(-1)).toEqual({ walletId: 'k', expected: master.address })
  })
})

describe('testRegularKey (W4)', () => {
  it('an AccountSet with no changes for the Account, signed by the Regular Key Wallet\'s key', async () => {
    const r = await testRegularKey(MASTER, HOLDER, ctx())
    const tx = sent()
    expect(tx).toMatchObject({ TransactionType: 'AccountSet', Account: master.address })
    expect('SetFlag' in tx || 'ClearFlag' in tx).toBe(false)
    expect(deriveAddress(tx.SigningPubKey as string)).toBe(keyOwn.address)
    expect(h.handles.at(-1)).toEqual({ walletId: 'k', expected: master.address })
    expect(r).toMatchObject({ kind: 'outcome', outcome: { status: 'validated' } })
    expect('regularKeySet' in r).toBe(false)
  })
})

describe('what is said when it does not reach an outcome', () => {
  it('a Signing Check not passed: its own words; nothing submitted', async () => {
    h.openThrows = new SigningCheckError({ status: 'cancelled' } as never)
    const r = await runKeyAction(MASTER, { type: 'remove' }, ctx())
    expect(r.kind).toBe('refused')
    expect(ledger.submitted).toHaveLength(0)
  })

  it('a throw before the Signing Check: P-16 (nothing signed)', async () => {
    ledger.autofillThrows = true
    expect(await runKeyAction(MASTER, { type: 'remove' }, ctx())).toEqual({ kind: 'refused', text: NOT_SIGNED })
  })

  it('a throw after signing: unconfirmed, never "not sent"', async () => {
    ledger.submitThrows = true
    expect(await runKeyAction(MASTER, { type: 'remove' }, ctx())).toEqual({ kind: 'unconfirmed' })
    expect(ledger.submitted).toHaveLength(1)
  })

  it('a throw after the Signing Check but before the submit (the window read): "not sent", never "may have been sent" (review)', async () => {
    ledger.windowFails = true
    expect(await runKeyAction(HOLDER, { type: 'remove' }, ctx())).toEqual({ kind: 'refused', text: NOT_SENT })
    expect(ledger.submitted).toHaveLength(0)
  })

  it('master signing while the master key is off: today\'s refusal before the Signing Check', async () => {
    ledger.flags = 0x00100000
    const r = await runKeyAction(MASTER, { type: 'master', enable: true }, ctx())
    expect(r).toMatchObject({ kind: 'refused', text: expect.stringContaining('master key of this account is turned off') })
    expect(ledger.submitted).toHaveLength(0)
  })
})
