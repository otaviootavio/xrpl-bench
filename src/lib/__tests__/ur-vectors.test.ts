import { describe, expect, it } from 'vitest'
import { BytewordsError, decodeMinimal, decodeWords, encodeMinimal, encodeWords } from '../ur/bytewords'
import { CborError, CborReader, concat, encodeBytes } from '../ur/cbor'
import { crc32, u32be } from '../ur/crc32'
import {
  FountainDecoder,
  FountainEncoder,
  chooseFragments,
  decodePartCbor,
  encodePartCbor,
  findNominalFragmentLength,
  joinFragments,
  partitionMessage,
  type FountainPart,
} from '../ur/fountain'
import { URDecoder, UREncoder, decodeSinglePart, encodeSinglePart, type UR } from '../ur/ur'
import { RandomSampler, Xoshiro256, chooseDegree, shuffled } from '../ur/xoshiro'
import * as V from './ur-reference-vectors'

/**
 * OS-FR-24: the UR (BCR-2020-005) transport against the Blockchain Commons
 * reference vectors, one `it` per `test.cpp` case. A second device built from
 * any conforming implementation draws the same fragments, so these pin wire
 * compatibility, not only self-consistency.
 */

const enc = (s: string) => new TextEncoder().encode(s)
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const makeMessage = (len: number, seed = 'Wolf') => new Xoshiro256(seed).nextData(len)
const makeMessageUr = (len: number, seed = 'Wolf'): UR => ({ type: 'bytes', cbor: encodeBytes(makeMessage(len, seed)) })
const describePart = (p: FountainPart) =>
  `seqNum:${p.seqNum}, seqLen:${p.seqLen}, messageLen:${p.messageLen}, checksum:${p.checksum}, data:${hex(p.data)}`

describe('bc-ur reference vectors', () => {
  it('crc32', () => {
    expect(hex(u32be(crc32(enc('Hello, world!'))))).toBe('ebe6c6e6')
    expect(hex(u32be(crc32(enc('Wolf'))))).toBe('598c84dc')
  })

  it('bytewords 1', () => {
    const input = Uint8Array.from([0, 1, 2, 128, 255])
    expect(encodeWords(input, ' ')).toBe('able acid also lava zoom jade need echo taxi')
    expect(encodeWords(input, '-')).toBe('able-acid-also-lava-zoom-jade-need-echo-taxi')
    expect(encodeMinimal(input)).toBe('aeadaolazmjendeoti')
    expect(decodeWords('able acid also lava zoom jade need echo taxi', ' ')).toEqual(input)
    expect(decodeWords('able-acid-also-lava-zoom-jade-need-echo-taxi', '-')).toEqual(input)
    expect(decodeMinimal('aeadaolazmjendeoti')).toEqual(input)
    // bad checksum
    expect(() => decodeWords('able acid also lava zero jade need echo wolf', ' ')).toThrow(BytewordsError)
    expect(() => decodeWords('able-acid-also-lava-zero-jade-need-echo-wolf', '-')).toThrow(BytewordsError)
    expect(() => decodeMinimal('aeadaolazojendeowf')).toThrow(BytewordsError)
    // too short
    expect(() => decodeWords('wolf', ' ')).toThrow(BytewordsError)
    expect(() => decodeWords('', ' ')).toThrow(BytewordsError)
  })

  it('bytewords 2', () => {
    const input = Uint8Array.from(V.bw2in)
    expect(encodeWords(input, ' ')).toBe(V.bw2std)
    expect(encodeMinimal(input)).toBe(V.bw2min)
    expect(decodeWords(V.bw2std, ' ')).toEqual(input)
    expect(decodeMinimal(V.bw2min)).toEqual(input)
  })

  it('rng 1: next() % 100', () => {
    const rng = new Xoshiro256('Wolf')
    expect(Array.from({ length: 100 }, () => Number(rng.next() % 100n))).toEqual(V.rng1)
  })

  it('rng 2: seeded from a crc32', () => {
    const rng = new Xoshiro256(u32be(crc32(enc('Wolf'))))
    expect(Array.from({ length: 100 }, () => Number(rng.next() % 100n))).toEqual(V.rng2)
  })

  it('rng 3: nextInt(1, 10)', () => {
    const rng = new Xoshiro256('Wolf')
    expect(Array.from({ length: 100 }, () => rng.nextInt(1, 10))).toEqual(V.rng3)
  })

  it('find fragment length', () => {
    expect(findNominalFragmentLength(12345, 1005, 1955)).toBe(1764)
    expect(findNominalFragmentLength(12345, 1005, 30000)).toBe(12345)
  })

  it('random sampler', () => {
    const sampler = new RandomSampler([1, 2, 4, 8])
    const rng = new Xoshiro256('Wolf')
    expect(Array.from({ length: 500 }, () => sampler.next(() => rng.nextDouble()))).toEqual(V.sampler)
  })

  it('shuffle', () => {
    const rng = new Xoshiro256('Wolf')
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(Array.from({ length: 10 }, () => shuffled(values, rng))).toEqual(V.shuffle)
  })

  it('partition and join', () => {
    const message = makeMessage(1024)
    const fragmentLen = findNominalFragmentLength(message.length, 10, 100)
    const fragments = partitionMessage(message, fragmentLen)
    expect(fragments.map(hex)).toEqual(V.partition)
    expect(joinFragments(fragments, message.length)).toEqual(message)
  })

  it('choose degree', () => {
    const message = makeMessage(1024)
    const fragments = partitionMessage(message, findNominalFragmentLength(message.length, 10, 100))
    const degrees = Array.from({ length: 200 }, (_, i) => chooseDegree(fragments.length, new Xoshiro256(`Wolf-${i + 1}`)))
    expect(degrees).toEqual(V.degrees)
  })

  it('choose fragments', () => {
    const message = makeMessage(1024)
    const checksum = crc32(message)
    const fragments = partitionMessage(message, findNominalFragmentLength(message.length, 10, 100))
    const indexes = Array.from({ length: 30 }, (_, i) => chooseFragments(i + 1, fragments.length, checksum))
    expect(indexes).toEqual(V.fragIdx)
  })

  it('xor', () => {
    const rng = new Xoshiro256('Wolf')
    const data1 = rng.nextData(10)
    expect(hex(data1)).toBe('916ec65cf77cadf55cd7')
    const data2 = rng.nextData(10)
    expect(hex(data2)).toBe('f9cda1a1030026ddd42e')
    const data3 = data1.map((b, i) => b ^ data2[i])
    expect(hex(data3)).toBe('68a367fdf47c8b2888f9')
    expect(data3.map((b, i) => b ^ data1[i])).toEqual(data2)
  })

  it('fountain encoder', () => {
    const encoder = new FountainEncoder(makeMessage(256), 30)
    expect(Array.from({ length: 20 }, () => describePart(encoder.nextPart()))).toEqual(V.encDesc)
  })

  it('fountain encoder cbor', () => {
    const encoder = new FountainEncoder(makeMessage(256), 30)
    expect(Array.from({ length: 20 }, () => hex(encodePartCbor(encoder.nextPart())))).toEqual(V.encCbor)
  })

  it('fountain encoder is complete', () => {
    const encoder = new FountainEncoder(makeMessage(256), 30)
    let generated = 0
    while (!encoder.isComplete) {
      encoder.nextPart()
      generated += 1
    }
    expect(generated).toBe(encoder.seqLen)
  })

  it('fountain decoder (32767 bytes, fragments of 1000, from part 101)', () => {
    const message = makeMessage(32767)
    const encoder = new FountainEncoder(message, 1000, 100)
    const decoder = new FountainDecoder()
    do decoder.receive(encoder.nextPart())
    while (!decoder.result)
    expect(decoder.result).toEqual({ ok: true, message })
  })

  it('fountain cbor round trip', () => {
    const part = { seqNum: 12, seqLen: 8, messageLen: 100, checksum: 0x12345678, data: Uint8Array.from([1, 5, 3, 3, 5]) }
    const cbor = encodePartCbor(part)
    expect(encodePartCbor(decodePartCbor(cbor))).toEqual(cbor)
  })

  it('single-part ur', () => {
    const ur = makeMessageUr(50)
    const encoded = encodeSinglePart(ur)
    expect(encoded).toBe(
      'ur:bytes/hdeymejtswhhylkepmykhhtsytsnoyoyaxaedsuttydmmhhpktpmsrjtgwdpfnsboxgwlbaawzuefywkdplrsrjynbvygabwjldapfcsdwkbrkch',
    )
    expect(decodeSinglePart(encoded)).toEqual(ur)
  })

  it('ur encoder', () => {
    const encoder = new UREncoder(makeMessageUr(256), 30)
    expect(Array.from({ length: 20 }, () => encoder.nextPart())).toEqual(V.urParts)
  })

  it('multipart ur (32767 bytes, fragments of 1000, from part 101)', () => {
    const ur = makeMessageUr(32767)
    const encoder = new UREncoder(ur, 1000, 100)
    const decoder = new URDecoder()
    do decoder.receive(encoder.nextPart())
    while (!decoder.result)
    expect(decoder.result).toEqual({ ok: true, ur })
  })
})

describe('UR decoder hardening (OS-FR-24)', () => {
  const ur = makeMessageUr(256)

  it('never accepts a joined message whose CRC-32 is not the parts\' checksum', () => {
    // Each part keeps a valid Bytewords checksum of its own; only the message is wrong.
    const encoder = new FountainEncoder(ur.cbor, 30)
    const decoder = new URDecoder()
    for (let i = 0; i < encoder.seqLen; i++) {
      const part = encoder.nextPart()
      if (i === 3) part.data[0] ^= 0xff
      const text = `ur:bytes/${part.seqNum}-${part.seqLen}/${encodeMinimal(encodePartCbor(part))}`
      expect(decoder.receive(text)).toBe('accepted')
    }
    expect(decoder.result).toEqual({ ok: false, reason: 'checksum' })
  })

  it('finishes from any first frame with frames missed', () => {
    const encoder = new UREncoder(ur, 30, 4)
    const decoder = new URDecoder()
    let sent = 0
    while (!decoder.result && sent < 500) {
      const part = encoder.nextPart()
      sent += 1
      // Drop every third frame, as a camera that misses some would.
      if (sent % 3 !== 0) decoder.receive(part)
    }
    expect(decoder.result).toEqual({ ok: true, ur })
  })

  it('reports a part of another message as foreign and keeps what it holds', () => {
    const a = new UREncoder(ur, 30)
    const b = new UREncoder(makeMessageUr(256, 'Other'), 30)
    const decoder = new URDecoder()
    expect(decoder.receive(a.nextPart())).toBe('accepted')
    expect(decoder.receive(b.nextPart())).toBe('foreign')
    expect(decoder.progress).toEqual({ received: 1, total: 9 })
    expect(decoder.receive('ur:other-type/1-9/lpadascfadaxcywenbpljkhdcahkadaemejtswhhylkepmykhhtsytsnoyoyaxaedsuttydmmhhpktpmsrjtdkgslpgh')).toBe(
      'foreign',
    )
  })

  it('refuses a part whose path sequence disagrees with its CBOR, or whose lengths do not agree', () => {
    const decoder = new URDecoder()
    expect(decoder.receive(V.urParts[0].replace('/1-9/', '/2-9/'))).toBe('invalid')
    const bad = { seqNum: 1, seqLen: 3, messageLen: 256, checksum: 1, data: new Uint8Array(30) } // 256/30 is 9 fragments, not 3
    expect(decoder.receive(`ur:bytes/1-3/${encodeMinimal(encodePartCbor(bad))}`)).toBe('invalid')
    expect(decoder.progress).toEqual({ received: 0, total: 0 })
  })

  it('refuses a part that claims more fragments or a longer message than the limits, before any work', () => {
    const decoder = new URDecoder()
    const huge = { seqNum: 5_000_000, seqLen: 4_294_967_295, messageLen: 4_294_967_295, checksum: 1, data: new Uint8Array(1) }
    const t0 = Date.now()
    expect(decoder.receive(`ur:bytes/5000000-4294967295/${encodeMinimal(encodePartCbor(huge))}`)).toBe('invalid')
    expect(Date.now() - t0).toBeLessThan(200)
    const long = { seqNum: 1, seqLen: 257, messageLen: 257, checksum: 1, data: new Uint8Array(1) }
    expect(decoder.receive(`ur:bytes/1-257/${encodeMinimal(encodePartCbor(long))}`)).toBe('invalid')
  })

  it('refuses garbage, a bad Bytewords checksum and trailing CBOR', () => {
    const decoder = new URDecoder()
    expect(decoder.receive('hello')).toBe('invalid')
    expect(decoder.receive('ur:bytes/1-9/lpadascfadaxcywenbpljkhdcahkadaemejtswhhylkepmykhhtsytsnoyoyaxaedsuttydmmhhpktpmsrjtdkgslpgg')).toBe('invalid')
    const part = new FountainEncoder(ur.cbor, 30).nextPart()
    const trailing = concat([encodePartCbor(part), Uint8Array.from([0])])
    expect(decoder.receive(`ur:bytes/1-9/${encodeMinimal(trailing)}`)).toBe('invalid')
  })

  it('reads a UR in upper case (as a QR code carries it)', () => {
    expect(decodeSinglePart(encodeSinglePart(ur).toUpperCase())).toEqual(ur)
    const decoder = new URDecoder()
    const encoder = new UREncoder(ur, 30)
    while (!decoder.result) decoder.receive(encoder.nextPart().toUpperCase())
    expect(decoder.result).toEqual({ ok: true, ur })
  })

  it('refuses a CBOR head longer than its value needs (shortest form only)', () => {
    expect(() => new CborReader(Uint8Array.from([0x18, 0x05])).uint()).toThrow(CborError)
    expect(() => new CborReader(Uint8Array.from([0x19, 0x00, 0x10])).uint()).toThrow(CborError)
    expect(() => new CborReader(Uint8Array.from([0x1a, 0x00, 0x00, 0xff, 0xff])).uint()).toThrow(CborError)
    expect(new CborReader(Uint8Array.from([0x18, 0x18])).uint()).toBe(24)
    expect(new CborReader(Uint8Array.from([0x1a, 0x00, 0x01, 0x00, 0x00])).uint()).toBe(65536)
  })
})
