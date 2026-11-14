import { describe, expect, it } from 'vitest'
import { AccountSetAsfFlags, PaymentFlags, TrustSetFlags, Wallet } from 'xrpl'
import { encodeRequest, encodeSigned, encodeUnsigned } from '@/lib/qr-codec'
import { judgeUnsigned, sameBuildHashOf, USUAL_WINDOW } from '@/lib/unsigned-judge'
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

describe('P-53: a caution under each risky row', () => {
  it('SendMax, Paths, Memos, Delegate', () => {
    const j = judge({
      ...tokenPayment,
      SendMax: '3000000',
      Paths: [[{ currency: 'XRP' }]],
      Memos: [{ Memo: { MemoData: hex('rent for may') } }],
      Delegate: DEST,
    })
    expect(j.ok).toBe(true)
    if (!j.ok) return
    const row = (n: string) => j.rows.find((r) => r.name === n)!
    expect(row('SendMax').cautions).toEqual([fill(W.RISKY.sendMax, '3 XRP')])
    expect(row('Paths').cautions).toEqual([W.RISKY.paths])
    expect(row('Memos').value).toBe('rent for may')
    expect(row('Memos').cautions).toEqual(['This transaction has a memo. All persons can read the memo on the ledger: rent for may.'])
    expect(row('Delegate').cautions).toEqual([fill(W.RISKY.delegate, ACCOUNT)])
  })

  it('DeliverMin and TicketSequence (Sequence 0)', () => {
    const j = judge({ ...xrpPayment, DeliverMin: '1000000', Sequence: 0, TicketSequence: 55 })
    expect(j.ok).toBe(true)
    if (!j.ok) return
    expect(j.rows.find((r) => r.name === 'DeliverMin')?.cautions).toEqual([fill(W.RISKY.deliverMin, '1 XRP')])
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
    const twoDevice = encodeUnsigned({ network: 'testnet', tx: xrpPayment }).text
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
