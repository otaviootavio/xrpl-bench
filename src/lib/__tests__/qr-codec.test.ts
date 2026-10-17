import { describe, expect, it } from 'vitest'
import { QR_MAX_BYTES, decodeSigned, decodeUnsigned, encodeSigned, encodeUnsigned, networkIdOf } from '../qr-codec'

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const tx = { TransactionType: 'Payment', Account: 'rA', Destination: 'rB', Amount: '1000000', Sequence: 5, Fee: '12', LastLedgerSequence: 99 }

describe('qr-codec', () => {
  it('round-trips an unsigned payload with the network id from NETWORKS', () => {
    for (const [network, id] of [['mainnet', 0], ['testnet', 1], ['devnet', 2]] as const) {
      expect(networkIdOf(network)).toBe(id)
      const enc = encodeUnsigned({ network, tx })
      expect(enc.ok && enc.text.startsWith('xrplbench:1:u:')).toBe(true)
      const dec = decodeUnsigned(enc.ok ? enc.text : '')
      expect(dec).toEqual({ ok: true, value: { v: 1, network_id: id, network, tx } })
    }
  })

  it('round-trips a signed payload', () => {
    const enc = encodeSigned('12AB')
    expect(enc.ok && enc.text.startsWith('xrplbench:1:s:')).toBe(true)
    expect(decodeSigned(enc.ok ? enc.text : '')).toEqual({ ok: true, value: { v: 1, tx_blob: '12AB' } })
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
    const s = encodeSigned('AB')
    expect(decodeSigned(u.ok ? u.text : '')).toMatchObject({ ok: false, kind: 'wrong-kind' })
    expect(decodeUnsigned(s.ok ? s.text : '')).toMatchObject({ ok: false, kind: 'wrong-kind' })
  })

  it('rejects malformed text without throwing', () => {
    for (const bad of ['', 'hello', 'xrplbench:1:u:', 'xrplbench:1:u:***', 'xrplbench:1:u:e30', `xrplbench:1:u:${b64([1])}`, 'xrplbench:1:x:AAAA', 'xrplbench:1:u:/w', null, 42, undefined]) {
      expect(decodeUnsigned(bad)).toMatchObject({ ok: false })
      expect(decodeSigned(bad)).toMatchObject({ ok: false })
    }
    expect(decodeUnsigned(`xrplbench:1:u:${b64({ v: 1, network_id: 0 })}`)).toMatchObject({ ok: false, kind: 'malformed' })
    expect(decodeSigned(`xrplbench:1:s:${b64({ v: 1, tx_blob: 'not hex' })}`)).toMatchObject({ ok: false, kind: 'malformed' })
    expect(decodeSigned(`xrplbench:1:s:${b64({ v: 1, tx_blob: '' })}`)).toMatchObject({ ok: false, kind: 'malformed' })
  })

  it('rejects a non-integer or unknown network_id', () => {
    for (const id of [3, -1, 1.5, '1', null, 1024]) {
      expect(decodeUnsigned(`xrplbench:1:u:${b64({ v: 1, network_id: id, tx })}`)).toMatchObject({ ok: false, kind: 'bad-network' })
    }
  })

  it('refuses to encode, and to decode, a payload over one QR', () => {
    const big = encodeUnsigned({ network: 'testnet', tx: { ...tx, Memo: 'x'.repeat(QR_MAX_BYTES) } })
    expect(big).toEqual({ ok: false, reason: expect.stringContaining('too large for one QR') })
    expect(encodeSigned('AB'.repeat(QR_MAX_BYTES)).ok).toBe(false)
    expect(decodeUnsigned('xrplbench:1:u:' + 'A'.repeat(QR_MAX_BYTES))).toMatchObject({ ok: false, kind: 'too-large' })
  })

  it('ignores whitespace and line breaks inside a pasted payload', () => {
    const enc = encodeUnsigned({ network: 'testnet', tx })
    const text = enc.ok ? enc.text : ''
    const wrapped = `  ${text.slice(0, 20)}\n${text.slice(20, 40)} \r\n${text.slice(40)}\n`
    expect(decodeUnsigned(wrapped)).toEqual(decodeUnsigned(text))
    expect(decodeUnsigned(wrapped).ok).toBe(true)
  })
})
