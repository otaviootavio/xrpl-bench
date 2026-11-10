/**
 * The little CBOR (RFC 8949) a UR needs: unsigned integers up to 2^32 - 1,
 * byte strings and array headers, always in the shortest form. Decoding takes
 * definite lengths only and refuses anything else, so a crafted part cannot
 * reach a code path this file does not have.
 */

export class CborError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CborError'
  }
}

const MAJOR_UINT = 0
const MAJOR_BYTES = 2
const MAJOR_ARRAY = 4

function head(major: number, value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new CborError('value out of range')
  const m = major << 5
  if (value < 24) return [m | value]
  if (value < 0x100) return [m | 24, value]
  if (value < 0x10000) return [m | 25, value >>> 8, value & 0xff]
  return [m | 26, (value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

export function encodeUint(value: number): Uint8Array {
  return Uint8Array.from(head(MAJOR_UINT, value))
}

export function encodeBytes(data: Uint8Array): Uint8Array {
  const h = head(MAJOR_BYTES, data.length)
  const out = new Uint8Array(h.length + data.length)
  out.set(h)
  out.set(data, h.length)
  return out
}

export function encodeArrayHeader(length: number): Uint8Array {
  return Uint8Array.from(head(MAJOR_ARRAY, length))
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** A reader over one CBOR item sequence. Every read checks the major type and the bounds. */
export class CborReader {
  private offset = 0
  private readonly data: Uint8Array
  constructor(data: Uint8Array) {
    this.data = data
  }

  private readHead(major: number): number {
    if (this.offset >= this.data.length) throw new CborError('truncated')
    const initial = this.data[this.offset++]
    if (initial >> 5 !== major) throw new CborError('unexpected type')
    const info = initial & 0x1f
    if (info < 24) return info
    const width = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : 0
    // 8-byte values, indefinite lengths and reserved values are not read.
    if (width === 0) throw new CborError('unsupported length')
    if (this.offset + width > this.data.length) throw new CborError('truncated')
    let value = 0
    for (let i = 0; i < width; i++) value = value * 256 + this.data[this.offset++]
    // Shortest form only: a head longer than its value needs is refused.
    if (value < (width === 1 ? 24 : width === 2 ? 0x100 : 0x10000)) throw new CborError('non-canonical length')
    return value
  }

  uint(): number {
    return this.readHead(MAJOR_UINT)
  }

  bytes(): Uint8Array {
    const length = this.readHead(MAJOR_BYTES)
    if (this.offset + length > this.data.length) throw new CborError('truncated')
    const out = this.data.slice(this.offset, this.offset + length)
    this.offset += length
    return out
  }

  arrayHeader(): number {
    return this.readHead(MAJOR_ARRAY)
  }

  /** Throws unless every byte has been read. */
  end(): void {
    if (this.offset !== this.data.length) throw new CborError('trailing bytes')
  }
}
