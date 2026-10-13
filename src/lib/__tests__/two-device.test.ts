import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Wallet, decode, encode } from 'xrpl'
import { encodeSigned, encodeUnsigned } from '../qr-codec'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../xrpl/client'
import { resetTxInFlightReporter } from '../xrpl/writes'

/**
 * Story 11 / AD-30. The signatures are real; the keystore and the ledger reads
 * are the external resources replaced.
 */
const h = vi.hoisted(() => ({
  wallets: [] as any[],
  accounts: {} as Record<string, any>,
  failAccountRead: false,
  signAs: null as any,
  checkResult: null as any,
  tooLarge: false,
  ledgerFails: false,
}))

vi.mock('../qr-codec', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../qr-codec')>()
  return {
    ...actual,
    encodeUnsigned: (...a: Parameters<typeof actual.encodeUnsigned>) =>
      h.tooLarge ? { ok: false as const, reason: 'This transaction is too large for one QR code, so it cannot be carried between the two devices.' } : actual.encodeUnsigned(...a),
  }
})

vi.mock('@/lib/xrpl/reads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/xrpl/reads')>()
  return {
    ...actual,
    fetchAccountState: async (_n: string, address: string) => {
      if (h.failAccountRead) throw new Error('down')
      return h.accounts[address] ?? { exists: false, address, balanceDrops: '0', ownerCount: 0, sequence: 0, requireDestTag: false, disableMasterKey: false }
    },
    fetchServerReserves: async () => ({ baseReserveDrops: '1000000', ownerReserveDrops: '200000' }),
  }
})

vi.mock('@/lib/crypto/keystore', () => {
  class SigningCheckError extends Error {
    result: any
    constructor(result: any) {
      super(result.status === 'cancelled' ? 'Cancelled. Nothing was signed.' : 'Incorrect PIN. 4 tries remaining.')
      this.result = result
    }
  }
  return {
    SigningCheckError,
    listWallets: async () => h.wallets,
    signingHandleFor: async (id: string) => {
      const w = h.wallets.find((x) => x.id === id)
      return {
        address: w.address,
        open: async () => {
          if (h.checkResult) throw new SigningCheckError(h.checkResult)
          return { sign: (tx: any) => h.signAs.sign(tx), dispose: () => {} }
        },
      }
    },
  }
})

import { buildUnsigned, reviewUnsigned, signUnsigned, submitReturned, twoDeviceBlockedReason, verifySigned } from '../two-device'

const master = Wallet.fromSeed('sEdTM1uX8pu2do5XvTnutH6HsouMaM2')
const other = Wallet.fromSeed('sEdSJHS4oiAdz7w2X2ni1gFiqtbJHqE')
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const acct = (extra: Record<string, unknown> = {}) => ({
  exists: true, address: master.address, balanceDrops: '50000000', ownerCount: 0, sequence: 7, requireDestTag: false, disableMasterKey: false, ...extra,
})
const onlineMeta = { id: 'on', network: 'testnet', address: master.address, keyAddress: master.address, label: 'On' }
const offlineMeta = { id: 'off', network: 'testnet', address: master.address, keyAddress: master.address, label: 'Off' }

let validated = 1000
let submitted: string[] = []
let submitResult: () => any
let autofillFee = '12'

function installClient() {
  const client = {
    isConnected: () => true,
    connect: async () => {},
    autofill: async (tx: any) => ({ Sequence: 7, LastLedgerSequence: validated + 20, ...tx, ...(tx.Fee ? {} : { Fee: autofillFee }), Flags: tx.Flags ?? 0 }),
    request: async () => {
      if (h.ledgerFails) throw new Error('ledger down')
      return { result: { ledger_index: validated } }
    },
    submitAndWait: async (blob: string) => {
      submitted.push(blob)
      return submitResult()
    },
  }
  setXrplClientFactory(() => client as any)
}

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
const paymentReq = { kind: 'payment', destination: DEST, amountDrops: '1000000' } as const

async function built(req: any = paymentReq) {
  const r = await buildUnsigned('on', req, { queryClient: qc() })
  if (r.status !== 'built') throw new Error('expected built: ' + (r as any).reason)
  return r
}

beforeEach(() => {
  h.wallets = [onlineMeta, offlineMeta]
  h.accounts = { [master.address]: acct({ regularKey: other.address }), [DEST]: { ...acct(), address: DEST } }
  h.failAccountRead = false
  h.signAs = master
  h.checkResult = null
  h.tooLarge = false
  h.ledgerFails = false
  validated = 1000
  submitted = []
  autofillFee = '12'
  submitResult = () => ({ result: { meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 1010 } })
  installClient()
})
afterEach(() => {
  resetTxInFlightReporter()
  resetXrplClients()
  resetXrplClientFactory()
})

describe('buildUnsigned', () => {
  it('builds with LastLedgerSequence = validated + 75 and carries it in the code', async () => {
    const r = await built()
    expect(r.lastLedgerSequence).toBe(1075)
    expect(r.tx.LastLedgerSequence).toBe(1075)
    const reviewed = reviewUnsigned(r.text, offlineMeta as any)
    expect(reviewed.status).toBe('ok')
    expect(reviewed.status === 'ok' && reviewed.review.lastLedgerSequence).toBe(1075)
  })

  it('blocks on an errored account read, a missing account, and a failed guard, building nothing', async () => {
    h.failAccountRead = true
    expect(await buildUnsigned('on', paymentReq, { queryClient: qc() })).toMatchObject({ status: 'refused', reason: expect.stringContaining('could not be read') })
    h.failAccountRead = false
    h.accounts = {}
    expect(await buildUnsigned('on', paymentReq, { queryClient: qc() })).toMatchObject({ status: 'refused', reason: expect.stringContaining('not on the ledger') })
    h.accounts = { [master.address]: acct({ disableMasterKey: true }) }
    expect(await buildUnsigned('on', { kind: 'regular-key', regularKey: other.address }, { queryClient: qc() })).toMatchObject({ status: 'refused', reason: expect.stringContaining('master key turned off') })
    h.accounts = { [master.address]: acct() }
    expect(await buildUnsigned('on', { kind: 'master-key', enable: false }, { queryClient: qc() })).toMatchObject({ status: 'refused', reason: expect.stringContaining('no Regular Key') })
  })

  it('refuses a payment above the spendable balance, with the fee added', async () => {
    h.accounts = { [master.address]: acct({ balanceDrops: '1500000' }), [DEST]: { ...acct(), address: DEST } }
    expect(await buildUnsigned('on', { ...paymentReq, amountDrops: '600000' }, { queryClient: qc() })).toMatchObject({ status: 'refused', reason: expect.stringContaining('more than this account can spend') })
    h.accounts = { [master.address]: acct({ balanceDrops: '1500000' }), [DEST]: { ...acct(), address: DEST } }
    expect((await buildUnsigned('on', { ...paymentReq, amountDrops: '499000' }, { queryClient: qc() })).status).toBe('built')
    h.accounts = { [master.address]: acct({ balanceDrops: '1500000' }), [DEST]: { ...acct(), address: DEST } }
    expect(await buildUnsigned('on', { ...paymentReq, amountDrops: '499995' }, { queryClient: qc() })).toMatchObject({ status: 'refused', reason: expect.stringContaining('plus the network fee') })
  })

  it('refuses a fee over the cap, and a destination that needs a tag', async () => {
    autofillFee = '20000'
    expect(await buildUnsigned('on', paymentReq, { queryClient: qc() })).toMatchObject({ status: 'refused', reason: expect.stringContaining('Nothing was signed or submitted') })
    autofillFee = '12'
    h.accounts = { ...h.accounts, [DEST]: { ...acct(), address: DEST, requireDestTag: true } }
    expect(await buildUnsigned('on', paymentReq, { queryClient: qc() })).toMatchObject({ status: 'refused', reason: expect.stringContaining('destination tag') })
  })

  it('refuses a payload too large for one QR', async () => {
    h.accounts = { [master.address]: acct({ regularKey: other.address }) }
    // A regular-key build is small; prove the refusal path through the codec directly.
    expect(encodeUnsigned({ network: 'testnet', tx: { M: 'x'.repeat(5000) } })).toMatchObject({ ok: false })
  })

  it('exposes the same guard to the UI: an errored read blocks with a reason', () => {
    expect(twoDeviceBlockedReason('payment', null, true)).toMatch(/could not be read/)
    expect(twoDeviceBlockedReason('payment', undefined, false)).toMatch(/Reading/)
    expect(twoDeviceBlockedReason('master-key', acct() as any, false, true)).toMatch(/already on/)
  })
})

describe('reviewUnsigned (offline)', () => {
  const base: any = { TransactionType: 'Payment', Account: master.address, Destination: DEST, Amount: '1000000', Sequence: 7, Fee: '12', LastLedgerSequence: 1075, Flags: 0 }
  const text = (tx: any, network: any = 'testnet') => {
    const e = encodeUnsigned({ network, tx })
    return e.ok ? e.text : ''
  }
  const refused = (tx: any, reason: RegExp, network: any = 'testnet') => {
    const r = reviewUnsigned(text(tx, network), offlineMeta as any)
    expect(r).toMatchObject({ status: 'refused', reason: expect.stringMatching(reason) })
    expect((r as any).reason).toMatch(/Nothing was signed/)
  }

  it('shows the decoded fields', () => {
    const r = reviewUnsigned(text(base), offlineMeta as any)
    expect(r).toMatchObject({ status: 'ok', review: { kind: 'payment', account: master.address, destination: DEST, amountXrp: '1 XRP', feeXrp: '0.000012 XRP', lastLedgerSequence: 1075, networkLabel: 'Testnet', mainnet: false } })
  })

  it('says real funds on Mainnet', () => {
    const r = reviewUnsigned(text(base, 'mainnet'), { ...offlineMeta, network: 'mainnet' } as any)
    expect(r).toMatchObject({ status: 'ok', review: { mainnet: true } })
  })

  it('refuses every case in the contract', () => {
    refused(base, /Testnet, but this wallet is on Mainnet|for Mainnet/, 'mainnet')
    refused({ ...base, Account: DEST }, /different account/)
    refused({ ...base, TransactionType: 'TrustSet' }, /kind of transaction/)
    refused({ ...base, Amount: { currency: 'USD', issuer: DEST, value: '1' } }, /not in XRP/)
    refused({ ...base, Sequence: undefined }, /no Sequence/)
    refused({ ...base, Fee: undefined }, /no fee/)
    refused({ ...base, LastLedgerSequence: undefined }, /LastLedgerSequence/)
    refused({ ...base, Fee: '10001' }, /fee is more than/)
    refused({ ...base, Fee: '012' }, /not a valid amount/)
    refused({ ...base, SigningPubKey: 'AB' }, /already carries a signature/)
    refused({ ...base, TxnSignature: 'AB' }, /already carries a signature/)
    refused({ ...base, Paths: [] }, /does not sign/)
    refused({ ...base, Flags: 131072 }, /flags/)
    refused({ TransactionType: 'AccountSet', Account: master.address, Sequence: 7, Fee: '12', LastLedgerSequence: 9, SetFlag: 8 }, /account setting/)
  })

  it('refuses garbage text with the codec’s reason', () => {
    expect(reviewUnsigned('hello', offlineMeta as any)).toMatchObject({ status: 'refused' })
  })
})

describe('the round trip', () => {
  async function signOffline(r: Awaited<ReturnType<typeof built>>) {
    const s = await signUnsigned('off', r.text, { prompts: { pin: async () => null } })
    if (s.status !== 'signed') throw new Error('expected signed: ' + (s as any).reason)
    return s.text
  }

  it('builds, signs offline, verifies, submits, and reports validated', async () => {
    const r = await built()
    const signed = await signOffline(r)
    const out = await submitReturned(onlineMeta as any, r.tx, signed, { queryClient: qc() })
    expect(out.status).toBe('validated')
    expect(submitted).toHaveLength(1)
    expect(decode(submitted[0]).Amount).toBe('1000000')
  })

  it('works for SetRegularKey and the master-key flag too', async () => {
    for (const req of [{ kind: 'regular-key', regularKey: other.address }, { kind: 'master-key', enable: false }] as const) {
      const r = await built(req)
      const out = await submitReturned(onlineMeta as any, r.tx, await signOffline(r), { queryClient: qc() })
      expect(out.status).toBe('validated')
    }
  })

  it('refuses a tampered blob (amount, destination, fee, LastLedgerSequence) and submits nothing', async () => {
    const r = await built()
    for (const change of [{ Amount: '9000000' }, { Destination: other.address }, { Fee: '13' }, { LastLedgerSequence: 99999 }]) {
      const tampered = master.sign({ ...(r.tx as any), ...change })
      const out = await submitReturned(onlineMeta as any, r.tx, encodeSigned(tampered.tx_blob).ok ? (encodeSigned(tampered.tx_blob) as any).text : '', { queryClient: qc() })
      expect(out).toMatchObject({ status: 'refused', reason: expect.stringContaining('not the one that was sent') })
    }
    expect(submitted).toEqual([])
  })

  it('refuses a blob signed by a key that is not the master or Regular Key', async () => {
    const r = await built()
    h.accounts = { [master.address]: acct({ regularKey: DEST }) }
    h.signAs = other
    // `other` signs a transaction whose Account is the master's: the key is not authorised.
    const s = encodeSigned(other.sign(r.tx as any).tx_blob)
    const out = await submitReturned(onlineMeta as any, r.tx, (s as any).text, { queryClient: qc() })
    expect(out).toMatchObject({ status: 'refused', reason: expect.stringContaining('not this account’s master key or Regular Key') })
    expect(submitted).toEqual([])
  })

  it('accepts the Regular Key, and refuses the master key once it is off', async () => {
    const r = await built()
    h.accounts = { [master.address]: acct({ regularKey: other.address }) }
    const byRegular = (encodeSigned(other.sign(r.tx as any).tx_blob) as any).text
    expect((await submitReturned(onlineMeta as any, r.tx, byRegular, { queryClient: qc() })).status).toBe('validated')
    submitted = []
    h.accounts = { [master.address]: acct({ regularKey: other.address, disableMasterKey: true }) }
    const byMaster = (encodeSigned(master.sign(r.tx as any).tx_blob) as any).text
    expect((await submitReturned(onlineMeta as any, r.tx, byMaster, { queryClient: qc() })).status).toBe('refused')
    expect(submitted).toEqual([])
  })

  it('blocks when the fresh read at verify errors', async () => {
    const r = await built()
    const signed = await signOffline(r)
    h.failAccountRead = true
    expect(await submitReturned(onlineMeta as any, r.tx, signed, { queryClient: qc() })).toMatchObject({ status: 'refused', reason: expect.stringContaining('could not be read') })
    expect(submitted).toEqual([])
  })

  it('refuses a signed code that is not one', async () => {
    const r = await built()
    expect((await verifySigned(onlineMeta as any, r.tx, 'garbage', { queryClient: qc() })).status).toBe('refused')
  })

  it('reports expired when the validated ledger is already past LastLedgerSequence, and never submits', async () => {
    const r = await built()
    const signed = await signOffline(r)
    validated = 1076
    const out = await submitReturned(onlineMeta as any, r.tx, signed, { queryClient: qc() })
    expect(out).toMatchObject({ status: 'expired', reason: expect.stringContaining('expired') })
    expect(submitted).toEqual([])
  })

  it('reports tefMAX_LEDGER as expired, not failed', async () => {
    const r = await built()
    const signed = await signOffline(r)
    submitResult = () => ({ result: { meta: { TransactionResult: 'tefMAX_LEDGER' }, ledger_index: 1010 } })
    expect((await submitReturned(onlineMeta as any, r.tx, signed, { queryClient: qc() })).status).toBe('expired')
    submitResult = () => {
      throw new Error('tefMAX_LEDGER: Ledger sequence too high')
    }
    expect((await submitReturned(onlineMeta as any, r.tx, signed, { queryClient: qc() })).status).toBe('expired')
  })

  it('words a tec result as claimed, with the fee charged, not as success', async () => {
    const r = await built()
    const signed = await signOffline(r)
    submitResult = () => ({ result: { meta: { TransactionResult: 'tecUNFUNDED_PAYMENT' }, ledger_index: 1010 } })
    const out = await submitReturned(onlineMeta as any, r.tx, signed, { queryClient: qc() })
    expect(out).toMatchObject({ status: 'not-validated', reason: expect.stringContaining('fee was still charged') })
  })

  it('a cancelled check signs nothing and is "Cancelled. Nothing was signed."; a wrong PIN is a check failure', async () => {
    const r = await built()
    h.checkResult = { status: 'cancelled' }
    expect(await signUnsigned('off', r.text, { prompts: { pin: async () => null } })).toEqual({ status: 'cancelled', reason: 'Cancelled. Nothing was signed.' })
    h.checkResult = { status: 'wrong-credential', kind: 'pin', triesRemaining: 4 }
    expect(await signUnsigned('off', r.text, { prompts: { pin: async () => null } })).toMatchObject({ status: 'check-failed' })
  })

  it('signUnsigned refuses before any prompt on a wrong network or Account', async () => {
    const r = await built()
    h.checkResult = { status: 'cancelled' }
    h.wallets = [onlineMeta, { ...offlineMeta, network: 'mainnet' }]
    expect(await signUnsigned('off', r.text, { prompts: { pin: async () => null } })).toMatchObject({ status: 'refused', reason: expect.stringContaining('Nothing was signed') })
    h.wallets = [onlineMeta, { ...offlineMeta, address: DEST }]
    expect(await signUnsigned('off', r.text, { prompts: { pin: async () => null } })).toMatchObject({ status: 'refused' })
  })
})

describe('hardening', () => {
  async function signed(r: Awaited<ReturnType<typeof built>>, who: Wallet = master) {
    return (encodeSigned(who.sign(r.tx as any).tx_blob) as any).text as string
  }

  it('refuses a blob whose signature byte was flipped, though every field matches', async () => {
    const r = await built()
    const blob = master.sign(r.tx as any).tx_blob
    const d: any = decode(blob)
    const last = d.TxnSignature.slice(-1)
    d.TxnSignature = d.TxnSignature.slice(0, -1) + (last === '0' ? '1' : '0')
    const text = (encodeSigned(encode(d)) as any).text
    expect(await submitReturned(onlineMeta as any, r.tx, text, { queryClient: qc() })).toMatchObject({ status: 'refused', reason: expect.stringContaining('signature') })
    expect(submitted).toEqual([])
  })

  it('refuses a master-key-off blob when the Regular Key went away since the build', async () => {
    const r = await built({ kind: 'master-key', enable: false })
    const text = await signed(r)
    h.accounts = { [master.address]: acct() }
    expect(await submitReturned(onlineMeta as any, r.tx, text, { queryClient: qc() })).toMatchObject({ status: 'refused', reason: expect.stringContaining('no longer has a Regular Key') })
    expect(submitted).toEqual([])
  })

  it('refuses inherited type names without throwing', () => {
    for (const TransactionType of ['constructor', '__proto__', 'toString', 7]) {
      const e = encodeUnsigned({ network: 'testnet', tx: { TransactionType, Account: master.address, Sequence: 1, Fee: '12', LastLedgerSequence: 9 } })
      const r = reviewUnsigned((e as any).text, offlineMeta as any)
      expect(r).toMatchObject({ status: 'refused', reason: expect.stringContaining('Nothing was signed') })
    }
  })

  it('accepts a NetworkID that autofill adds on a custom node, and signs it', async () => {
    const r = await built()
    const tx = { ...(r.tx as any), NetworkID: 1025 }
    const text = (encodeUnsigned({ network: 'testnet', tx }) as any).text
    expect(reviewUnsigned(text, offlineMeta as any).status).toBe('ok')
    const bad = (encodeUnsigned({ network: 'testnet', tx: { ...tx, NetworkID: 'x' } }) as any).text
    expect(reviewUnsigned(bad, offlineMeta as any).status).toBe('refused')
  })

  it('words an unknown submit outcome as "may have been sent", refreshes, and never resubmits', async () => {
    const r = await built()
    submitResult = () => {
      throw new Error('socket closed')
    }
    const out = await submitReturned(onlineMeta as any, r.tx, await signed(r), { queryClient: qc() })
    expect(out).toMatchObject({ status: 'unconfirmed', reason: expect.stringContaining('may have been sent') })
    expect((out as any).reason).toMatch(/history before building another/)
    expect(submitted).toHaveLength(1)
  })

  it('refuses plainly when the choke point refused the fee, before anything left', async () => {
    const r = await built()
    const sent = { ...(r.tx as any), Fee: '20000' }
    const out = await submitReturned(onlineMeta as any, sent, await signed({ ...r, tx: sent }), { queryClient: qc() })
    expect(out).toMatchObject({ status: 'refused', reason: expect.stringContaining('Nothing was signed or submitted') })
    expect(submitted).toEqual([])
  })

  it('refuses, submitting nothing, when the validated ledger cannot be read before submit', async () => {
    const r = await built()
    const text = await signed(r)
    h.ledgerFails = true
    expect(await submitReturned(onlineMeta as any, r.tx, text, { queryClient: qc() })).toMatchObject({ status: 'refused', reason: expect.stringContaining('could not be read') })
    expect(submitted).toEqual([])
  })

  it('a build over one QR is refused with the plain reason', async () => {
    h.tooLarge = true
    expect(await buildUnsigned('on', paymentReq, { queryClient: qc() })).toMatchObject({ status: 'refused', reason: expect.stringContaining('too large for one QR') })
  })

  it('round-trips turning the master key on (ClearFlag) signed by the Regular Key', async () => {
    h.accounts = { [master.address]: acct({ regularKey: other.address, disableMasterKey: true }) }
    h.signAs = other
    const r = await built({ kind: 'master-key', enable: true })
    expect((r.tx as any).ClearFlag).toBe(4)
    const s = await signUnsigned('off', r.text, { prompts: { pin: async () => null } })
    expect(s.status).toBe('signed')
    const out = await submitReturned(onlineMeta as any, r.tx, (s as any).text, { queryClient: qc() })
    expect(out.status).toBe('validated')
  })

  it('refuses an AccountSet carrying both SetFlag and ClearFlag', () => {
    const e = encodeUnsigned({ network: 'testnet', tx: { TransactionType: 'AccountSet', Account: master.address, Sequence: 1, Fee: '12', LastLedgerSequence: 9, SetFlag: 4, ClearFlag: 4 } })
    expect(reviewUnsigned((e as any).text, offlineMeta as any)).toMatchObject({ status: 'refused', reason: expect.stringContaining('account setting') })
  })
})
