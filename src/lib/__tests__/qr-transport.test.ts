import QRCode from 'qrcode'
import { describe, expect, it } from 'vitest'
import { Wallet, decode } from 'xrpl'
import { decodeSigned, decodeUnsigned, encodeSigned, encodeUnsigned } from '../qr-codec'
import { FRAME_INTERVAL_MS, FRAME_MAX_FRAGMENT_BYTES, STILL_MAX_MESSAGE_BYTES, planQr, qrVersionOf, type QrPlan } from '../qr-frames'
import { ScanSession, isPayloadText, quarterOf } from '../qr-scan-session'
import { encodeMinimal } from '../ur/bytewords'
import { encodeBytes } from '../ur/cbor'
import { FountainEncoder, encodePartCbor } from '../ur/fountain'
import { decodeSinglePart } from '../ur/ur'

/**
 * OS-FR-24: every payload moves as a UR with fountain codes, one still code when
 * it fits and an animated QR when it does not; the scanner joins the frames into
 * one payload and every check runs on that whole payload. Tested with the largest
 * transactions the app makes, signed by the real SDK (anti-patterns §11), and with
 * a transaction past anything it makes (a payment with a 1 KB memo and 6 x 8 paths).
 */

const master = Wallet.fromSeed('sEdTM1uX8pu2do5XvTnutH6HsouMaM2') // throwaway, never funded
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const ISSUER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const CUR = '0123456789ABCDEF0123456789ABCDEF01234567' // the widest currency code: 40 hex
// Every field at its widest: u32 at its maximum, the fee cap, a 40-hex currency.
const base = { Account: master.address, Sequence: 4294967295, Fee: '2000000', LastLedgerSequence: 4294967295, Flags: 2147483648 }
const amount = { currency: CUR, issuer: ISSUER, value: '-1.234567890123456e-80' }

const TXS = {
  payment: { TransactionType: 'Payment', ...base, Destination: DEST, Amount: '100000000000000000', DestinationTag: 4294967295 },
  issuedPayment: { TransactionType: 'Payment', ...base, Destination: DEST, Amount: amount, DestinationTag: 4294967295 },
  trustSet: { TransactionType: 'TrustSet', ...base, LimitAmount: amount },
  setRegularKey: { TransactionType: 'SetRegularKey', ...base, RegularKey: DEST },
  masterKeyOff: { TransactionType: 'AccountSet', ...base, SetFlag: 4 },
  // Past what the app builds today (story 9's Transmitter can bring any write): every AccountSet field set.
  accountSetFull: {
    TransactionType: 'AccountSet',
    ...base,
    SetFlag: 4,
    ClearFlag: 5,
    Domain: 'AB'.repeat(256),
    EmailHash: 'A'.repeat(32),
    MessageKey: '02' + 'A'.repeat(64),
    TransferRate: 2000000000,
    TickSize: 15,
    NFTokenMinter: DEST,
  },
  // The largest: a 1 KB memo (the ledger's memo limit) and 6 paths of 8 steps (the ledger's path limit).
  maxPayment: {
    TransactionType: 'Payment',
    ...base,
    Destination: DEST,
    Amount: amount,
    SendMax: amount,
    DestinationTag: 4294967295,
    SourceTag: 4294967295,
    InvoiceID: 'A'.repeat(64),
    Paths: Array.from({ length: 6 }, () => Array.from({ length: 8 }, () => ({ account: ISSUER, currency: CUR, issuer: ISSUER }))),
    Memos: [{ Memo: { MemoType: '74657874', MemoFormat: '74657874', MemoData: 'AB'.repeat(500) } }],
  },
} as const

/**
 * Measured frame counts (2026-11-09): `still` is one code (its QR version), `n x vV`
 * is an animated QR of n fragments at version V. Re-measured by this test.
 */
const EXPECTED: Record<keyof typeof TXS, { unsigned: string; signed: string }> = {
  payment: { unsigned: 'still v16', signed: 'still v19' },
  issuedPayment: { unsigned: 'still v19', signed: 'still v21' },
  trustSet: { unsigned: 'still v17', signed: 'still v19' },
  setRegularKey: { unsigned: 'still v15', signed: 'still v18' },
  masterKeyOff: { unsigned: 'still v13', signed: 'still v17' },
  accountSetFull: { unsigned: '4 x v15', signed: '5 x v14' },
  maxPayment: { unsigned: '36 x v15', signed: '31 x v15' },
}

const describePlan = (p: QrPlan) => (p.kind === 'still' ? `still v${qrVersionOf(p.text)}` : `${p.seqLen} x v${p.version}`)

/** Shows `plan` to a fresh scan session, dropping every frame `drop` says, from frame `start`. */
function scan(plan: QrPlan, { start = 0, drop = (_i: number): boolean => false }: { start?: number; drop?: (i: number) => boolean } = {}) {
  const session = new ScanSession()
  if (plan.kind === 'still') return { text: (session.receive(plan.text) as { text: string }).text, shown: 1 }
  for (let i = start; i < start + 2000; i++) {
    if (drop(i)) continue
    const step = session.receive(plan.frameAt(i))
    if (step.status === 'complete') return { text: step.text, shown: i - start + 1 }
    expect(step.status).toBe('progress')
  }
  throw new Error('never completed')
}

describe('largest transactions, as one still code or an animated QR (OS-FR-24)', () => {
  for (const [name, tx] of Object.entries(TXS) as [keyof typeof TXS, Record<string, unknown>][]) {
    it(`${name}: carried whole, signed blob decodes to the same transaction`, () => {
      const signed = master.sign(tx as never)
      const u = encodeUnsigned({ network: 'testnet', tx }).text
      const s = encodeSigned({ network: 'testnet', txBlob: signed.tx_blob }).text
      const pu = planQr(u)
      const ps = planQr(s)
      expect({ unsigned: describePlan(pu), signed: describePlan(ps) }).toEqual(EXPECTED[name])

      // Any first frame, every third frame missed: still one whole payload.
      const gotU = scan(pu, { start: 7, drop: (i) => i % 3 === 0 }).text
      const gotS = scan(ps, { start: 2, drop: (i) => i % 3 === 1 }).text
      expect(decodeUnsigned(gotU)).toEqual({ ok: true, value: { v: 1, network_id: 1, network: 'testnet', tx } })
      const dec = decodeSigned(gotS)
      expect(dec).toMatchObject({ ok: true, value: { network: 'testnet' } })
      // Byte for byte the blob the SDK signed, and the SDK's decode of it is that transaction.
      const blob = dec.ok ? dec.value.tx_blob : ''
      expect(blob).toBe(signed.tx_blob)
      const back = decode(blob)
      expect(back).toMatchObject({ TransactionType: tx.TransactionType, Account: master.address, Sequence: 4294967295, Fee: '2000000', LastLedgerSequence: 4294967295 })
      expect(back.TxnSignature).toBe(decode(signed.tx_blob).TxnSignature)
    })
  }

  it('the still bound keeps a still code at version 21 or less, and frames at version 15 or less', () => {
    const json = 'x'.repeat(STILL_MAX_MESSAGE_BYTES - 3) // a CBOR byte string header of 3 bytes
    const atBound = encodeUnsigned({ network: 'testnet', tx: {} }).text.replace(/\/.*/, '/') + encodeMinimal(encodeBytes(new TextEncoder().encode(json)))
    expect(decodeSinglePart(atBound).cbor.length).toBe(STILL_MAX_MESSAGE_BYTES)
    const still = planQr(atBound)
    expect(still.kind).toBe('still')
    expect(qrVersionOf(still.kind === 'still' ? still.text : '')).toBeLessThanOrEqual(21)
    const over = planQr(encodeSigned({ network: 'testnet', txBlob: 'AB'.repeat(5000) }).text)
    expect(over.kind === 'animated' && over.version).toBeLessThanOrEqual(15)
  })
})

describe('frames (OS-FR-24)', () => {
  const big = encodeSigned({ network: 'testnet', txBlob: master.sign(TXS.maxPayment as never).tx_blob }).text
  const plan = planQr(big) as Extract<QrPlan, { kind: 'animated' }>

  it('draws a UR in upper case so the QR is in alphanumeric mode; today\'s form is drawn as it is', () => {
    expect(plan.frameAt(0)).toBe(plan.frameAt(0).toUpperCase())
    const segments = QRCode.create(plan.frameAt(0), { errorCorrectionLevel: 'M' }).segments
    expect(segments.map((s) => s.mode.id)).toEqual(['Alphanumeric'])
    const legacy = 'xrplbench:1:s:eyJ2IjoxfQ'
    expect(planQr(legacy)).toEqual({ kind: 'still', text: legacy })
  })

  it('a frame is a function of its index; the stream runs on past seqLen and never loops back', () => {
    expect(plan.frameAt(5)).toBe(plan.frameAt(5))
    const seqNums = Array.from({ length: plan.seqLen * 3 }, (_, i) => Number(/\/(\d+)-/.exec(plan.frameAt(i))?.[1]))
    expect(seqNums).toEqual(Array.from({ length: plan.seqLen * 3 }, (_, i) => i + 1))
  })

  it('every frame fits the one pinned version, even at large sequence numbers', () => {
    for (const i of [0, 1, 22, 23, 254, 255, 65534, 65535, 9_999_999]) {
      expect(QRCode.create(plan.frameAt(i), { errorCorrectionLevel: 'M', version: plan.version }).version).toBe(plan.version)
    }
  })

  it('not more than three frames each second', () => {
    expect(1000 / FRAME_INTERVAL_MS).toBeLessThanOrEqual(3)
    expect(FRAME_MAX_FRAGMENT_BYTES).toBe(250)
  })
})

describe('scan session (OS-FR-24)', () => {
  const tx = TXS.maxPayment
  const text = encodeUnsigned({ network: 'testnet', tx }).text
  const plan = planQr(text) as Extract<QrPlan, { kind: 'animated' }>

  it('a still code and today\'s form are whole at once; other text is ignored', () => {
    const small = encodeSigned({ network: 'testnet', txBlob: 'AB' }).text
    const s = new ScanSession()
    expect(s.receive(small.toUpperCase())).toEqual({ status: 'complete', text: small })
    expect(s.receive('xrplbench:1:s:abc')).toEqual({ status: 'complete', text: 'xrplbench:1:s:abc' })
    expect(s.receive('https://example.com')).toEqual({ status: 'ignored' })
    expect(s.receive('ur:bytes/hdeymejtswhhylkepmykhhtsytsnoyoyaxaedsuttydmmhhpktpmsrjtgwdpfnsboxgwlbaawzuefywkdplrsrjynbvygabwjldapfcsdwkbrkch')).toEqual({
      status: 'ignored',
    })
    expect(isPayloadText('UR:XRPLBENCH-SIGNED/1-2/AB')).toBe(true)
  })

  it('progress rises with fragments recovered and stays under 100 until complete', () => {
    const s = new ScanSession()
    const percents: number[] = []
    for (let i = 0; i < plan.seqLen - 1; i++) {
      const step = s.receive(plan.frameAt(i))
      percents.push(step.status === 'progress' ? step.percent : -1)
    }
    expect(percents[0]).toBe(Math.floor(100 / plan.seqLen))
    expect(percents.every((p, i) => i === 0 || p >= percents[i - 1])).toBe(true)
    expect(Math.max(...percents)).toBeLessThan(100)
    const last = s.receive(plan.frameAt(plan.seqLen - 1))
    expect(last.status).toBe('complete')
    expect(s.collecting).toBe(false)
    expect([0, 24, 25, 49, 50, 99].map(quarterOf)).toEqual([0, 0, 25, 25, 50, 75])
  })

  it('a duplicate frame changes nothing', () => {
    const s = new ScanSession()
    expect(s.receive(plan.frameAt(0))).toEqual(s.receive(plan.frameAt(0)))
  })

  it('accepts nothing when the joined message fails its checksum, and starts over', () => {
    const message = decodeSinglePart(text).cbor
    const enc = new FountainEncoder(message, FRAME_MAX_FRAGMENT_BYTES)
    const s = new ScanSession()
    let last
    for (let i = 0; i < enc.seqLen; i++) {
      const part = enc.nextPart()
      if (i === 1) part.data[4] ^= 0x01 // valid per-frame Bytewords checksum, wrong message
      last = s.receive(`ur:xrplbench-unsigned/${part.seqNum}-${part.seqLen}/${encodeMinimal(encodePartCbor(part))}`)
    }
    expect(last).toEqual({ status: 'failed' })
    expect(s.collecting).toBe(false)
  })

  it('a frame of another payload starts over on it; a still code while collecting is whole at once', () => {
    const other = planQr(encodeSigned({ network: 'testnet', txBlob: master.sign(TXS.accountSetFull as never).tx_blob }).text) as Extract<QrPlan, { kind: 'animated' }>
    const s = new ScanSession()
    s.receive(plan.frameAt(0))
    s.receive(plan.frameAt(1))
    expect(s.receive(other.frameAt(0))).toEqual({ status: 'progress', percent: Math.floor(100 / other.seqLen) })
    const small = encodeSigned({ network: 'testnet', txBlob: 'AB' }).text
    expect(s.receive(small)).toEqual({ status: 'complete', text: small })
  })

  it('refuses a frame claiming a huge message without doing the work', () => {
    const s = new ScanSession()
    const huge = { seqNum: 9, seqLen: 4_294_967_295, messageLen: 4_294_967_295, checksum: 1, data: new Uint8Array(1) }
    expect(s.receive(`ur:xrplbench-signed/9-4294967295/${encodeMinimal(encodePartCbor(huge))}`)).toEqual({ status: 'ignored' })
  })
})
