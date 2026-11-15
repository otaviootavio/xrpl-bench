import { describe, expect, it } from 'vitest'
import { AccountSetAsfFlags, PaymentFlags, TrustSetFlags, validate, Wallet } from 'xrpl'
import { encodeRequest, encodeSigned, encodeUnsigned } from '@/lib/qr-codec'
import { encodeBytes } from '@/lib/ur/cbor'
import { encodeSinglePart } from '@/lib/ur/ur'
import { judgeUnsigned, sameBuildHashOf, USUAL_WINDOW, windowOf } from '@/lib/unsigned-judge'
import { LEDGER_FLOORS } from '@/lib/offline-window'
import { buildHashOf } from '@/lib/offline-round'
import * as W from '@/lib/offline-round-words'
import { fill } from '@/lib/transmit-words'

/** OS-FR-18: the Offline Wallet's judgement of an Unsigned Transaction (route-checks "Transmitter-builds route"). */
const ACCOUNT = Wallet.generate().address
const DEST = Wallet.generate().address
const ISSUER = Wallet.generate().address
const wallet = { network: 'testnet' as const, address: ACCOUNT }
const LEDGER = 22_400_000

const base = { Account: ACCOUNT, Fee: '12', Sequence: 101, LastLedgerSequence: LEDGER + 150 }
const xrpPayment = { TransactionType: 'Payment', ...base, Destination: DEST, Amount: '2000000' }
const tokenPayment = { TransactionType: 'Payment', ...base, Destination: ISSUER, Amount: { currency: 'USD', issuer: ISSUER, value: '5' } }
const trustSet = { TransactionType: 'TrustSet', ...base, LimitAmount: { currency: 'USD', issuer: ISSUER, value: '500' }, Flags: TrustSetFlags.tfSetNoRipple }

const unsigned = (tx: Record<string, unknown>, network: 'testnet' | 'mainnet' | 'devnet' = 'testnet', ledgerIndex = LEDGER) =>
  encodeUnsigned({ network, tx, ledgerIndex }).text
const judge = (tx: Record<string, unknown>, network?: 'testnet' | 'mainnet' | 'devnet', ledgerIndex?: number) => judgeUnsigned(unsigned(tx, network, ledgerIndex), wallet)
const reasonOf = (j: ReturnType<typeof judgeUnsigned>) => (j.ok ? null : j.reason)
const hex = (s: string) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()

describe('judgeUnsigned accepts what it can show in words (OS-FR-18)', () => {
  it('an XRP Payment: the codec reading, the window, and the Offline-builds Build hash', () => {
    const j = judge(xrpPayment)
    expect(j.ok).toBe(true)
    if (!j.ok) return
    expect(j.window).toBe(150)
    expect(j.ledgerIndex).toBe(LEDGER)
    expect(j.rows.map((r) => r.name)).toEqual(expect.arrayContaining(['TransactionType', 'Account', 'Destination', 'Amount', 'Fee', 'Sequence', 'LastLedgerSequence']))
    expect(j.rows.find((r) => r.name === 'Amount')?.value).toBe('2 XRP')
    expect(j.rows.every((r) => r.cautions.length === 0)).toBe(true)
    // A later Offline Build of the same payment is a Same Build (story 7's hash, unchanged).
    expect(j.buildHash).toBe(buildHashOf({ type: 'payment', account: ACCOUNT, destination: DEST, amountDrops: '2000000' }))
  })

  it('a token Payment, hashed whole under its own tag', () => {
    const j = judge(tokenPayment)
    expect(j.ok).toBe(true)
    if (!j.ok) return
    expect(j.rows.find((r) => r.name === 'Amount')?.value).toBe(`5 USD ${ISSUER}`)
    expect(j.buildHash).toMatch(/^[0-9a-f]{64}$/)
    expect(j.buildHash).not.toBe(buildHashOf({ type: 'payment', account: ACCOUNT, destination: ISSUER, amountDrops: '5' }))
    // The values set per round never make two Builds different.
    expect(sameBuildHashOf({ ...tokenPayment, Sequence: 7, Fee: '15', LastLedgerSequence: 9 })).toBe(j.buildHash)
  })

  it('a TrustSet with tfSetNoRipple is not a partial payment (the same bit), and matches the Offline Build hash', () => {
    expect(TrustSetFlags.tfSetNoRipple).toBe(PaymentFlags.tfPartialPayment)
    const j = judge(trustSet)
    expect(j.ok).toBe(true)
    if (!j.ok) return
    expect(j.rows.find((r) => r.name === 'Flags')?.value).toBe('tfSetNoRipple')
    expect(j.buildHash).toBe(buildHashOf({ type: 'trust-line', account: ACCOUNT, currency: 'USD', issuer: ISSUER, limit: '500' }))
  })

  it('SetRegularKey and the master key flags hash as the Offline Builds do', () => {
    const key = Wallet.generate().address
    const set = judge({ TransactionType: 'SetRegularKey', ...base, RegularKey: key })
    expect(set.ok && set.buildHash).toBe(buildHashOf({ type: 'regular-key', account: ACCOUNT, regularKey: key }))
    const off = judge({ TransactionType: 'AccountSet', ...base, SetFlag: AccountSetAsfFlags.asfDisableMaster })
    expect(off.ok && off.buildHash).toBe(buildHashOf({ type: 'master-key', account: ACCOUNT, enable: false }))
    const on = judge({ TransactionType: 'AccountSet', ...base, ClearFlag: AccountSetAsfFlags.asfDisableMaster })
    expect(on.ok && on.buildHash).toBe(buildHashOf({ type: 'master-key', account: ACCOUNT, enable: true }))
  })

  it('a window longer than the usual one is reported in ledgers (P-13, P-15)', () => {
    const j = judge({ ...xrpPayment, LastLedgerSequence: LEDGER + 400 })
    expect(j.ok && j.window).toBe(400)
    expect(USUAL_WINDOW).toBe(150)
  })
})

describe('nothing xrpl.js refuses at signing reaches the review (round two)', () => {
  it('every accepted shape passes validate()', () => {
    for (const tx of [xrpPayment, tokenPayment, trustSet, { ...xrpPayment, SendMax: '3000000', Paths: [[{ currency: 'XRP' }]] }, { ...xrpPayment, Sequence: 0, TicketSequence: 5 }]) {
      const j = judge(tx)
      expect(j.ok).toBe(true)
      if (j.ok) expect(() => validate(j.tx)).not.toThrow()
    }
  })
})

describe('the window against this device own upper bound for the current ledger (P-13, P-15, round two)', () => {
  const now = LEDGER_FLOORS.testnet.at + 3600_000
  const upper = LEDGER_FLOORS.testnet.index + Math.ceil(3600 / 3) + 30
  const at = (ledgerIndex: number, lls: number) => {
    const j = judge({ ...xrpPayment, LastLedgerSequence: lls }, 'testnet', ledgerIndex)
    if (!j.ok) throw new Error(j.reason)
    return j
  }

  it('a plausible index: the window the Transmitter set, no P-15 (a correct round never warns)', () => {
    expect(windowOf(at(upper - 2000, upper - 1850), null, now, 'testnet')).toEqual({ ledgers: 150, longer: false })
    expect(windowOf(at(upper, upper + 150), null, now, 'testnet')).toEqual({ ledgers: 150, longer: false })
  })

  it('a fresh wallet and a shifted index: counted from the bound, said in ledgers and warned, never "150"', () => {
    const shifted = upper + 100_000
    expect(windowOf(at(shifted, shifted + 150), null, now, 'testnet')).toEqual({ ledgers: 100_150, longer: true })
  })

  it('from the highest seen when there is one', () => {
    const seen = { index: 30_000_000, at: now }
    expect(windowOf(at(30_000_030, 30_000_180), seen, now, 'testnet')).toEqual({ ledgers: 150, longer: false })
    expect(windowOf(at(30_000_031, 30_000_181), seen, now, 'testnet')).toEqual({ ledgers: 151, longer: true })
  })

  it('a long window the Transmitter states plainly is P-15 too', () => {
    expect(windowOf(at(upper - 10, upper + 390), null, now, 'testnet')).toEqual({ ledgers: 400, longer: true })
  })
})

describe('P-53: a caution under each risky row', () => {
  it('SendMax above an Amount in the same asset, Paths, and each memo part as its own row', () => {
    const j = judge({
      ...xrpPayment,
      SendMax: '3000000',
      Paths: [[{ currency: 'XRP' }]],
      Memos: [{ Memo: { MemoType: hex('note'), MemoData: hex('rent for may') } }],
    })
    expect(j.ok).toBe(true)
    if (!j.ok) return
    const row = (n: string) => j.rows.find((r) => r.name === n)!
    expect(row('SendMax').cautions).toEqual([fill(W.RISKY.sendMax, '3 XRP')])
    expect(row('Paths').cautions).toEqual([W.RISKY.paths])
    expect(row('MemoType')).toEqual({ name: 'MemoType', value: 'note', cautions: ['This transaction has a memo. All persons can read the memo on the ledger: note.'] })
    expect(row('MemoData').value).toBe('rent for may')
    expect(row('MemoData').cautions).toEqual(['This transaction has a memo. All persons can read the memo on the ledger: rent for may.'])
    expect(j.rows.find((r) => r.name === 'Memos')).toBeUndefined()
  })

  it('SendMax in another asset, or not above the Amount, has no "more than" sentence', () => {
    const other = judge({ ...tokenPayment, SendMax: '3000000' })
    expect(other.ok && other.rows.find((r) => r.name === 'SendMax')?.cautions).toEqual([])
    const equal = judge({ ...xrpPayment, SendMax: '2000000' })
    expect(equal.ok && equal.rows.find((r) => r.name === 'SendMax')?.cautions).toEqual([])
  })

  it('TicketSequence (Sequence 0)', () => {
    const j = judge({ ...xrpPayment, Sequence: 0, TicketSequence: 55 })
    expect(j.ok).toBe(true)
    if (!j.ok) return
    expect(j.rows.find((r) => r.name === 'TicketSequence')?.cautions).toEqual([W.RISKY.ticket])
  })

  it('flags that cannot be undone: asfNoFreeze, asfAllowTrustLineClawback, tfSetfAuth', () => {
    const nf = judge({ TransactionType: 'AccountSet', ...base, SetFlag: AccountSetAsfFlags.asfNoFreeze })
    expect(nf.ok && nf.rows.find((r) => r.name === 'SetFlag')?.cautions).toEqual(['asfNoFreeze. You cannot undo this.'])
    const cb = judge({ TransactionType: 'AccountSet', ...base, SetFlag: AccountSetAsfFlags.asfAllowTrustLineClawback })
    expect(cb.ok && cb.rows.find((r) => r.name === 'SetFlag')?.cautions).toEqual(['asfAllowTrustLineClawback. You cannot undo this.'])
    const auth = judge({ ...trustSet, Flags: TrustSetFlags.tfSetfAuth | TrustSetFlags.tfSetNoRipple })
    expect(auth.ok && auth.rows.find((r) => r.name === 'Flags')?.cautions).toEqual(['tfSetfAuth. You cannot undo this.'])
    // Clearing a flag is not a caution.
    const clear = judge({ TransactionType: 'AccountSet', ...base, ClearFlag: AccountSetAsfFlags.asfNoFreeze })
    expect(clear.ok && clear.rows.every((r) => r.cautions.length === 0)).toBe(true)
  })
})

describe('judgeUnsigned refuses in P-17 words (OS-FR-18)', () => {
  it.each([
    ['another Network', () => judge(xrpPayment, 'mainnet'), fill(W.DATA_REFUSAL.network, 'Mainnet', 'Testnet')],
    ['an Account it does not sign for', () => judge({ ...xrpPayment, Account: DEST, Destination: ACCOUNT }), fill(W.DATA_REFUSAL.account, DEST, ACCOUNT)],
    ['a SigningPubKey', () => judge({ ...xrpPayment, SigningPubKey: '' }), W.SIGN_REFUSAL.presigned],
    ['a TxnSignature', () => judge({ ...xrpPayment, TxnSignature: 'AB' }), W.SIGN_REFUSAL.presigned],
    ['Signers', () => judge({ ...xrpPayment, Signers: [] }), W.SIGN_REFUSAL.presigned],
    ['a Fee over the cap', () => judge({ ...xrpPayment, Fee: '10001' }), W.DATA_REFUSAL.fee],
    ['no Fee', () => judge({ ...xrpPayment, Fee: undefined }), W.DATA_REFUSAL.malformed],
    ['a partial payment', () => judge({ ...xrpPayment, Flags: PaymentFlags.tfPartialPayment }), W.SIGN_REFUSAL.partialPayment],
    ['an unknown type', () => judge({ TransactionType: 'OfferCreate', ...base, TakerGets: '1', TakerPays: '1' }), fill(W.SIGN_REFUSAL.cannotShow, 'OfferCreate')],
    ['a field it cannot show', () => judge({ TransactionType: 'AccountSet', ...base, Domain: '6578' }), fill(W.SIGN_REFUSAL.cannotShow, 'Domain')],
    ['NetworkID (Mainnet, Testnet and Devnet carry none)', () => judge({ ...xrpPayment, NetworkID: 1 }), fill(W.SIGN_REFUSAL.cannotShow, 'NetworkID')],
    ['a flag bit with no name here', () => judge({ ...xrpPayment, Flags: 0x00000001 }), fill(W.SIGN_REFUSAL.cannotShow, 'Flags')],
    ['an MPT amount', () => judge({ ...xrpPayment, Amount: { mpt_issuance_id: '00'.repeat(24), value: '1' } }), fill(W.SIGN_REFUSAL.cannotShow, 'Amount')],
    ['a memo that is not text', () => judge({ ...xrpPayment, Memos: [{ Memo: { MemoData: 'FF' } }] }), fill(W.SIGN_REFUSAL.cannotShow, 'Memos')],
    ['a memo with a new line', () => judge({ ...xrpPayment, Memos: [{ Memo: { MemoData: hex('rent\nAmount: 1 XRP') } }] }), fill(W.SIGN_REFUSAL.cannotShow, 'Memos')],
    ['a memo with a bidi override', () => judge({ ...xrpPayment, Memos: [{ Memo: { MemoData: hex('abc\u202Edef') } }] }), fill(W.SIGN_REFUSAL.cannotShow, 'Memos')],
    ['a memo with a zero-width character', () => judge({ ...xrpPayment, Memos: [{ Memo: { MemoType: hex('a\u200Bb') } }] }), fill(W.SIGN_REFUSAL.cannotShow, 'Memos')],
    ['a memo with a control character', () => judge({ ...xrpPayment, Memos: [{ Memo: { MemoFormat: hex('a\u0007') } }] }), fill(W.SIGN_REFUSAL.cannotShow, 'Memos')],
    ['DeliverMin (valid only with a partial payment)', () => judge({ ...xrpPayment, DeliverMin: '1000000' }), fill(W.SIGN_REFUSAL.cannotShow, 'DeliverMin')],
    ['Delegate (signed by the delegate key, never this Wallet)', () => judge({ ...xrpPayment, Delegate: DEST }), fill(W.SIGN_REFUSAL.cannotShow, 'Delegate')],
    ['an AccountSet flag with no name', () => judge({ TransactionType: 'AccountSet', ...base, SetFlag: 11 }), fill(W.SIGN_REFUSAL.cannotShow, 'SetFlag')],
    ['no Sequence', () => judge({ ...xrpPayment, Sequence: undefined }), W.DATA_REFUSAL.malformed],
    ['Sequence 0 without a Ticket', () => judge({ ...xrpPayment, Sequence: 0 }), W.DATA_REFUSAL.malformed],
    ['no LastLedgerSequence', () => judge({ ...xrpPayment, LastLedgerSequence: undefined }), W.DATA_REFUSAL.malformed],
    ['a LastLedgerSequence at the envelope index', () => judge({ ...xrpPayment, LastLedgerSequence: LEDGER }), W.DATA_REFUSAL.malformed],
    ['an amount the codec reads differently (100.00 → 100)', () => judge({ ...tokenPayment, Amount: { currency: 'USD', issuer: ISSUER, value: '100.00' } }), W.DATA_REFUSAL.malformed],
  ])('%s', (_name, run, reason) => {
    expect(reasonOf(run())).toBe(reason)
  })

  it('an envelope with no ledger index (two-device signing\'s code) is malformed', () => {
    const twoDevice = encodeSinglePart({ type: 'xrplbench-unsigned', cbor: encodeBytes(new TextEncoder().encode(JSON.stringify({ v: 1, network_id: 1, tx: xrpPayment }))) })
    expect(reasonOf(judgeUnsigned(twoDevice, wallet))).toBe(W.DATA_REFUSAL.malformed)
  })

  it('a code of another kind names both kinds (P-36)', () => {
    const signed = encodeSigned({ network: 'testnet', txBlob: 'AB' }).text
    expect(reasonOf(judgeUnsigned(signed, wallet))).toBe('This code is a signed transaction. This screen needs a unsigned transaction.')
    const request = encodeRequest({ network: 'testnet', requestId: '0'.repeat(32), buildHash: '0'.repeat(64), account: ACCOUNT, tx: { TransactionType: 'SetRegularKey', Account: ACCOUNT } }).text
    expect(reasonOf(judgeUnsigned(request, wallet))).toBe('This code is a data-to-sign request. This screen needs a unsigned transaction.')
  })

  it('a code it cannot read is malformed', () => {
    expect(reasonOf(judgeUnsigned('hello', wallet))).toBe(W.DATA_REFUSAL.malformed)
  })
})
