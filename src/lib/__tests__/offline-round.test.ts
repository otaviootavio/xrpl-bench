import { beforeEach, describe, expect, it } from 'vitest'
import { encodeBytes } from '@/lib/ur/cbor'
import { encodeSinglePart } from '@/lib/ur/ur'
import {
  decodeDataToSign,
  decodeRequest,
  encodeDataToSign,
  encodeRequest,
  encodeSigned,
  encodeUnsigned,
  payloadKindOf,
  PAYLOAD_UR_TYPES,
} from '../qr-codec'
import { LEDGER_FLOORS, MAX_RECEIVED_LEDGER_INDEX } from '../offline-window'
import {
  assembleTransaction,
  buildHashOf,
  clearRound,
  eraseRoundsOfLocks,
  judgeDataToSign,
  ledgerJumpWarning,
  newRequestId,
  requestText,
  resetRounds,
  roundOf,
  setRound,
  type PaymentBuild,
} from '../offline-round'
import { DATA_REFUSAL } from '../offline-round-words'
import { MAX_FEE_DROPS } from '../xrpl/money'

const ACCOUNT = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const build: PaymentBuild = { type: 'payment', account: ACCOUNT, destination: DEST, amountDrops: '2000000', destinationTag: 7 }
const wallet = { network: 'testnet' as const, address: ACCOUNT }
const requestId = 'a'.repeat(32)
const kept = { requestId, buildHash: buildHashOf(build) }
const data = (over: Partial<Record<string, unknown>> = {}) => ({
  v: 1,
  network_id: 1,
  request_id: requestId,
  build_hash: kept.buildHash,
  sequence: 10,
  fee: '12',
  ledger_index: 500,
  ...over,
})
const raw = (type: string, body: unknown) => encodeSinglePart({ type, cbor: encodeBytes(new TextEncoder().encode(JSON.stringify(body))) })
const dataText = (over: Partial<Record<string, unknown>> = {}) => raw(PAYLOAD_UR_TYPES.d, data(over))

describe('codec: Data-to-Sign Request and Data to Sign (OS-FR-14, OS-FR-15, OS-FR-24)', () => {
  it('round-trips a request as a UR of its own kind', () => {
    const text = requestText('testnet', build, requestId)
    expect(text.startsWith('ur:xrplbench-request/')).toBe(true)
    const decoded = decodeRequest(text)
    expect(decoded).toMatchObject({ ok: true, value: { network: 'testnet', request_id: requestId, build_hash: kept.buildHash, account: ACCOUNT } })
    expect(decoded.ok && decoded.value.tx).toEqual({ TransactionType: 'Payment', Account: ACCOUNT, Destination: DEST, Amount: '2000000', DestinationTag: 7 })
  })

  it('a request with an extra field, or an Account other than its Signs-for Account, is malformed', () => {
    const body = { v: 1, network_id: 1, request_id: requestId, build_hash: kept.buildHash, account: ACCOUNT, tx: { TransactionType: 'Payment', Account: ACCOUNT, Destination: DEST, Amount: '1' } }
    expect(decodeRequest(raw(PAYLOAD_UR_TYPES.r, body)).ok).toBe(true)
    expect(decodeRequest(raw(PAYLOAD_UR_TYPES.r, { ...body, extra: 1 }))).toMatchObject({ ok: false, kind: 'malformed' })
    expect(decodeRequest(raw(PAYLOAD_UR_TYPES.r, { ...body, tx: { ...body.tx, Fee: '12' } }))).toMatchObject({ ok: false, kind: 'malformed' })
    expect(decodeRequest(raw(PAYLOAD_UR_TYPES.r, { ...body, tx: { ...body.tx, Account: DEST } }))).toMatchObject({ ok: false, kind: 'malformed' })
    expect(decodeRequest(raw(PAYLOAD_UR_TYPES.r, { ...body, tx: { ...body.tx, Amount: { value: '1' } } }))).toMatchObject({ ok: false, kind: 'malformed' })
  })

  it('Data to Sign is exactly its set: an extra or a missing value is malformed', () => {
    const text = encodeDataToSign({ network: 'testnet', requestId, buildHash: kept.buildHash, sequence: 10, fee: '12', ledgerIndex: 500 }).text
    expect(text.startsWith('ur:xrplbench-data-to-sign/')).toBe(true)
    expect(decodeDataToSign(text)).toMatchObject({ ok: true, value: { network: 'testnet', sequence: 10, fee: '12', ledger_index: 500 } })
    expect(decodeDataToSign(dataText({ key_state: {} }))).toMatchObject({ ok: false, kind: 'malformed' })
    const { fee: _fee, ...missing } = data()
    expect(decodeDataToSign(raw(PAYLOAD_UR_TYPES.d, missing))).toMatchObject({ ok: false, kind: 'malformed' })
    for (const bad of [{ sequence: 0 }, { sequence: 1.5 }, { fee: '012' }, { fee: 12 }, { ledger_index: -1 }, { request_id: 'X' }, { build_hash: 'ab' }]) {
      expect(decodeDataToSign(dataText(bad)), JSON.stringify(bad)).toMatchObject({ ok: false, kind: 'malformed' })
    }
    expect(decodeDataToSign(dataText({ network_id: 77 }))).toMatchObject({ ok: false, kind: 'bad-network' })
  })

  it('tells the four kinds apart without judging them', () => {
    expect(payloadKindOf(requestText('testnet', build, requestId))).toBe('r')
    expect(payloadKindOf(dataText())).toBe('d')
    expect(payloadKindOf(encodeUnsigned({ network: 'testnet', tx: {} }).text)).toBe('u')
    expect(payloadKindOf(encodeSigned({ network: 'testnet', txBlob: 'AB' }).text)).toBe('s')
    expect(payloadKindOf('xrplbench:1:s:e30')).toBe('s')
    expect(payloadKindOf('hello')).toBeNull()
    expect(payloadKindOf(raw('xrplbench-later', {}))).toBeNull()
  })
})

describe('Build hash and request ID (OS-FR-14, OS-FR-16)', () => {
  it('the same Build content has the same hash; any field of the Same Build content changes it', () => {
    expect(buildHashOf({ ...build })).toBe(kept.buildHash)
    expect(kept.buildHash).toMatch(/^[0-9a-f]{64}$/)
    expect(buildHashOf({ ...build, destinationTag: 8 })).not.toBe(kept.buildHash)
    expect(buildHashOf({ ...build, destinationTag: undefined })).not.toBe(kept.buildHash)
    expect(buildHashOf({ ...build, amountDrops: '2000001' })).not.toBe(kept.buildHash)
    expect(buildHashOf({ ...build, destination: ACCOUNT })).not.toBe(kept.buildHash)
  })

  it('a request ID is new every time', () => {
    const a = newRequestId()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(newRequestId()).not.toBe(a)
  })
})

describe('the Offline Wallet judges a Data to Sign (OS-FR-16, P-17)', () => {
  it('accepts the exact set for the kept request', () => {
    expect(judgeDataToSign(dataText(), wallet, kept, build)).toMatchObject({ ok: true, data: { sequence: 10, fee: '12', ledger_index: 500 } })
  })
  it.each([
    ['an extra value', dataText({ extra: true }), DATA_REFUSAL.malformed],
    ['a missing value', raw(PAYLOAD_UR_TYPES.d, { ...data(), sequence: undefined }), DATA_REFUSAL.malformed],
    ['another kind of code (P-36)', requestText('testnet', build, requestId), 'This code is a data-to-sign request. This screen needs a data to sign.'],
    ['a signed code (P-36)', encodeSigned({ network: 'testnet', txBlob: 'AB' }).text, 'This code is a signed transaction. This screen needs a data to sign.'],
    ['a ledger index whose window passes UInt32', dataText({ ledger_index: 4294967295 - 149 }), DATA_REFUSAL.malformed],
    ['another Network', dataText({ network_id: 0 }), 'This transaction is for Mainnet. This wallet is for Testnet.'],
    ['another request ID', dataText({ request_id: 'b'.repeat(32) }), DATA_REFUSAL.request],
    ['another Build hash', dataText({ build_hash: 'c'.repeat(64) }), DATA_REFUSAL.request],
    ['a Fee over the cap', dataText({ fee: (BigInt(MAX_FEE_DROPS) + 1n).toString() }), DATA_REFUSAL.fee],
  ])('refuses %s', (_name, text, reason) => {
    expect(judgeDataToSign(text, wallet, kept, build)).toEqual({ ok: false, reason })
  })
  it('refuses any answer after a lock: no kept request is left to match', () => {
    expect(judgeDataToSign(dataText(), wallet, null, null)).toEqual({ ok: false, reason: DATA_REFUSAL.request })
  })
  it('refuses a Build whose Account is not the one this Wallet signs for', () => {
    const other = { ...build, account: DEST }
    const keptOther = { requestId, buildHash: buildHashOf(other) }
    expect(judgeDataToSign(dataText({ build_hash: keptOther.buildHash }), wallet, keptOther, other)).toEqual({
      ok: false,
      reason: `This transaction is for ${DEST}. This wallet signs for ${ACCOUNT}.`,
    })
  })
})

describe('highest-seen ledger warning (P-14)', () => {
  const seen = { index: 1000, at: 0 }
  it('warns on an index lower than the highest seen', () => expect(ledgerJumpWarning(999, seen, 60_000, 'testnet')).toBe('lower'))
  it('allows elapsed / 3 s plus 30 ledgers above it', () => {
    expect(ledgerJumpWarning(1000 + 20 + 30, seen, 60_000, 'testnet')).toBeNull()
    expect(ledgerJumpWarning(1000 + 20 + 31, seen, 60_000, 'testnet')).toBe('too-high')
    // An hour later, a jump of an hour of ledgers at ~4 s is no warning.
    expect(ledgerJumpWarning(1000 + 900, seen, 3_600_000, 'testnet')).toBeNull()
  })
  it('before any index was seen, the Network\'s build-time floor is the reference (story 6 review)', () => {
    const floor = LEDGER_FLOORS.mainnet
    const hourLater = floor.at + 3_600_000
    expect(ledgerJumpWarning(floor.index + 1000, null, hourLater, 'mainnet')).toBeNull()
    expect(ledgerJumpWarning(floor.index - 1, null, hourLater, 'mainnet')).toBe('lower')
    // A first answer that would make a blob valid for years is warned.
    expect(ledgerJumpWarning(floor.index + 10_000_000, null, hourLater, 'mainnet')).toBe('too-high')
    expect(ledgerJumpWarning(LEDGER_FLOORS.testnet.index + 5, null, LEDGER_FLOORS.testnet.at, 'testnet')).toBeNull()
  })
})

describe('the assembled window is a UInt32 (story 6 review)', () => {
  it('refuses to assemble past the bound, and assembles at it', () => {
    expect(() => assembleTransaction(build, { sequence: 1, fee: '12', ledger_index: MAX_RECEIVED_LEDGER_INDEX + 1 })).toThrow(RangeError)
    expect(assembleTransaction(build, { sequence: 1, fee: '12', ledger_index: MAX_RECEIVED_LEDGER_INDEX }).LastLedgerSequence).toBe(4294967295)
  })
  it('the codec refuses the same index, and a checksum-bad address', () => {
    expect(decodeDataToSign(dataText({ ledger_index: MAX_RECEIVED_LEDGER_INDEX + 1 }))).toMatchObject({ ok: false, kind: 'malformed' })
    expect(decodeDataToSign(dataText({ ledger_index: MAX_RECEIVED_LEDGER_INDEX })).ok).toBe(true)
    const badChecksum = ACCOUNT.slice(0, -1) + (ACCOUNT.endsWith('L') ? 'M' : 'L')
    const body = { v: 1, network_id: 1, request_id: requestId, build_hash: kept.buildHash, account: badChecksum, tx: { TransactionType: 'Payment', Account: badChecksum, Destination: DEST, Amount: '1' } }
    expect(decodeRequest(raw(PAYLOAD_UR_TYPES.r, body))).toMatchObject({ ok: false, kind: 'malformed' })
  })
})

describe('the kept round lives in memory and a lock erases it (OS-FR-13, OS-FR-16)', () => {
  beforeEach(() => resetRounds())
  it('erases the rounds of the closed lock only', () => {
    setRound('w1', { lockId: 'L1', build, phase: { name: 'request', requestId } })
    setRound('w2', { lockId: 'L2', build, phase: { name: 'reviewed' } })
    eraseRoundsOfLocks(['L1'])
    expect(roundOf('w1')).toBeNull()
    expect(roundOf('w2')).not.toBeNull()
    clearRound('w2')
    expect(roundOf('w2')).toBeNull()
  })
})

// The request names the Network and the Signs-for Account (route-checks "What travels by QR").
it('encodeRequest carries exactly Signs-for Account, Built transaction, request ID, Build hash, Network', () => {
  const text = encodeRequest({ network: 'devnet', requestId, buildHash: kept.buildHash, account: ACCOUNT, tx: { TransactionType: 'Payment', Account: ACCOUNT, Destination: DEST, Amount: '1' } }).text
  const decoded = decodeRequest(text)
  expect(decoded.ok && Object.keys(decoded.value).sort()).toEqual(['account', 'build_hash', 'network', 'network_id', 'request_id', 'tx', 'v'])
  expect(decoded.ok && decoded.value.network).toBe('devnet')
})
