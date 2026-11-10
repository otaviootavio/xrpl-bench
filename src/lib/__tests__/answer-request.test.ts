import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeDataToSign, decodeRequest } from '../qr-codec'
import { buildHashOf, requestText, type PaymentBuild } from '../offline-round'
import { ANSWER_REFUSAL, SHIPPED } from '../offline-round-words'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../xrpl/client'
import { MAX_FEE_DROPS } from '../xrpl/money'
import type { TransmitterMeta } from '../crypto/keystore'

/**
 * OS-FR-15: the Transmitter answers a Data-to-Sign Request after online Send's
 * pre-flight checks, never from a failed read, on its own Network. The ledger
 * reads and the client are the external resources replaced.
 */
const h = vi.hoisted(() => ({
  accounts: {} as Record<string, any>,
  fail: { account: false, reserves: false, destination: false },
  destinationReads: 0,
}))

vi.mock('@/lib/xrpl/reads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/xrpl/reads')>()
  return {
    ...actual,
    fetchAccountState: async (_n: string, address: string) => {
      if (address === DEST) {
        h.destinationReads += 1
        if (h.fail.destination) throw new Error('down')
      } else if (h.fail.account) throw new Error('down')
      return h.accounts[address] ?? { exists: false, address, balanceDrops: '0', ownerCount: 0, sequence: 0, requireDestTag: false, disableMasterKey: false }
    },
    fetchServerReserves: async () => {
      if (h.fail.reserves) throw new Error('down')
      return { baseReserveDrops: '1000000', ownerReserveDrops: '200000' }
    },
  }
})

import { answerRequest } from '../answer-request'

const ACCOUNT = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const OTHER = 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv'
const acct = (address: string, extra: Record<string, unknown> = {}) => ({
  exists: true, address, balanceDrops: '50000000', ownerCount: 0, sequence: 7, requireDestTag: false, disableMasterKey: false, ...extra,
})
const unsynced: TransmitterMeta = { id: 't', seedId: 't', lockId: 'L', label: 'Carrier', createdAt: 1, network: 'testnet', openCheck: 'none', kind: 'transmitter', address: null }
const build: PaymentBuild = { type: 'payment', account: ACCOUNT, destination: DEST, amountDrops: '2000000' }
const requestId = 'f'.repeat(32)
function request(b: PaymentBuild = build, network: 'testnet' | 'mainnet' = 'testnet') {
  const r = decodeRequest(requestText(network, b, requestId))
  if (!r.ok) throw new Error('bad fixture')
  return r.value
}

let autofill: { Sequence: number; Fee: string } | Error
let validated: number | Error
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

beforeEach(() => {
  h.accounts = { [ACCOUNT]: acct(ACCOUNT), [DEST]: acct(DEST) }
  h.fail = { account: false, reserves: false, destination: false }
  h.destinationReads = 0
  autofill = { Sequence: 8, Fee: '12' }
  validated = 5000
  setXrplClientFactory(
    () =>
      ({
        isConnected: () => true,
        connect: async () => {},
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

describe('the Transmitter answers a request (OS-FR-15)', () => {
  it('answers with exactly the Data to Sign set, on its own Network, for the request', async () => {
    const r = await answerRequest(unsynced, request(), { queryClient: qc() })
    expect(r).toMatchObject({ status: 'answered', account: ACCOUNT, checks: { tagSupplied: false, destinationExists: true } })
    const decoded = decodeDataToSign(r.status === 'answered' ? r.text : '')
    expect(decoded).toEqual({
      ok: true,
      value: { v: 1, network_id: 1, network: 'testnet', request_id: requestId, build_hash: buildHashOf(build), sequence: 8, fee: '12', ledger_index: 5000 },
    })
  })

  it('a Synced Transmitter answers for its own address', async () => {
    expect((await answerRequest({ ...unsynced, address: ACCOUNT }, request(), { queryClient: qc() })).status).toBe('answered')
  })

  it.each([
    ['another Network', () => answerRequest(unsynced, request(build, 'mainnet'), { queryClient: qc() }), 'The app did not answer. This request is for Mainnet. This wallet is for Testnet.'],
    ['Synced to another address', () => answerRequest({ ...unsynced, address: OTHER }, request(), { queryClient: qc() }), `The app did not answer. This request is for ${ACCOUNT}. This wallet is synced to ${OTHER}.`],
  ])('refuses a request for %s (P-55)', async (_n, run, words) => {
    expect(await run()).toEqual({ status: 'refused', reason: words })
    expect(ANSWER_REFUSAL.network).toContain('The app did not answer.')
  })

  it('refuses in online words: account not activated, self-send, tag required, amount + fee over spendable, fee over the cap', async () => {
    h.accounts[ACCOUNT] = { ...acct(ACCOUNT), exists: false }
    expect(await answerRequest(unsynced, request(), { queryClient: qc() })).toEqual({ status: 'refused', reason: SHIPPED.accountNotActivated })

    h.accounts[ACCOUNT] = acct(ACCOUNT)
    const self = { ...build, destination: ACCOUNT }
    expect(await answerRequest(unsynced, request(self), { queryClient: qc() })).toEqual({ status: 'refused', reason: SHIPPED.selfSend })

    h.accounts[DEST] = acct(DEST, { requireDestTag: true })
    expect(await answerRequest(unsynced, request(), { queryClient: qc() })).toEqual({ status: 'refused', reason: SHIPPED.tagRequired })
    expect((await answerRequest(unsynced, request({ ...build, destinationTag: 3 }), { queryClient: qc() })).status).toBe('answered')

    h.accounts[DEST] = acct(DEST)
    // 50 XRP minus the 1 XRP reserve: 49 XRP spendable; 49 XRP plus a 12-drop fee does not fit.
    const r = await answerRequest(unsynced, request({ ...build, amountDrops: '49000000' }), { queryClient: qc() })
    expect(r).toEqual({ status: 'refused', reason: "That's more than your spendable balance (49 XRP) once the network fee is included." })

    autofill = { Sequence: 8, Fee: (BigInt(MAX_FEE_DROPS) + 1n).toString() }
    const fee = await answerRequest(unsynced, request(), { queryClient: qc() })
    expect(fee.status).toBe('refused')
    expect(fee.status === 'refused' && fee.reason).toMatch(/above this wallet's limit/)
  })

  it('a destination not on the ledger: below the base reserve is refused in two-device\'s words; at or above it is answered', async () => {
    delete h.accounts[DEST]
    // The base reserve is 1 XRP here.
    expect(await answerRequest(unsynced, request({ ...build, amountDrops: '999999' }), { queryClient: qc() })).toEqual({
      status: 'refused',
      reason: 'The destination is not on the ledger yet and needs at least 1 XRP to be created. Nothing was built.',
    })
    expect(await answerRequest(unsynced, request({ ...build, amountDrops: '1000000' }), { queryClient: qc() })).toMatchObject({ status: 'answered', checks: { destinationExists: false } })
  })

  it.each([
    ['the account', () => (h.fail.account = true)],
    ['the reserves', () => (h.fail.reserves = true)],
    ['the destination', () => (h.fail.destination = true)],
    ['the Sequence and Fee', () => (autofill = new Error('down'))],
    ['the validated ledger', () => (validated = new Error('down'))],
  ])('a failed read of %s produces no Data to Sign (P-28, FR-59)', async (_n, breakIt) => {
    breakIt()
    expect(await answerRequest(unsynced, request(), { queryClient: qc() })).toEqual({ status: 'read-failed' })
  })
})
