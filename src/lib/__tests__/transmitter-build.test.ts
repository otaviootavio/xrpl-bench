import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSetAsfFlags, TrustSetFlags } from 'xrpl'
import { decodeUnsignedForSigning } from '../qr-codec'
import { SHIPPED } from '../offline-round-words'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../xrpl/client'
import type { TransmitterMeta } from '../crypto/keystore'

/**
 * OS-FR-17: a Synced Transmitter makes an Unsigned Transaction for its Synced
 * address after the online pre-flight, never from a failed read. The ledger reads
 * and the client are the external resources replaced; the Unsigned code is
 * decoded and judged as the Offline Wallet would.
 */
const h = vi.hoisted(() => ({
  accounts: {} as Record<string, any>,
  fail: { account: false, lines: false, destination: false },
  lines: [] as any[],
  destLines: [] as any[],
}))

vi.mock('@/lib/xrpl/reads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/xrpl/reads')>()
  return {
    ...actual,
    fetchAccountState: async (_n: string, address: string) => {
      if (address === DEST && h.fail.destination) throw new Error('down')
      if (address === ACCOUNT && h.fail.account) throw new Error('down')
      return h.accounts[address] ?? { exists: false, address, balanceDrops: '0', ownerCount: 0, sequence: 0, requireDestTag: false, disableMasterKey: false }
    },
    fetchAccountLines: async (_n: string, address: string) => {
      if (h.fail.lines) throw new Error('down')
      return address === ACCOUNT ? h.lines : h.destLines
    },
    fetchSignerList: async () => null,
    fetchServerReserves: async () => ({ baseReserveDrops: '1000000', ownerReserveDrops: '200000' }),
  }
})

import { makeUnsigned } from '../transmitter-build'
import { judgeUnsigned } from '../unsigned-judge'

const ACCOUNT = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const ISSUER = 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv'
const acct = (address: string, extra: Record<string, unknown> = {}) => ({
  exists: true, address, balanceDrops: '50000000', ownerCount: 0, sequence: 7, requireDestTag: false, disableMasterKey: false, ...extra,
})
const line = (extra: Record<string, unknown> = {}) => ({ account: ISSUER, currency: 'USD', balance: '10', limit: '100', limitPeer: '0', noRipple: true, freeze: false, freezePeer: false, ...extra })
const synced: TransmitterMeta = { id: 't', seedId: 't', lockId: 'L', label: 'Carrier', createdAt: 1, network: 'testnet', openCheck: 'none', kind: 'transmitter', address: ACCOUNT }
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

let autofill: { Sequence: number; Fee: string } | Error
let validated: number | Error

beforeEach(() => {
  h.accounts = { [ACCOUNT]: acct(ACCOUNT), [DEST]: acct(DEST) }
  h.fail = { account: false, lines: false, destination: false }
  h.lines = [line()]
  h.destLines = [line({ balance: '0' })]
  autofill = { Sequence: 8, Fee: '12' }
  validated = 5000
  setXrplClientFactory(
    () =>
      ({
        isConnected: () => true,
        connect: async () => {},
        // autofill's own window and anything else it adds are never used.
        autofill: async (tx: any) => {
          if (autofill instanceof Error) throw autofill
          return { ...tx, ...autofill, LastLedgerSequence: 99 }
        },
        request: async () => {
          if (validated instanceof Error) throw validated
          return { result: { ledger_index: validated } }
        },
        submitAndWait: async () => {
          throw new Error('nothing is ever submitted here')
        },
      }) as any,
  )
})
afterEach(() => {
  resetXrplClientFactory()
  resetXrplClients()
})

const made = async (build: Parameters<typeof makeUnsigned>[1], wallet = synced) => makeUnsigned(wallet, build, { queryClient: qc() })

describe('a Synced Transmitter makes an Unsigned Transaction (OS-FR-17)', () => {
  it('an XRP Payment: Built fields, the Sequence and Fee read, LastLedgerSequence = validated + 150, envelope with Network and index', async () => {
    const r = await made({ type: 'payment', destination: DEST, amountDrops: '2000000', destinationTag: 4 })
    expect(r.status).toBe('made')
    if (r.status !== 'made') return
    const decoded = decodeUnsignedForSigning(r.text)
    expect(decoded).toEqual({
      ok: true,
      value: {
        v: 1,
        network_id: 1,
        network: 'testnet',
        ledger_index: 5000,
        tx: { TransactionType: 'Payment', Account: ACCOUNT, Destination: DEST, Amount: '2000000', DestinationTag: 4, Fee: '12', Sequence: 8, LastLedgerSequence: 5150 },
      },
    })
    // What it makes, the Offline Wallet can show and sign.
    expect(judgeUnsigned(r.text, { network: 'testnet', address: ACCOUNT }).ok).toBe(true)
  })

  it('a token Payment: online Send\'s issued Payment, judged acceptable offline', async () => {
    const r = await made({ type: 'token-payment', destination: DEST, currency: 'USD', issuer: ISSUER, value: '5' })
    expect(r).toMatchObject({ status: 'made', checks: { type: 'token-payment', warnings: [] } })
    if (r.status !== 'made') return
    expect(r.tx).toEqual({ TransactionType: 'Payment', Account: ACCOUNT, Destination: DEST, Amount: { currency: 'USD', issuer: ISSUER, value: '5' }, Fee: '12', Sequence: 8, LastLedgerSequence: 5150 })
    expect(judgeUnsigned(r.text, { network: 'testnet', address: ACCOUNT }).ok).toBe(true)
  })

  it('a token Payment over the held balance, or from a frozen line, is refused in online Send\'s words', async () => {
    expect(await made({ type: 'token-payment', destination: DEST, currency: 'USD', issuer: ISSUER, value: '20' })).toEqual({ status: 'refused', reason: 'You only hold 10 USD.' })
    h.lines = [line({ freeze: true })]
    expect(await made({ type: 'token-payment', destination: DEST, currency: 'USD', issuer: ISSUER, value: '1' })).toEqual({
      status: 'refused',
      reason: 'You hold none of this token that can be sent: its balance is zero, it is frozen, or the trust line is gone.',
    })
  })

  it('a token Payment to a destination that needs a tag is refused; not activated or no trust line only warn, as online', async () => {
    h.accounts[DEST] = acct(DEST, { requireDestTag: true })
    expect(await made({ type: 'token-payment', destination: DEST, currency: 'USD', issuer: ISSUER, value: '1' })).toEqual({ status: 'refused', reason: SHIPPED.tagRequired })
    h.accounts[DEST] = acct(DEST)
    h.destLines = []
    expect(await made({ type: 'token-payment', destination: DEST, currency: 'USD', issuer: ISSUER, value: '1' })).toMatchObject({ status: 'made', checks: { warnings: ['no-trust-line'] } })
    delete h.accounts[DEST]
    expect(await made({ type: 'token-payment', destination: DEST, currency: 'USD', issuer: ISSUER, value: '1' })).toMatchObject({ status: 'made', checks: { warnings: ['destination-not-activated'] } })
  })

  it('paying the issuer back needs no trust line on the issuer', async () => {
    h.accounts[ISSUER] = acct(ISSUER)
    expect(await made({ type: 'token-payment', destination: ISSUER, currency: 'USD', issuer: ISSUER, value: '1' })).toMatchObject({ status: 'made', checks: { warnings: [] } })
  })

  it('a TrustSet keeps tfSetNoRipple; a key change carries the key state', async () => {
    const t = await made({ type: 'trust-line', currency: 'EUR', issuer: ISSUER, limit: '500' })
    expect(t.status === 'made' && t.tx.Flags).toBe(TrustSetFlags.tfSetNoRipple)
    const k = await made({ type: 'master-key', enable: false })
    expect(k).toMatchObject({ status: 'made', keyState: { regular_key: null, master_key: 'on', signer_list: null } })
    expect(k.status === 'made' && k.tx.SetFlag).toBe(AccountSetAsfFlags.asfDisableMaster)
  })

  it('never from a failed read; never unsynced; a Fee over the cap is refused', async () => {
    h.fail.lines = true
    expect(await made({ type: 'token-payment', destination: DEST, currency: 'USD', issuer: ISSUER, value: '1' })).toEqual({ status: 'read-failed' })
    h.fail.lines = false
    validated = new Error('down')
    expect(await made({ type: 'payment', destination: DEST, amountDrops: '1000000' })).toEqual({ status: 'read-failed' })
    validated = 5000
    expect(await made({ type: 'payment', destination: DEST, amountDrops: '1000000' }, { ...synced, address: null })).toEqual({ status: 'read-failed' })
    autofill = { Sequence: 8, Fee: '10001' }
    const r = await made({ type: 'payment', destination: DEST, amountDrops: '1000000' })
    expect(r.status).toBe('refused')
  })
})
