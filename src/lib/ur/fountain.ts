// SPDX-License-Identifier: BSD-2-Clause-Patent. Algorithms after Blockchain
// Commons `bc-ur` (Copyright © 2020 Blockchain Commons, LLC); see ./NOTICE.md.
import { CborReader, concat, encodeArrayHeader, encodeBytes, encodeUint } from './cbor'
import { crc32, u32be } from './crc32'
import { Xoshiro256, chooseDegree, shuffled } from './xoshiro'

/**
 * The fountain code of a multi-part UR (BCR-2020-005). The message is cut into
 * `seqLen` equal fragments (the last padded with zeros). Parts 1..seqLen carry
 * one fragment each; every later part carries the XOR of a seeded random set of
 * fragments, so a reader that missed any part can still finish from later ones.
 * Every part names the CRC-32 of the whole message, and the decoder accepts the
 * joined message only when its CRC-32 equals that checksum.
 */

export interface FountainPart {
  seqNum: number
  seqLen: number
  messageLen: number
  checksum: number
  data: Uint8Array
}

/** `[seqNum, seqLen, messageLen, checksum, data]` in CBOR. */
export function encodePartCbor(p: FountainPart): Uint8Array {
  return concat([
    encodeArrayHeader(5),
    encodeUint(p.seqNum),
    encodeUint(p.seqLen),
    encodeUint(p.messageLen),
    encodeUint(p.checksum),
    encodeBytes(p.data),
  ])
}

/** Throws a `CborError` unless the bytes are exactly one five-item part. */
export function decodePartCbor(cbor: Uint8Array): FountainPart {
  const r = new CborReader(cbor)
  if (r.arrayHeader() !== 5) throw new RangeError('a part has five items')
  const part = { seqNum: r.uint(), seqLen: r.uint(), messageLen: r.uint(), checksum: r.uint(), data: r.bytes() }
  r.end()
  return part
}

/** The fragment length that cuts the message into the fewest equal fragments of at most `maxFragmentLen`. */
export function findNominalFragmentLength(messageLen: number, minFragmentLen: number, maxFragmentLen: number): number {
  if (messageLen <= 0 || minFragmentLen <= 0 || maxFragmentLen < minFragmentLen) throw new RangeError('bad fragment bounds')
  // bc-ur asserts on a message shorter than the minimum; one fragment is the only answer there.
  const maxFragmentCount = Math.max(1, Math.floor(messageLen / minFragmentLen))
  let fragmentLen = messageLen
  for (let count = 1; count <= maxFragmentCount; count++) {
    fragmentLen = Math.ceil(messageLen / count)
    if (fragmentLen <= maxFragmentLen) break
  }
  return fragmentLen
}

export function partitionMessage(message: Uint8Array, fragmentLen: number): Uint8Array[] {
  const fragments: Uint8Array[] = []
  for (let o = 0; o < message.length; o += fragmentLen) {
    const f = new Uint8Array(fragmentLen)
    f.set(message.subarray(o, o + fragmentLen))
    fragments.push(f)
  }
  return fragments
}

export function joinFragments(fragments: readonly Uint8Array[], messageLen: number): Uint8Array {
  return concat(fragments).slice(0, messageLen)
}

/** The fragment indexes part `seqNum` mixes, ascending. */
export function chooseFragments(seqNum: number, seqLen: number, checksum: number): number[] {
  // The first seqLen parts are the pure fragments.
  if (seqNum <= seqLen) return [seqNum - 1]
  const rng = new Xoshiro256(concat([u32be(seqNum), u32be(checksum)]))
  const degree = chooseDegree(seqLen, rng)
  const indexes = Array.from({ length: seqLen }, (_, i) => i)
  return shuffled(indexes, rng)
    .slice(0, degree)
    .sort((a, b) => a - b)
}

function xorInto(target: Uint8Array, source: Uint8Array): void {
  for (let i = 0; i < target.length; i++) target[i] ^= source[i]
}

export class FountainEncoder {
  readonly messageLen: number
  readonly checksum: number
  readonly fragmentLen: number
  private readonly fragments: Uint8Array[]
  private seqNum: number

  constructor(message: Uint8Array, maxFragmentLen: number, firstSeqNum = 0, minFragmentLen = 10) {
    if (message.length === 0 || message.length > 0xffffffff) throw new RangeError('bad message length')
    this.messageLen = message.length
    this.checksum = crc32(message)
    this.fragmentLen = findNominalFragmentLength(message.length, minFragmentLen, maxFragmentLen)
    this.fragments = partitionMessage(message, this.fragmentLen)
    this.seqNum = firstSeqNum >>> 0
  }

  get seqLen(): number {
    return this.fragments.length
  }

  /** True once every pure fragment has been emitted. */
  get isComplete(): boolean {
    return this.seqNum >= this.seqLen
  }

  nextPart(): FountainPart {
    this.seqNum = (this.seqNum + 1) >>> 0
    const data = new Uint8Array(this.fragmentLen)
    for (const i of chooseFragments(this.seqNum, this.seqLen, this.checksum)) xorInto(data, this.fragments[i])
    return { seqNum: this.seqNum, seqLen: this.seqLen, messageLen: this.messageLen, checksum: this.checksum, data }
  }
}

/** What a decoder refuses to take on, so a crafted part cannot make it allocate or loop without bound. */
export interface FountainLimits {
  maxMessageLen: number
  maxSeqLen: number
  /** Mixed parts held at once; a part past this is dropped. */
  maxMixedParts: number
}

export const DEFAULT_LIMITS: FountainLimits = { maxMessageLen: 65536, maxSeqLen: 256, maxMixedParts: 1024 }

/** `accepted`: the part was taken (it may change nothing). `invalid`: malformed, dropped.
 * `foreign`: well formed but from another message than the parts already held. `done`: a result already exists. */
export type ReceiveStatus = 'accepted' | 'invalid' | 'foreign' | 'done'

export type FountainResult = { ok: true; message: Uint8Array } | { ok: false; reason: 'checksum' }

interface Held {
  indexes: number[]
  data: Uint8Array
}

const keyOf = (indexes: readonly number[]) => indexes.join(',')

export class FountainDecoder {
  private expected: { seqLen: number; messageLen: number; checksum: number; fragmentLen: number } | null = null
  private readonly simple = new Map<number, Uint8Array>()
  private mixed = new Map<string, Held>()
  private readonly queue: Held[] = []
  private resultValue: FountainResult | null = null
  private readonly limits: FountainLimits

  constructor(limits: FountainLimits = DEFAULT_LIMITS) {
    this.limits = limits
  }

  get result(): FountainResult | null {
    return this.resultValue
  }

  /** Fragments recovered so far, out of `seqLen` (0 before the first part). */
  get progress(): { received: number; total: number } {
    return { received: this.simple.size, total: this.expected?.seqLen ?? 0 }
  }

  /** A part this decoder would hold, judged alone: lengths agree and stay inside the limits. */
  isWellFormed(p: FountainPart): boolean {
    const { maxMessageLen, maxSeqLen } = this.limits
    return (
      Number.isInteger(p.seqNum) &&
      p.seqNum >= 1 &&
      p.seqLen >= 1 &&
      p.seqLen <= maxSeqLen &&
      p.messageLen >= 1 &&
      p.messageLen <= maxMessageLen &&
      p.data.length >= 1 &&
      p.seqLen === Math.ceil(p.messageLen / p.data.length)
    )
  }

  receive(p: FountainPart): ReceiveStatus {
    if (this.resultValue) return 'done'
    if (!this.isWellFormed(p)) return 'invalid'
    const e = this.expected
    if (!e) {
      this.expected = { seqLen: p.seqLen, messageLen: p.messageLen, checksum: p.checksum, fragmentLen: p.data.length }
    } else if (e.seqLen !== p.seqLen || e.messageLen !== p.messageLen || e.checksum !== p.checksum || e.fragmentLen !== p.data.length) {
      return 'foreign'
    }
    this.queue.push({ indexes: chooseFragments(p.seqNum, p.seqLen, p.checksum), data: p.data.slice() })
    while (!this.resultValue && this.queue.length > 0) {
      const next = this.queue.shift() as Held
      if (next.indexes.length === 1) this.processSimple(next)
      else this.processMixed(next)
    }
    return 'accepted'
  }

  private processSimple(p: Held): void {
    const index = p.indexes[0]
    if (this.simple.has(index)) return
    this.simple.set(index, p.data)
    const e = this.expected as NonNullable<typeof this.expected>
    if (this.simple.size === e.seqLen) {
      const fragments = Array.from({ length: e.seqLen }, (_, i) => this.simple.get(i) as Uint8Array)
      const message = joinFragments(fragments, e.messageLen)
      // The one acceptance rule: the joined message's CRC-32 is the checksum every part named.
      this.resultValue = crc32(message) === e.checksum ? { ok: true, message } : { ok: false, reason: 'checksum' }
      return
    }
    this.reduceMixedBy(p)
  }

  private processMixed(p: Held): void {
    if (this.mixed.has(keyOf(p.indexes))) return
    let reduced = p
    for (const [index, data] of this.simple) reduced = reduce(reduced, { indexes: [index], data })
    for (const m of this.mixed.values()) reduced = reduce(reduced, m)
    if (reduced.indexes.length === 1) {
      this.queue.push(reduced)
      return
    }
    this.reduceMixedBy(reduced)
    if (this.mixed.size < this.limits.maxMixedParts) this.mixed.set(keyOf(reduced.indexes), reduced)
  }

  private reduceMixedBy(p: Held): void {
    const next = new Map<string, Held>()
    for (const m of this.mixed.values()) {
      const r = reduce(m, p)
      if (r.indexes.length === 1) this.queue.push(r)
      else next.set(keyOf(r.indexes), r)
    }
    this.mixed = next
  }
}

/** `a` with `b` taken out when `b`'s fragments are a strict subset of `a`'s; otherwise `a`. */
function reduce(a: Held, b: Held): Held {
  if (b.indexes.length >= a.indexes.length) return a
  const inA = new Set(a.indexes)
  if (!b.indexes.every((i) => inA.has(i))) return a
  const inB = new Set(b.indexes)
  const data = a.data.slice()
  xorInto(data, b.data)
  return { indexes: a.indexes.filter((i) => !inB.has(i)), data }
}
