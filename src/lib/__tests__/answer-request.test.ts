import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeDataToSign, decodeRequest } from '../qr-codec'
import { buildHashOf, requestText, type OfflineBuild, type PaymentBuild } from '../offline-round'
import { ANSWER_REFUSAL, SHIPPED } from '../offline-round-words'
import { TrustSetFlags } from 'xrpl'
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
  fail: { account: false, reserves: false, destination: false, lines: false },
  destinationReads: 0,
  reserveReads: 0,
  lines: [] as Array<{ account: string; currency: string }>,
  signers: null as null | { signers: number; quorum: number } | Error,
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
    fetchAccountLines: async () => {
      if (h.fail.lines) throw new Error('down')
      return h.lines.map((l) => ({ ...l, balance: '0', limit: '1', limitPeer: '0', noRipple: true, freeze: false, freezePeer: false }))
    },
    fetchSignerList: async () => {
      if (h.signers instanceof Error) throw h.signers
      return h.signers
    },
    fetchServerReserves: async () => {
      h.reserveReads += 1
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
function request(b: OfflineBuild = build, network: 'testnet' | 'mainnet' = 'testnet') {
  const r = decodeRequest(requestText(network, b, requestId))
  if (!r.ok) throw new Error('bad fixture')
  return r.value
}

let autofill: { Sequence: number; Fee: string } | Error
let validated: number | Error
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

beforeEach(() => {
  h.accounts = { [ACCOUNT]: acct(ACCOUNT), [DEST]: acct(DEST) }
  h.fail = { account: false, reserves: false, destination: false, lines: false }
  h.destinationReads = 0
  h.reserveReads = 0
  h.lines = []
  h.signers = null
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
    expect(r).toMatchObject({ status: 'answered', account: ACCOUNT, checks: { type: 'payment', tagSupplied: false, destinationExists: true } })
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

// ---------------------------------------------------------------------------
// Story 8: trust lines and key changes.
// ---------------------------------------------------------------------------

const ISSUER = DEST
const line = (limit: string): OfflineBuild => ({ type: 'trust-line', account: ACCOUNT, currency: 'USD', issuer: ISSUER, limit })
const answer = (b: OfflineBuild) => answerRequest(unsynced, request(b), { queryClient: qc() })

describe('the Transmitter answers a trust line in the online trust-line words (OS-FR-15, story 8)', () => {
  it('a line not on the ledger is an add: the add guard ran; the Data to Sign carries no key state', async () => {
    const r = await answer(line('100'))
    expect(r).toMatchObject({ status: 'answered', checks: { type: 'trust-line', spendable: true } })
    expect(h.reserveReads).toBe(1)
    const d = decodeDataToSign(r.status === 'answered' ? r.text : '')
    expect(d.ok && d.value.key_state).toBeUndefined()
    expect(d.ok && d.value.build_hash).toBe(buildHashOf(line('100')))
  })

  it('TrustLinesTab is the online screen whose TrustSet this is: tfSetNoRipple, exactly', () => {
    expect(TrustSetFlags.tfSetNoRipple).toBe(0x00020000)
  })

  it('an add refuses: account not activated; spendable short of one owner reserve and the fee', async () => {
    h.accounts[ACCOUNT] = { ...acct(ACCOUNT), exists: false }
    expect(await answer(line('100'))).toEqual({ status: 'refused', reason: SHIPPED.trustLineNotActivated })
    // 1.1 XRP minus the 1 XRP base reserve: 0.1 XRP spendable, under the 0.2 XRP owner reserve plus the fee.
    h.accounts[ACCOUNT] = acct(ACCOUNT, { balanceDrops: '1100000' })
    expect(await answer(line('100'))).toEqual({ status: 'refused', reason: SHIPPED.trustLineNotEnough })
    h.accounts[ACCOUNT] = acct(ACCOUNT, { balanceDrops: '1200012' })
    expect((await answer(line('100'))).status).toBe('answered')
  })

  it('a line on the ledger is a change or a close: the fee guard only (no reserve read), as the edit and close dialogs', async () => {
    h.lines = [{ account: ISSUER, currency: 'USD' }]
    h.accounts[ACCOUNT] = acct(ACCOUNT, { balanceDrops: '1000000' })
    h.fail.reserves = true
    expect(await answer(line('5'))).toMatchObject({ status: 'answered', checks: { type: 'trust-line', spendable: false } })
    expect(await answer(line('0'))).toMatchObject({ status: 'answered', checks: { type: 'trust-line', spendable: false } })
    expect(h.reserveReads).toBe(0)
    autofill = { Sequence: 8, Fee: (BigInt(MAX_FEE_DROPS) + 1n).toString() }
    const fee = await answer(line('5'))
    expect(fee.status === 'refused' && fee.reason).toMatch(/above this wallet's limit/)
  })

  it('a close of a line that is not there takes no reserve: the fee guard only; the ledger decides', async () => {
    expect(await answer(line('0'))).toMatchObject({ status: 'answered', checks: { type: 'trust-line', spendable: false } })
    expect(h.reserveReads).toBe(0)
  })

  it('another currency or issuer is another line', async () => {
    h.lines = [{ account: ISSUER, currency: 'EUR' }, { account: OTHER, currency: 'USD' }]
    expect(await answer(line('5'))).toMatchObject({ checks: { spendable: true } })
  })

  it.each([
    ['the account', () => (h.fail.account = true)],
    ['the trust lines', () => (h.fail.lines = true)],
    ['the reserves (an add)', () => (h.fail.reserves = true)],
    ['the Sequence and Fee', () => (autofill = new Error('down'))],
    ['the validated ledger', () => (validated = new Error('down'))],
  ])('a failed read of %s produces no Data to Sign (P-28)', async (_n, breakIt) => {
    breakIt()
    expect(await answer(line('100'))).toEqual({ status: 'read-failed' })
  })
})

describe('the Transmitter answers a key change with the key state, warning and never refusing (OS-FR-15, OS-FR-21, story 8)', () => {
  const setKey: OfflineBuild = { type: 'regular-key', account: ACCOUNT, regularKey: OTHER }
  const removeKey: OfflineBuild = { type: 'regular-key', account: ACCOUNT, regularKey: null }
  const off: OfflineBuild = { type: 'master-key', account: ACCOUNT, enable: false }
  const on: OfflineBuild = { type: 'master-key', account: ACCOUNT, enable: true }

  it('the Data to Sign carries the key state as read, exactly', async () => {
    h.accounts[ACCOUNT] = acct(ACCOUNT, { regularKey: DEST })
    const r = await answer(setKey)
    expect(r).toMatchObject({ status: 'answered', checks: { type: 'key' }, keyState: { regular_key: DEST, master_key: 'on', signer_list: null } })
    expect(decodeDataToSign(r.status === 'answered' ? r.text : '')).toEqual({
      ok: true,
      value: {
        v: 1, network_id: 1, network: 'testnet', request_id: requestId, build_hash: buildHashOf(setKey), sequence: 8, fee: '12', ledger_index: 5000,
        key_state: { regular_key: DEST, master_key: 'on', signer_list: null },
      },
    })
    h.accounts[ACCOUNT] = acct(ACCOUNT, { disableMasterKey: true })
    expect(await answer(on)).toMatchObject({ keyState: { regular_key: null, master_key: 'off', signer_list: null } })
  })

  it('never refuses what the ledger may accept: master key off with no Regular Key, off when already off, removing the only key', async () => {
    expect((await answer(off)).status).toBe('answered')
    h.accounts[ACCOUNT] = acct(ACCOUNT, { disableMasterKey: true })
    expect((await answer(off)).status).toBe('answered')
    expect((await answer(removeKey)).status).toBe('answered')
    expect((await answer(setKey)).status).toBe('answered')
  })

  it('an Account not on the ledger is refused in the online key screens\' words; the fee cap stays', async () => {
    h.accounts[ACCOUNT] = { ...acct(ACCOUNT), exists: false }
    expect(await answer(setKey)).toEqual({ status: 'refused', reason: SHIPPED.noKeysToChange })
    expect(await answer(off)).toEqual({ status: 'refused', reason: SHIPPED.noMasterKeySetting })
    h.accounts[ACCOUNT] = acct(ACCOUNT)
    autofill = { Sequence: 8, Fee: (BigInt(MAX_FEE_DROPS) + 1n).toString() }
    const fee = await answer(on)
    expect(fee.status === 'refused' && fee.reason).toMatch(/above this wallet's limit/)
  })

  it.each([
    ['the account (it holds the key state and proves the Account exists)', () => (h.fail.account = true)],
    ['the Sequence and Fee', () => (autofill = new Error('down'))],
    ['the validated ledger', () => (validated = new Error('down'))],
  ])('a failed read of %s produces no Data to Sign (P-28)', async (_n, breakIt) => {
    breakIt()
    expect(await answer(off)).toEqual({ status: 'read-failed' })
  })

  it('P-55 still comes first', async () => {
    expect((await answerRequest(unsynced, request(off, 'mainnet'), { queryClient: qc() })).status).toBe('refused')
  })
})

describe('story 8 review round two: the signer list and hex codes', () => {
  const setKey: OfflineBuild = { type: 'regular-key', account: ACCOUNT, regularKey: OTHER }
  it('carries the signer list in the key state; a failed read of it is "unknown" and still answers', async () => {
    h.signers = { signers: 3, quorum: 2 }
    const r = await answer(setKey)
    const d = decodeDataToSign(r.status === 'answered' ? r.text : '')
    expect(d.ok && d.value.key_state).toEqual({ regular_key: null, master_key: 'on', signer_list: { signers: 3, quorum: 2 } })
    h.signers = new Error('down')
    const u = await answer(setKey)
    expect(u).toMatchObject({ status: 'answered', keyState: { signer_list: 'unknown' } })
  })
  it('a hex currency matches the ledger\'s line whatever its case; a 3-character code only in its own case', async () => {
    const hex = '0158415500000000C1F76FF6ECB0BAC600000000'
    h.lines = [{ account: DEST, currency: hex }, { account: DEST, currency: 'USD' }]
    expect(await answer({ type: 'trust-line', account: ACCOUNT, currency: hex.toLowerCase(), issuer: DEST, limit: '5' })).toMatchObject({ checks: { spendable: false } })
    expect(await answer({ type: 'trust-line', account: ACCOUNT, currency: 'usd', issuer: DEST, limit: '5' })).toMatchObject({ checks: { spendable: true } })
  })
})

