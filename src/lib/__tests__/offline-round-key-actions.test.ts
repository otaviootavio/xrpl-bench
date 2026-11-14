import { describe, expect, it } from 'vitest'
import { AccountSetAsfFlags, encode, TrustSetFlags } from 'xrpl'
import { encodeBytes } from '@/lib/ur/cbor'
import { encodeSinglePart } from '@/lib/ur/ur'
import { ASF_DISABLE_MASTER, decodeDataToSign, decodeRequest, encodeDataToSign, PAYLOAD_UR_TYPES, TF_SET_NO_RIPPLE } from '../qr-codec'
import {
  assembleTransaction,
  buildHashOf,
  builtTransaction,
  canonicalLimit,
  isKeyChange,
  judgeDataToSign,
  replacesRegularKey,
  requestText,
  type OfflineBuild,
} from '../offline-round'
import { DATA_REFUSAL } from '../offline-round-words'
import { fieldValue } from '../tx-fields'
import { addressOfScan } from '../address-of-scan'

/**
 * Story 8 (OS-FR-13 to OS-FR-16, OS-FR-21): the Offline-builds route for trust lines,
 * Regular Key and master key actions. The codec carries each type as an exact key set;
 * the Data to Sign of a key change carries the key state for display only; the Build
 * hash covers every type's signed content and leaves a Payment's as it was.
 */
const ACCOUNT = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const OTHER = 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv'
const requestId = 'a'.repeat(32)
const wallet = { network: 'testnet' as const, address: ACCOUNT }

const trust: OfflineBuild = { type: 'trust-line', account: ACCOUNT, currency: 'USD', issuer: DEST, limit: '100' }
const setKey: OfflineBuild = { type: 'regular-key', account: ACCOUNT, regularKey: OTHER }
const removeKey: OfflineBuild = { type: 'regular-key', account: ACCOUNT, regularKey: null }
const off: OfflineBuild = { type: 'master-key', account: ACCOUNT, enable: false }
const on: OfflineBuild = { type: 'master-key', account: ACCOUNT, enable: true }

const raw = (type: string, body: unknown) => encodeSinglePart({ type, cbor: encodeBytes(new TextEncoder().encode(JSON.stringify(body))) })
const requestBody = (tx: Record<string, unknown>) => ({ v: 1, network_id: 1, request_id: requestId, build_hash: 'b'.repeat(64), account: ACCOUNT, tx })
const dataBody = (b: OfflineBuild, over: Record<string, unknown> = {}) => ({
  v: 1, network_id: 1, request_id: requestId, build_hash: buildHashOf(b), sequence: 10, fee: '12', ledger_index: 500, ...over,
})
const dataText = (b: OfflineBuild, over: Record<string, unknown> = {}) => raw(PAYLOAD_UR_TYPES.d, dataBody(b, over))
const KNOWN = { regular_key: DEST, master_key: 'on', signer_list: null }

describe('the request carries each new type as an exact key set (OS-FR-14)', () => {
  it.each([
    ['a TrustSet', trust, { TransactionType: 'TrustSet', Account: ACCOUNT, LimitAmount: { currency: 'USD', issuer: DEST, value: '100' }, Flags: TF_SET_NO_RIPPLE }],
    ['a SetRegularKey', setKey, { TransactionType: 'SetRegularKey', Account: ACCOUNT, RegularKey: OTHER }],
    ['a SetRegularKey that removes', removeKey, { TransactionType: 'SetRegularKey', Account: ACCOUNT }],
    ['master key off', off, { TransactionType: 'AccountSet', Account: ACCOUNT, SetFlag: ASF_DISABLE_MASTER }],
    ['master key on', on, { TransactionType: 'AccountSet', Account: ACCOUNT, ClearFlag: ASF_DISABLE_MASTER }],
  ])('round-trips %s', (_n, build, tx) => {
    const decoded = decodeRequest(requestText('testnet', build, requestId))
    expect(decoded.ok && decoded.value.tx).toEqual(tx)
    expect(decoded.ok && decoded.value.build_hash).toBe(buildHashOf(build))
    // What travels encodes: xrpl.js can serialise every Built transaction.
    expect(() => encode({ ...builtTransaction(build), Sequence: 1, Fee: '12' } as never)).not.toThrow()
  })

  it('the flag values are the ledger\'s own', () => {
    expect(TF_SET_NO_RIPPLE).toBe(TrustSetFlags.tfSetNoRipple)
    expect(ASF_DISABLE_MASTER).toBe(AccountSetAsfFlags.asfDisableMaster)
  })

  it.each([
    ['a TrustSet with no Flags', { TransactionType: 'TrustSet', Account: ACCOUNT, LimitAmount: { currency: 'USD', issuer: DEST, value: '1' } }],
    ['a TrustSet with another flag', { TransactionType: 'TrustSet', Account: ACCOUNT, LimitAmount: { currency: 'USD', issuer: DEST, value: '1' }, Flags: TrustSetFlags.tfSetfAuth }],
    ['a TrustSet in XRP', { TransactionType: 'TrustSet', Account: ACCOUNT, LimitAmount: { currency: 'XRP', issuer: DEST, value: '1' }, Flags: TF_SET_NO_RIPPLE }],
    ['a TrustSet in 40 hex starting with 00 (standard form)', { TransactionType: 'TrustSet', Account: ACCOUNT, LimitAmount: { currency: '0000000000000000000000005553440000000000', issuer: DEST, value: '1' }, Flags: TF_SET_NO_RIPPLE }],
    ['a TrustSet in the all-zero code (XRP)', { TransactionType: 'TrustSet', Account: ACCOUNT, LimitAmount: { currency: '0'.repeat(40), issuer: DEST, value: '1' }, Flags: TF_SET_NO_RIPPLE }],
    ['a TrustSet with a non-canonical limit', { TransactionType: 'TrustSet', Account: ACCOUNT, LimitAmount: { currency: 'USD', issuer: DEST, value: '01' }, Flags: TF_SET_NO_RIPPLE }],
    ['a TrustSet with a trailing zero', { TransactionType: 'TrustSet', Account: ACCOUNT, LimitAmount: { currency: 'USD', issuer: DEST, value: '1.50' }, Flags: TF_SET_NO_RIPPLE }],
    ['a TrustSet with an extra amount key', { TransactionType: 'TrustSet', Account: ACCOUNT, LimitAmount: { currency: 'USD', issuer: DEST, value: '1', x: 1 }, Flags: TF_SET_NO_RIPPLE }],
    ['a TrustSet with QualityIn', { TransactionType: 'TrustSet', Account: ACCOUNT, LimitAmount: { currency: 'USD', issuer: DEST, value: '1' }, Flags: TF_SET_NO_RIPPLE, QualityIn: 1 }],
    ['a SetRegularKey with a bad address', { TransactionType: 'SetRegularKey', Account: ACCOUNT, RegularKey: 'rBAD' }],
    ['a SetRegularKey with an extra key', { TransactionType: 'SetRegularKey', Account: ACCOUNT, RegularKey: OTHER, Fee: '12' }],
    ['an AccountSet with both flags', { TransactionType: 'AccountSet', Account: ACCOUNT, SetFlag: 4, ClearFlag: 4 }],
    ['an AccountSet with another flag', { TransactionType: 'AccountSet', Account: ACCOUNT, SetFlag: 3 }],
    ['an AccountSet with no flag', { TransactionType: 'AccountSet', Account: ACCOUNT }],
    ['an AccountSet that also sets a domain', { TransactionType: 'AccountSet', Account: ACCOUNT, SetFlag: 4, Domain: 'AB' }],
    ['a type the route does not build', { TransactionType: 'OfferCreate', Account: ACCOUNT }],
    ['a key change for another Account', { TransactionType: 'SetRegularKey', Account: DEST }],
  ])('refuses %s as malformed', (_n, tx) => {
    expect(decodeRequest(raw(PAYLOAD_UR_TYPES.r, requestBody(tx)))).toMatchObject({ ok: false, kind: 'malformed' })
  })
})

describe('Data to Sign may carry a key state, for display only (route-checks "What travels by QR")', () => {
  it('round-trips a known and an unknown key state', () => {
    const known = encodeDataToSign({ network: 'testnet', requestId, buildHash: buildHashOf(setKey), sequence: 10, fee: '12', ledgerIndex: 500, keyState: { regular_key: DEST, master_key: 'on', signer_list: null } }).text
    expect(decodeDataToSign(known)).toMatchObject({ ok: true, value: { key_state: { regular_key: DEST, master_key: 'on', signer_list: null } } })
    expect(decodeDataToSign(dataText(setKey, { key_state: 'unknown' }))).toMatchObject({ ok: true, value: { key_state: 'unknown' } })
    expect(decodeDataToSign(dataText(setKey, { key_state: { regular_key: null, master_key: 'off', signer_list: null } }))).toMatchObject({ ok: true })
    expect(decodeDataToSign(dataText(setKey, { key_state: { ...KNOWN, signer_list: { signers: 3, quorum: 2 } } }))).toMatchObject({ ok: true, value: { key_state: { signer_list: { signers: 3, quorum: 2 } } } })
    expect(decodeDataToSign(dataText(setKey, { key_state: { ...KNOWN, signer_list: 'unknown' } }))).toMatchObject({ ok: true, value: { key_state: { signer_list: 'unknown' } } })
  })

  it.each([
    ['an extra key', { ...KNOWN, x: 1 }],
    ['a signer list that is not one', { ...KNOWN, signer_list: true }],
    ['a signer list of no signers', { ...KNOWN, signer_list: { signers: 0, quorum: 1 } }],
    ['a signer list of 33 signers', { ...KNOWN, signer_list: { signers: 33, quorum: 1 } }],
    ['a quorum of 0', { ...KNOWN, signer_list: { signers: 2, quorum: 0 } }],
    ['a signer list with an extra key', { ...KNOWN, signer_list: { signers: 2, quorum: 1, x: 1 } }],
    ['no signer list key', { regular_key: DEST, master_key: 'on' }],
    ['a missing key', { regular_key: DEST }],
    ['a bad address', { regular_key: 'rBAD', master_key: 'on', signer_list: null }],
    ['a master key word it does not know', { regular_key: null, master_key: 'maybe' }],
    ['another string', 'safe'],
    ['null', null],
  ])('a key state with %s is malformed', (_n, keyState) => {
    expect(decodeDataToSign(dataText(setKey, { key_state: keyState }))).toMatchObject({ ok: false, kind: 'malformed' })
  })
})

describe('the Offline Wallet judges a key state by its kept Build (OS-FR-16)', () => {
  const keptOf = (b: OfflineBuild) => ({ requestId, buildHash: buildHashOf(b) })
  it('a key change needs one; a payment or a trust line has none: any other is malformed (P-17)', () => {
    for (const b of [setKey, removeKey, off, on]) {
      expect(isKeyChange(b)).toBe(true)
      expect(judgeDataToSign(dataText(b, { key_state: KNOWN }), wallet, keptOf(b), b).ok).toBe(true)
      expect(judgeDataToSign(dataText(b, { key_state: 'unknown' }), wallet, keptOf(b), b).ok).toBe(true)
      expect(judgeDataToSign(dataText(b), wallet, keptOf(b), b)).toEqual({ ok: false, reason: DATA_REFUSAL.malformed })
    }
    expect(judgeDataToSign(dataText(trust), wallet, keptOf(trust), trust).ok).toBe(true)
    expect(judgeDataToSign(dataText(trust, { key_state: KNOWN }), wallet, keptOf(trust), trust)).toEqual({ ok: false, reason: DATA_REFUSAL.malformed })
  })

  it('after a lock (no kept Build) it is the request refusal, key state or not', () => {
    expect(judgeDataToSign(dataText(setKey, { key_state: KNOWN }), wallet, null, null)).toEqual({ ok: false, reason: DATA_REFUSAL.request })
  })

  it('the key state never changes the assembled transaction', () => {
    const plain = assembleTransaction(setKey, { sequence: 10, fee: '12', ledger_index: 500 })
    const judged = judgeDataToSign(dataText(setKey, { key_state: { regular_key: DEST, master_key: 'off', signer_list: null } }), wallet, keptOf(setKey), setKey)
    expect(judged.ok && assembleTransaction(setKey, judged.data)).toEqual(plain)
    expect(plain).toEqual({ TransactionType: 'SetRegularKey', Account: ACCOUNT, RegularKey: OTHER, Sequence: 10, Fee: '12', LastLedgerSequence: 650 })
  })
})

describe('W5 applies only when a set Regular Key is replaced (EXPERIENCE W5)', () => {
  it.each([
    [OTHER, { regular_key: DEST, master_key: 'on', signer_list: null }, true],
    [OTHER, { regular_key: OTHER, master_key: 'on', signer_list: null }, false],
    [OTHER, { regular_key: null, master_key: 'on', signer_list: null }, false],
    [OTHER, 'unknown', false],
    [OTHER, undefined, false],
    [null, { regular_key: DEST, master_key: 'on', signer_list: null }, false],
  ] as const)('new %s, state %j: %s', (newKey, state, expected) => {
    expect(replacesRegularKey(newKey, state as never)).toBe(expected)
  })
})

describe('the Build hash covers every type (OS-FR-16, story 8)', () => {
  it('a Payment\'s hash is unchanged from story 6: records signed before still match', () => {
    const payment: OfflineBuild = { type: 'payment', account: ACCOUNT, destination: DEST, amountDrops: '2000000', destinationTag: 7 }
    expect(buildHashOf(payment)).toBe('b19a71719739e1a8686cf325a9b864ec9a0285c175d554b67a8cf198ed6064a3')
  })

  it('every signed field changes the hash; the Account (one Wallet\'s list) does not', () => {
    const hashes = new Set(
      [
        trust,
        { ...trust, currency: 'EUR' },
        { ...trust, issuer: OTHER },
        { ...trust, limit: '101' },
        { ...trust, limit: '0' },
        setKey,
        { ...setKey, regularKey: DEST },
        removeKey,
        off,
        on,
      ].map((b) => buildHashOf(b as OfflineBuild)),
    )
    expect(hashes.size).toBe(10)
    expect(buildHashOf({ ...trust, account: OTHER })).toBe(buildHashOf(trust))
  })

  it('no two types share content: a TrustSet never matches a Payment', () => {
    const payment: OfflineBuild = { type: 'payment', account: ACCOUNT, destination: DEST, amountDrops: '100' }
    expect(buildHashOf(payment)).not.toBe(buildHashOf(trust))
  })
})

describe('a trust-line limit has one canonical form (string operations only)', () => {
  it.each([
    ['100', '100'],
    ['0100.500', '100.5'],
    ['1.', '1'],
    ['.5', '0.5'],
    ['0', '0'],
    ['0.000', '0'],
    ['1000000000000000000000', '1000000000000000000000'],
    ['123456789012345', '123456789012345'],
  ])('%s is %s', (typed, canonical) => {
    expect(canonicalLimit(typed)).toBe(canonical)
  })
  it.each(['', '.', 'abc', '-1', '1e5', '1,5', '1234567890123456', '0.1234567890123456'])('%j is not a limit', (typed) => {
    expect(canonicalLimit(typed)).toBeNull()
  })
  it('the same limit typed two ways is one Build hash', () => {
    expect(buildHashOf({ ...trust, limit: canonicalLimit('100.00')! })).toBe(buildHashOf(trust))
  })
})

describe('flags read by the ledger\'s own names (EXPERIENCE "Signing review")', () => {
  it('names the flags this route signs, and leaves a bit with no name as a number', () => {
    expect(fieldValue('Flags', TrustSetFlags.tfSetNoRipple, 'TrustSet')).toBe('tfSetNoRipple')
    expect(fieldValue('SetFlag', 4, 'AccountSet')).toBe('asfDisableMaster')
    expect(fieldValue('ClearFlag', 4, 'AccountSet')).toBe('asfDisableMaster')
    expect(fieldValue('Flags', 0, 'Payment')).toBe('0')
    expect(fieldValue('Flags', 0x40000000, 'TrustSet')).toBe(String(0x40000000))
    expect(fieldValue('LimitAmount', { currency: 'USD', issuer: DEST, value: '100' }, 'TrustSet')).toBe(`100 USD ${DEST}`)
  })
})

describe('a scanned address (P-57 "Scan an address with the camera")', () => {
  it('takes a plain address or the app\'s receive form, and nothing else', () => {
    expect(addressOfScan(` ${DEST} `)).toBe(DEST)
    expect(addressOfScan(`ripple:${DEST}?dt=5`)).toBe(DEST)
    expect(addressOfScan('ur:xrplbench-request/abc')).toBeNull()
    expect(addressOfScan('rBAD')).toBeNull()
  })
})

describe('currency codes as typed (story 8 review round two)', () => {
  const hex = '0158415500000000C1F76FF6ECB0BAC600000000'
  it.each([
    ['usd', true],
    ['USD', true],
    ['XRP', false],
    [hex, true],
    [hex.toLowerCase(), true],
    ['0000000000000000000000005553440000000000', false],
    ['0'.repeat(40), false],
  ])('%s travels: %s', (currency, ok) => {
    const tx = { TransactionType: 'TrustSet', Account: ACCOUNT, LimitAmount: { currency, issuer: DEST, value: '1' }, Flags: TF_SET_NO_RIPPLE }
    expect(decodeRequest(raw(PAYLOAD_UR_TYPES.r, requestBody(tx))).ok).toBe(ok)
  })
  it('the Build hash keeps the case: "usd" and "USD" are two currencies', () => {
    expect(buildHashOf({ ...trust, currency: 'usd' })).not.toBe(buildHashOf(trust))
  })
  it('a review row shows a 40-hex code in full, never shortened or as the name it decodes to', () => {
    const usdHex = '5553440000000000000000000000000000000000'
    expect(fieldValue('LimitAmount', { currency: usdHex, issuer: DEST, value: '5' }, 'TrustSet')).toBe(`5 ${usdHex} ${DEST}`)
    expect(fieldValue('LimitAmount', { currency: hex, issuer: DEST, value: '5' }, 'TrustSet')).toBe(`5 ${hex} ${DEST}`)
  })
})
