import { describe, expect, it } from 'vitest'
import { CODE_UNREADABLE, PAYLOAD_UR_TYPES, decodeSigned, decodeUnsigned, encodeSigned, encodeUnsigned, networkIdOf } from '../qr-codec'
import { encodeBytes } from '../ur/cbor'
import { encodeSinglePart } from '../ur/ur'

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const tx = { TransactionType: 'Payment', Account: 'rA', Destination: 'rB', Amount: '1000000', Sequence: 5, Fee: '12', LastLedgerSequence: 99 }

describe('qr-codec', () => {
  it('round-trips an unsigned payload with the network id from NETWORKS', () => {
    for (const [network, id] of [['mainnet', 0], ['testnet', 1], ['devnet', 2]] as const) {
      expect(networkIdOf(network)).toBe(id)
      const enc = encodeUnsigned({ network, tx })
      expect(enc.text.startsWith('ur:xrplbench-unsigned/')).toBe(true)
      const dec = decodeUnsigned(enc.ok ? enc.text : '')
      expect(dec).toEqual({ ok: true, value: { v: 1, network_id: id, network, tx } })
    }
  })

  it('round-trips a signed payload', () => {
    const enc = encodeSigned({ network: 'testnet', txBlob: '12AB' })
    expect(enc.text.startsWith('ur:xrplbench-signed/')).toBe(true)
    expect(decodeSigned(enc.ok ? enc.text : '')).toEqual({ ok: true, value: { v: 1, network_id: 1, network: 'testnet', tx_blob: '12AB' } })
  })

  it('a signed envelope names its Network; a code without a known one is refused (OS-FR-9)', () => {
    const main = encodeSigned({ network: 'mainnet', txBlob: 'AB' })
    expect(decodeSigned(main.ok ? main.text : '')).toMatchObject({ ok: true, value: { network: 'mainnet', network_id: 0 } })
    // A code from a build before story 4 has no network_id: an older version, said so.
    expect(decodeSigned(`xrplbench:1:s:${b64({ v: 1, tx_blob: 'AB' })}`)).toEqual({
      ok: false,
      kind: 'unknown-version',
      reason: 'That code is from a version of XRPL Bench this one does not understand.',
    })
    for (const id of [3, 1.5, '1', null, 1024]) {
      expect(decodeSigned(`xrplbench:1:s:${b64({ v: 1, network_id: id, tx_blob: 'AB' })}`)).toMatchObject({ ok: false, kind: 'bad-network' })
    }
  })

  it('carries non-ASCII text intact', () => {
    const enc = encodeUnsigned({ network: 'testnet', tx: { ...tx, Memo: 'é€' } })
    const dec = decodeUnsigned(enc.ok ? enc.text : '')
    expect(dec.ok && dec.value.tx.Memo).toBe('é€')
  })

  it('rejects an unknown version, in the prefix and in the body', () => {
    expect(decodeUnsigned(`xrplbench:2:u:${b64({ v: 2, network_id: 0, tx })}`)).toMatchObject({ ok: false, kind: 'unknown-version' })
    expect(decodeUnsigned(`xrplbench:1:u:${b64({ v: 2, network_id: 0, tx })}`)).toMatchObject({ ok: false, kind: 'unknown-version' })
  })

  it('rejects the wrong kind in both directions', () => {
    const u = encodeUnsigned({ network: 'testnet', tx })
    const s = encodeSigned({ network: 'testnet', txBlob: 'AB' })
    expect(decodeSigned(u.ok ? u.text : '')).toMatchObject({ ok: false, kind: 'wrong-kind' })
    expect(decodeUnsigned(s.ok ? s.text : '')).toMatchObject({ ok: false, kind: 'wrong-kind' })
  })

  it('rejects malformed text without throwing', () => {
    for (const bad of ['', 'hello', 'xrplbench:1:u:', 'xrplbench:1:u:***', 'xrplbench:1:u:e30', `xrplbench:1:u:${b64([1])}`, 'xrplbench:1:x:AAAA', 'xrplbench:1:u:/w', null, 42, undefined]) {
      expect(decodeUnsigned(bad)).toMatchObject({ ok: false })
      expect(decodeSigned(bad)).toMatchObject({ ok: false })
    }
    expect(decodeUnsigned(`xrplbench:1:u:${b64({ v: 1, network_id: 0 })}`)).toMatchObject({ ok: false, kind: 'malformed' })
    expect(decodeSigned(`xrplbench:1:s:${b64({ v: 1, network_id: 1, tx_blob: 'not hex' })}`)).toMatchObject({ ok: false, kind: 'malformed' })
    expect(decodeSigned(`xrplbench:1:s:${b64({ v: 1, network_id: 1, tx_blob: '' })}`)).toMatchObject({ ok: false, kind: 'malformed' })
  })

  it('rejects a non-integer or unknown network_id', () => {
    for (const id of [3, -1, 1.5, '1', null, 1024]) {
      expect(decodeUnsigned(`xrplbench:1:u:${b64({ v: 1, network_id: id, tx })}`)).toMatchObject({ ok: false, kind: 'bad-network' })
    }
  })

  it('refuses nothing for its size (OS-FR-24), only text past the decoder bound', () => {
    const big = encodeUnsigned({ network: 'testnet', tx: { ...tx, Memo: 'x'.repeat(10_000) } })
    expect(decodeUnsigned(big.text)).toMatchObject({ ok: true, value: { tx: { Memo: 'x'.repeat(10_000) } } })
    expect(decodeSigned(encodeSigned({ network: 'testnet', txBlob: 'AB'.repeat(5000) }).text)).toMatchObject({ ok: true })
    expect(decodeUnsigned('ur:xrplbench-unsigned/' + 'ae'.repeat(70_000))).toEqual({ ok: false, kind: 'malformed', reason: CODE_UNREADABLE })
  })

  it('still reads today\'s single-code form (a device on an older build)', () => {
    expect(decodeUnsigned(`xrplbench:1:u:${b64({ v: 1, network_id: 1, tx })}`)).toEqual({ ok: true, value: { v: 1, network_id: 1, network: 'testnet', tx } })
    expect(decodeSigned(`xrplbench:1:s:${b64({ v: 1, network_id: 0, tx_blob: 'AB' })}`)).toMatchObject({ ok: true, value: { network: 'mainnet' } })
  })

  it('reads a UR whatever its case, and refuses a frame, a bad checksum, a foreign or unknown UR type', () => {
    const enc = encodeUnsigned({ network: 'testnet', tx })
    expect(decodeUnsigned(enc.text.toUpperCase())).toEqual(decodeUnsigned(enc.text))
    // One frame of an animated code is not a payload: the scanner joins frames first.
    expect(decodeUnsigned('ur:xrplbench-unsigned/1-3/lpadaxcfaxhlcyynvdtbhfhdcxaeaeaeae')).toMatchObject({ ok: false, kind: 'malformed', reason: CODE_UNREADABLE })
    const flipped = enc.text.slice(0, -1) + (enc.text.endsWith('a') ? 'e' : 'a')
    expect(decodeUnsigned(flipped)).toMatchObject({ ok: false, kind: 'malformed' })
    const json = (o: unknown) => encodeBytes(new TextEncoder().encode(JSON.stringify(o)))
    expect(decodeUnsigned(encodeSinglePart({ type: 'bytes', cbor: json({ v: 1, network_id: 1, tx }) }))).toMatchObject({
      ok: false,
      reason: 'That is not an XRPL Bench signing code.',
    })
    expect(decodeUnsigned(encodeSinglePart({ type: 'xrplbench-request', cbor: json({ v: 1 }) }))).toMatchObject({ ok: false, kind: 'unknown-version' })
    // The message must be exactly one CBOR byte string.
    expect(decodeUnsigned(encodeSinglePart({ type: PAYLOAD_UR_TYPES.u, cbor: Uint8Array.from([0x01]) }))).toMatchObject({ ok: false, kind: 'malformed' })
  })

  it('ignores whitespace and line breaks inside a pasted payload', () => {
    const enc = encodeUnsigned({ network: 'testnet', tx })
    const text = enc.ok ? enc.text : ''
    const wrapped = `  ${text.slice(0, 20)}\n${text.slice(20, 40)} \r\n${text.slice(40)}\n`
    expect(decodeUnsigned(wrapped)).toEqual(decodeUnsigned(text))
    expect(decodeUnsigned(wrapped).ok).toBe(true)
  })
})
