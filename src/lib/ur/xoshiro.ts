// SPDX-License-Identifier: BSD-2-Clause-Patent. Algorithms after Blockchain
// Commons `bc-ur` (Copyright © 2020 Blockchain Commons, LLC); see ./NOTICE.md.
// xoshiro256** 1.0 is by David Blackman and Sebastiano Vigna (2018), CC0 1.0.
import { sha256 } from '@noble/hashes/sha2.js'

const MASK64 = (1n << 64n) - 1n
const TWO_64 = 2 ** 64

const rotl = (x: bigint, k: bigint): bigint => ((x << k) | (x >> (64n - k))) & MASK64

/**
 * The seeded generator the fountain code draws from: xoshiro256**, its state
 * set from the SHA-256 of the seed bytes, read as four big-endian u64. Both
 * devices must draw the same numbers, so this follows `bc-ur` exactly, down to
 * how a u64 becomes a double.
 */
export class Xoshiro256 {
  private s: [bigint, bigint, bigint, bigint]

  constructor(seed: Uint8Array | string) {
    const bytes = typeof seed === 'string' ? new TextEncoder().encode(seed) : seed
    const digest = sha256(bytes)
    const s: bigint[] = []
    for (let i = 0; i < 4; i++) {
      let v = 0n
      for (let n = 0; n < 8; n++) v = (v << 8n) | BigInt(digest[i * 8 + n])
      s.push(v)
    }
    this.s = s as [bigint, bigint, bigint, bigint]
  }

  /** The next u64. */
  next(): bigint {
    const s = this.s
    const result = (rotl((s[1] * 5n) & MASK64, 7n) * 9n) & MASK64
    const t = (s[1] << 17n) & MASK64
    s[2] ^= s[0]
    s[3] ^= s[1]
    s[1] ^= s[2]
    s[0] ^= s[3]
    s[2] ^= t
    s[3] = rotl(s[3], 45n)
    return result
  }

  /** In [0, 1): the u64 rounded to a double, divided by 2^64. */
  nextDouble(): number {
    return Number(this.next()) / TWO_64
  }

  /** In [low, high], both included. */
  nextInt(low: number, high: number): number {
    return Math.floor(this.nextDouble() * (high - low + 1)) + low
  }

  nextByte(): number {
    return this.nextInt(0, 255)
  }

  nextData(count: number): Uint8Array {
    const out = new Uint8Array(count)
    for (let i = 0; i < count; i++) out[i] = this.nextByte()
    return out
  }
}

/** Walker/Vose alias sampling over the given weights, built as `bc-ur` builds it. */
export class RandomSampler {
  private readonly probs: number[]
  private readonly aliases: number[]

  constructor(weights: readonly number[]) {
    if (weights.some((w) => !(w >= 0))) throw new RangeError('negative weight')
    const sum = weights.reduce((a, b) => a + b, 0)
    if (!(sum > 0)) throw new RangeError('weights sum to zero')
    const n = weights.length
    const P = weights.map((w) => (w * n) / sum)
    const S: number[] = []
    const L: number[] = []
    // As in bc-ur (at variance from Schwarz), indexes are taken in reverse order.
    for (let i = n - 1; i >= 0; i--) (P[i] < 1 ? S : L).push(i)
    const probs = new Array<number>(n).fill(0)
    const aliases = new Array<number>(n).fill(0)
    while (S.length > 0 && L.length > 0) {
      const a = S.pop() as number
      const g = L.pop() as number
      probs[a] = P[a]
      aliases[a] = g
      P[g] += P[a] - 1
      ;(P[g] < 1 ? S : L).push(g)
    }
    while (L.length > 0) probs[L.pop() as number] = 1
    // Only reached through numeric instability.
    while (S.length > 0) probs[S.pop() as number] = 1
    this.probs = probs
    this.aliases = aliases
  }

  next(random: () => number): number {
    const r1 = random()
    const r2 = random()
    const i = Math.floor(this.probs.length * r1)
    return r2 < this.probs[i] ? i : this.aliases[i]
  }
}

/** The items in the order the generator picks them, one at a time. */
export function shuffled<T>(items: readonly T[], rng: Xoshiro256): T[] {
  const remaining = [...items]
  const out: T[] = []
  while (remaining.length > 0) {
    const index = rng.nextInt(0, remaining.length - 1)
    out.push(remaining.splice(index, 1)[0])
  }
  return out
}

/** A degree in 1..seqLen, with a probability proportional to 1/degree. */
export function chooseDegree(seqLen: number, rng: Xoshiro256): number {
  const weights = Array.from({ length: seqLen }, (_, i) => 1 / (i + 1))
  return new RandomSampler(weights).next(() => rng.nextDouble()) + 1
}
