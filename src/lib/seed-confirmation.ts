/**
 * Word-confirmation for an XRPL family Seed (FR-72, CAP-8). A Seed is one base58
 * string with no words, so "word" means a 4-character group: the Seed is split
 * into groups, the person is asked for three distinct, randomly chosen ones by
 * their 1-based character range, and must type them back exactly (trim only).
 *
 * The positions are not secret. The Seed and the typed answers are: this module
 * holds neither beyond a call, and a caller keeps answers in uncontrolled inputs.
 */

export const GROUP_SIZE = 4
export const CHALLENGE_SIZE = 3

export interface ChallengeGroup {
  /** 1-based, inclusive: "characters 5–8" is `{ from: 5, to: 8 }`. */
  from: number
  to: number
}

/** A random number in [0, 1). Injectable so a test can pin the challenge. */
export type Rng = () => number

function cryptoRng(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
}

/** Three distinct, ascending groups of a Seed of `length` characters. Only whole
 * groups are asked for; a short trailing remainder never is. Throws when the Seed
 * is too short to hold three. */
export function pickChallenge(length: number, rng: Rng = cryptoRng): ChallengeGroup[] {
  const groups = Math.floor(length / GROUP_SIZE)
  if (!Number.isFinite(length) || groups < CHALLENGE_SIZE) throw new Error('This Seed is too short to confirm.')
  const pool = Array.from({ length: groups }, (_, i) => i)
  const picked: number[] = []
  while (picked.length < CHALLENGE_SIZE) {
    const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length))
    picked.push(pool.splice(index, 1)[0])
  }
  return picked
    .sort((a, b) => a - b)
    .map((g) => ({ from: g * GROUP_SIZE + 1, to: (g + 1) * GROUP_SIZE }))
}

/** True only when every challenged group was typed exactly (case matters, base58
 * is case-sensitive; surrounding whitespace is ignored). One answer per group. */
export function answersMatch(seed: string, challenge: readonly ChallengeGroup[], answers: readonly string[]): boolean {
  if (challenge.length !== CHALLENGE_SIZE || answers.length !== challenge.length) return false
  return challenge.every((g, i) => seed.slice(g.from - 1, g.to) === answers[i].trim() && answers[i].trim().length === GROUP_SIZE)
}
