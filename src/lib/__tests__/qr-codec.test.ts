import { describe, expect, it } from 'vitest'
import { CODE_UNREADABLE, PAYLOAD_UR_TYPES, decodeSigned, decodeUnsignedForSigning, encodeSigned, encodeUnsigned, networkIdOf, payloadKindOf } from '../qr-codec'
import { encodeBytes } from '../ur/cbor'
import { encodeSinglePart } from '../ur/ur'

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const json = (o: unknown) => encodeBytes(new TextEncoder().encode(JSON.stringify(o)))
/** A payload UR of the given kind holding exactly `o`, for envelopes `encode*` never writes. */
const ur = (kind: keyof typeof PAYLOAD_UR_TYPES, o: unknown) => encodeSinglePart({ type: PAYLOAD_UR_TYPES[kind], cbor: json(o) })
const tx = { TransactionType: 'Payment', Account: 'rA', Destination: 'rB', Amount: '1000000', Sequence: 5, Fee: '12', LastLedgerSequence: 99 }
const UNKNOWN_VERSION = 'That code is from a version of XRPL Bench this one does not understand.'

describe('qr-codec', () => {
  it('round-trips an unsigned payload with the network id from NETWORKS and its ledger index', () => {
    for (const [network, id] of [['mainnet', 0], ['testnet', 1], ['devnet', 2]] as const) {
      expect(networkIdOf(network)).toBe(id)
      const enc = encodeUnsigned({ network, tx, ledgerIndex: 1000 })
      expect(enc.text.startsWith('ur:xrplbench-unsigned/')).toBe(true)
      expect(decodeUnsignedForSigning(enc.text)).toEqual({ ok: true, value: { v: 1, network_id: id, network, ledger_index: 1000, tx } })
    }
  })

  it('round-trips a signed payload', () => {
    const enc = encodeSigned({ network: 'testnet', txBlob: '12AB' })
    expect(enc.text.startsWith('ur:xrplbench-signed/')).toBe(true)
    expect(decodeSigned(enc.text)).toEqual({ ok: true, value: { v: 1, network_id: 1, network: 'testnet', tx_blob: '12AB' } })
  })

  it('a signed envelope names its Network; a code without a known one is refused (OS-FR-9)', () => {
    const main = encodeSigned({ network: 'mainnet', txBlob: 'AB' })
    expect(decodeSigned(main.text)).toMatchObject({ ok: true, value: { network: 'mainnet', network_id: 0 } })
    // No network_id: an older version, said so.
    expect(decodeSigned(ur('s', { v: 1, tx_blob: 'AB' }))).toEqual({ ok: false, kind: 'unknown-version', reason: UNKNOWN_VERSION })
    for (const id of [3, 1.5, '1', null, 1024]) {
      expect(decodeSigned(ur('s', { v: 1, network_id: id, tx_blob: 'AB' }))).toMatchObject({ ok: false, kind: 'bad-network' })
    }
  })

  it('carries non-ASCII text intact', () => {
    const enc = encodeUnsigned({ network: 'testnet', tx: { ...tx, Memo: 'é€' }, ledgerIndex: 7 })
    const dec = decodeUnsignedForSigning(enc.text)
    expect(dec.ok && dec.value.tx.Memo).toBe('é€')
  })

  it('rejects an unknown version in the body', () => {
    expect(decodeUnsignedForSigning(ur('u', { v: 2, network_id: 0, ledger_index: 1, tx }))).toMatchObject({ ok: false, kind: 'unknown-version' })
    expect(decodeSigned(ur('s', { v: 2, network_id: 0, tx_blob: 'AB' }))).toMatchObject({ ok: false, kind: 'unknown-version' })
  })

  it('rejects the wrong kind in both directions', () => {
    const u = encodeUnsigned({ network: 'testnet', tx, ledgerIndex: 1 })
    const s = encodeSigned({ network: 'testnet', txBlob: 'AB' })
    expect(decodeSigned(u.text)).toMatchObject({ ok: false, kind: 'wrong-kind' })
    expect(decodeUnsignedForSigning(s.text)).toMatchObject({ ok: false, kind: 'wrong-kind' })
  })

  it('rejects malformed text without throwing', () => {
    for (const bad of ['', 'hello', 'ur:xrplbench-unsigned/', null, 42, undefined]) {
      expect(decodeUnsignedForSigning(bad)).toMatchObject({ ok: false })
      expect(decodeSigned(bad)).toMatchObject({ ok: false })
    }
    expect(decodeUnsignedForSigning(ur('u', { v: 1, network_id: 0, ledger_index: 1 }))).toMatchObject({ ok: false, kind: 'malformed' })
    expect(decodeSigned(ur('s', { v: 1, network_id: 1, tx_blob: 'not hex' }))).toMatchObject({ ok: false, kind: 'malformed' })
    expect(decodeSigned(ur('s', { v: 1, network_id: 1, tx_blob: '' }))).toMatchObject({ ok: false, kind: 'malformed' })
  })

  it('two-device signing\'s unsigned envelope (no ledger index) is malformed', () => {
    expect(decodeUnsignedForSigning(ur('u', { v: 1, network_id: 1, tx }))).toMatchObject({ ok: false, kind: 'malformed' })
  })

  it('rejects a non-integer or unknown network_id', () => {
    for (const id of [3, -1, 1.5, '1', null, 1024]) {
      expect(decodeUnsignedForSigning(ur('u', { v: 1, network_id: id, ledger_index: 1, tx }))).toMatchObject({ ok: false, kind: 'bad-network' })
    }
  })

  it('refuses nothing for its size (OS-FR-24), only text past the decoder bound', () => {
    const big = encodeUnsigned({ network: 'testnet', tx: { ...tx, Memo: 'x'.repeat(10_000) }, ledgerIndex: 1 })
    expect(decodeUnsignedForSigning(big.text)).toMatchObject({ ok: true, value: { tx: { Memo: 'x'.repeat(10_000) } } })
    expect(decodeSigned(encodeSigned({ network: 'testnet', txBlob: 'AB'.repeat(5000) }).text)).toMatchObject({ ok: true })
    expect(decodeUnsignedForSigning('ur:xrplbench-unsigned/' + 'ae'.repeat(70_000))).toEqual({ ok: false, kind: 'malformed', reason: CODE_UNREADABLE })
  })

  it('an older build\'s single-code form (FR-78, retired by story 12) is answered as an unknown version, never read', () => {
    const older = [
      `xrplbench:1:u:${b64({ v: 1, network_id: 1, tx })}`,
      `xrplbench:1:s:${b64({ v: 1, network_id: 0, tx_blob: 'AB' })}`,
      `xrplbench:1:s:${b64({ v: 1, tx_blob: 'AB' })}`,
      `xrplbench:2:u:${b64({ v: 2, network_id: 0, tx })}`,
      'xrplbench:1:u:***',
    ]
    for (const text of older) {
      expect(decodeSigned(text)).toEqual({ ok: false, kind: 'unknown-version', reason: UNKNOWN_VERSION })
      expect(decodeUnsignedForSigning(text)).toEqual({ ok: false, kind: 'unknown-version', reason: UNKNOWN_VERSION })
      expect(payloadKindOf(text)).toBeNull()
    }
  })

  it('reads a UR whatever its case, and refuses a frame, a bad checksum, a foreign or unknown UR type', () => {
    const enc = encodeUnsigned({ network: 'testnet', tx, ledgerIndex: 1 })
    expect(decodeUnsignedForSigning(enc.text.toUpperCase())).toEqual(decodeUnsignedForSigning(enc.text))
    // One frame of an animated code is not a payload: the scanner joins frames first.
    expect(decodeUnsignedForSigning('ur:xrplbench-unsigned/1-3/lpadaxcfaxhlcyynvdtbhfhdcxaeaeaeae')).toMatchObject({ ok: false, kind: 'malformed', reason: CODE_UNREADABLE })
    const flipped = enc.text.slice(0, -1) + (enc.text.endsWith('a') ? 'e' : 'a')
    expect(decodeUnsignedForSigning(flipped)).toMatchObject({ ok: false, kind: 'malformed' })
    expect(decodeUnsignedForSigning(encodeSinglePart({ type: 'bytes', cbor: json({ v: 1, network_id: 1, ledger_index: 1, tx }) }))).toMatchObject({
      ok: false,
      reason: 'That is not an XRPL Bench signing code.',
    })
    // A kind a later build may write; `xrplbench-request` is a known kind since story 6.
    expect(decodeUnsignedForSigning(encodeSinglePart({ type: 'xrplbench-later', cbor: json({ v: 1 }) }))).toMatchObject({ ok: false, kind: 'unknown-version' })
    expect(decodeUnsignedForSigning(encodeSinglePart({ type: 'xrplbench-request', cbor: json({ v: 1 }) }))).toMatchObject({ ok: false, kind: 'wrong-kind' })
    // The message must be exactly one CBOR byte string.
    expect(decodeUnsignedForSigning(encodeSinglePart({ type: PAYLOAD_UR_TYPES.u, cbor: Uint8Array.from([0x01]) }))).toMatchObject({ ok: false, kind: 'malformed' })
  })

  it('ignores whitespace and line breaks inside a pasted payload', () => {
    const text = encodeUnsigned({ network: 'testnet', tx, ledgerIndex: 1 }).text
    const wrapped = `  ${text.slice(0, 20)}\n${text.slice(20, 40)} \r\n${text.slice(40)}\n`
    expect(decodeUnsignedForSigning(wrapped)).toEqual(decodeUnsignedForSigning(text))
    expect(decodeUnsignedForSigning(wrapped).ok).toBe(true)
  })
})
