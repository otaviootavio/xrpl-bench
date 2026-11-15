// SPDX-License-Identifier: BSD-2-Clause-Patent. Algorithms after Blockchain
// Commons `bc-ur` (Copyright © 2020 Blockchain Commons, LLC); see ./NOTICE.md.
import { decodeMinimal, encodeMinimal } from './bytewords'
import { DEFAULT_LIMITS, FountainDecoder, FountainEncoder, decodePartCbor, encodePartCbor, type FountainLimits } from './fountain'

/**
 * Uniform Resources (BCR-2020-005). A single-part UR is `ur:<type>/<body>`; a
 * part of a multi-part UR is `ur:<type>/<seqNum>-<seqLen>/<body>`, where the
 * body is minimal Bytewords of the CBOR message (single) or of the CBOR
 * fountain part (multi). Case is not significant.
 */

export interface UR {
  type: string
  cbor: Uint8Array
}

export class URError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'URError'
  }
}

export const isUrType = (type: string): boolean => /^[a-z0-9-]+$/.test(type)

/** True when the text is spelled as a UR (the `ur:` scheme), whatever its case. */
export const looksLikeUr = (text: string): boolean => /^ur:/i.test(text)

export function encodeSinglePart(ur: UR): string {
  if (!isUrType(ur.type)) throw new URError('bad type')
  return `ur:${ur.type}/${encodeMinimal(ur.cbor)}`
}

function parse(text: string): { type: string; components: string[] } {
  const lowered = text.toLowerCase()
  if (!lowered.startsWith('ur:')) throw new URError('not a UR')
  const components = lowered.slice(3).split('/')
  if (components.length < 2) throw new URError('bad path')
  const type = components[0]
  if (!isUrType(type)) throw new URError('bad type')
  return { type, components: components.slice(1) }
}

/** A single-part UR's type and message. Throws a `URError` (or a Bytewords error) otherwise. */
export function decodeSinglePart(text: string): UR {
  const { type, components } = parse(text)
  if (components.length !== 1) throw new URError('not a single-part UR')
  return { type, cbor: decodeMinimal(components[0]) }
}

function parseSequence(s: string): { seqNum: number; seqLen: number } {
  const m = /^([0-9]{1,10})-([0-9]{1,10})$/.exec(s)
  if (!m) throw new URError('bad sequence')
  const seqNum = Number(m[1])
  const seqLen = Number(m[2])
  if (seqNum < 1 || seqLen < 1 || seqNum > 0xffffffff || seqLen > 0xffffffff) throw new URError('bad sequence')
  return { seqNum, seqLen }
}

/**
 * Emits the frames of one UR: the single-part UR on every call when the message
 * fits one fragment, otherwise the multi-part frames 1, 2, 3, … without end (the
 * first `seqLen` carry the message as it is, the rest are mixed).
 */
export class UREncoder {
  private readonly fountain: FountainEncoder
  private readonly ur: UR

  constructor(ur: UR, maxFragmentLen: number, firstSeqNum = 0, minFragmentLen = 10) {
    if (!isUrType(ur.type)) throw new URError('bad type')
    this.ur = ur
    this.fountain = new FountainEncoder(ur.cbor, maxFragmentLen, firstSeqNum, minFragmentLen)
  }

  get isSinglePart(): boolean {
    return this.fountain.seqLen === 1
  }

  get seqLen(): number {
    return this.fountain.seqLen
  }

  nextPart(): string {
    const part = this.fountain.nextPart()
    if (this.isSinglePart) return encodeSinglePart(this.ur)
    return `ur:${this.ur.type}/${part.seqNum}-${part.seqLen}/${encodeMinimal(encodePartCbor(part))}`
  }
}

/** `accepted`: taken. `invalid`: not a UR part this decoder can use (dropped).
 * `foreign`: a part of another UR than the one in progress. `done`: a result exists. */
export type URReceiveStatus = 'accepted' | 'invalid' | 'foreign' | 'done'

export type URResult = { ok: true; ur: UR } | { ok: false; reason: 'checksum' }

/**
 * Collects the parts of one UR, in any order, from any first part, with any
 * missed. A single-part UR completes it at once. The result is a UR only when
 * the joined message's CRC-32 equals the checksum its parts named.
 */
export class URDecoder {
  private type: string | null = null
  private fountain: FountainDecoder
  private resultValue: URResult | null = null
  private readonly limits: FountainLimits

  constructor(limits: FountainLimits = DEFAULT_LIMITS) {
    this.limits = limits
    this.fountain = new FountainDecoder(limits)
  }

  get result(): URResult | null {
    return this.resultValue
  }

  /** Fragments recovered, out of the message's fragment count (0 / 0 before the first multi-part frame). */
  get progress(): { received: number; total: number } {
    return this.fountain.progress
  }

  /** The UR type in progress, or null. */
  get expectedType(): string | null {
    return this.type
  }

  receive(text: string): URReceiveStatus {
    if (this.resultValue) return 'done'
    let parsed: { type: string; components: string[] }
    try {
      parsed = parse(text.trim())
    } catch {
      return 'invalid'
    }
    const { type, components } = parsed
    if (this.type !== null && type !== this.type) return 'foreign'
    try {
      if (components.length === 1) {
        if (this.type === null && this.fountain.progress.total === 0) {
          this.resultValue = { ok: true, ur: { type, cbor: decodeMinimal(components[0]) } }
          return 'accepted'
        }
        // A whole UR while parts of another are held: the caller decides.
        decodeMinimal(components[0])
        return 'foreign'
      }
      if (components.length !== 2) return 'invalid'
      const { seqNum, seqLen } = parseSequence(components[0])
      const part = decodePartCbor(decodeMinimal(components[1]))
      if (part.seqNum !== seqNum || part.seqLen !== seqLen) return 'invalid'
      const status = this.fountain.receive(part)
      if (status !== 'accepted') return status === 'done' ? 'done' : status
      this.type = type
      const r = this.fountain.result
      if (r) this.resultValue = r.ok ? { ok: true, ur: { type, cbor: r.message } } : r
      return 'accepted'
    } catch {
      return 'invalid'
    }
  }

  /** Forgets every part held. */
  reset(): void {
    this.type = null
    this.fountain = new FountainDecoder(this.limits)
    this.resultValue = null
  }
}
