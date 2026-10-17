import { describe, expect, it } from 'vitest'
import { answersMatch, CHALLENGE_SIZE, GROUP_SIZE, pickChallenge } from '../seed-confirmation'

const SEED = 'sEdTM1uX8pu2do5XvTnutH6HsouMaM2'

/** An rng that returns the given values in turn. */
const sequence = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('pickChallenge', () => {
  it('asks for three distinct 4-character groups, by 1-based range, in ascending order', () => {
    // Seed length 31: seven whole groups. Picks group 4, then group 0, then the
    // third of those left (group 3).
    expect(pickChallenge(31, sequence(4 / 7, 0, 0.5))).toEqual([
      { from: 1, to: 4 },
      { from: 13, to: 16 },
      { from: 17, to: 20 },
    ])
  })

  it('never repeats a group and never leaves the Seed, whatever the rng', () => {
    for (let n = 0; n < 200; n++) {
      const challenge = pickChallenge(SEED.length)
      expect(challenge).toHaveLength(CHALLENGE_SIZE)
      expect(new Set(challenge.map((g) => g.from)).size).toBe(CHALLENGE_SIZE)
      for (const g of challenge) {
        expect(g.to - g.from + 1).toBe(GROUP_SIZE)
        expect(g.from % GROUP_SIZE).toBe(1)
        expect(g.to).toBeLessThanOrEqual(SEED.length)
      }
    }
  })

  it('survives an rng that returns the top of its range', () => {
    expect(() => pickChallenge(31, () => 0.9999999)).not.toThrow()
  })

  it('throws for a Seed too short to hold three groups', () => {
    expect(() => pickChallenge(11)).toThrow()
  })
})

describe('answersMatch', () => {
  const challenge = [
    { from: 1, to: 4 },
    { from: 9, to: 12 },
    { from: 21, to: 24 },
  ]
  const right = challenge.map((g) => SEED.slice(g.from - 1, g.to))

  it('accepts the right groups, ignoring surrounding whitespace', () => {
    expect(answersMatch(SEED, challenge, right)).toBe(true)
    expect(answersMatch(SEED, challenge, right.map((a) => ` ${a}\n`))).toBe(true)
  })

  it('rejects a wrong, case-changed, short or missing answer', () => {
    expect(answersMatch(SEED, challenge, [right[0], right[1], 'zzzz'])).toBe(false)
    expect(answersMatch(SEED, challenge, [right[0].toLowerCase(), right[1], right[2]])).toBe(false)
    expect(answersMatch(SEED, challenge, [right[0], right[1], right[2].slice(0, 3)])).toBe(false)
    expect(answersMatch(SEED, challenge, right.slice(0, 2))).toBe(false)
    expect(answersMatch(SEED, challenge, ['', '', ''])).toBe(false)
  })

  it('rejects answers given for the wrong positions', () => {
    expect(answersMatch(SEED, challenge, [right[1], right[0], right[2]])).toBe(false)
  })
})
