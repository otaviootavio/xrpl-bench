/**
 * The words of "Signs for" (OS-FR-20, CAP-13, OS-FR-12). Each is copied character
 * for character from the spec's fixed strings
 * (`_bmad-output/specs/spec-offline-signing/consequence-texts.md`) or from the
 * offline signing UX spine (`EXPERIENCE.md`, P-n approved by the owner on
 * 2026-11-08). `signs-for-words.test.ts` compares each one with its source. A
 * `{name}` is a slot, filled in order by `fill` (`transmit-words.ts`).
 *
 * Three are used outside the place their row names, because the spine's own words
 * for the Signs for plate and card ("Signs for", "Account", "Change") are not
 * approved (story 10, owner to confirm): P-17's second sentence as the card line
 * and the plate's state line, P-54's "Set it" as the plate's set key, and P-46's
 * "Remove the address" (`transmitter-words.ts`) as its remove key.
 */

/** Fixed string: the quiz step title and its checkbox label, and the Signs for plate's title. */
export const SIGNS_FOR_ANOTHER_ACCOUNT = 'This key signs for another account'

/** P-40: under the address, in the quiz step and the plate. */
export const MUST_BE_REGULAR_KEY = 'This key must be the Regular Key of that account.'

/** P-17's second sentence (the Account refusal): the card line and the plate's state line. */
export const WALLET_SIGNS_FOR = 'This wallet signs for {address}.'

/** P-54: after a Regular Key change built in this app is validated. First form: the key is a Wallet here. */
export const SET_WALLET_TO_SIGN_FOR = 'Set the wallet {name} to sign for this account?'
export const SET_IT = 'Set it'
export const NOT_NOW = 'Not now'
/** P-54, second form: the key is elsewhere. */
export const SET_IT_ELSEWHERE = 'In the wallet that has this key, set the key to sign for this account.'
