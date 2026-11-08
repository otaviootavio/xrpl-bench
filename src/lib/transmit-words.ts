/**
 * The approved words of the Transmit step (OS-FR-9, OS-FR-10, OS-FR-12). Each
 * template is copied character for character from the offline signing UX spine
 * (`_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md`,
 * P-24 and P-26, approved by the owner on 2026-11-08) or from the spec's
 * fixed strings (`_bmad-output/specs/spec-offline-signing/consequence-texts.md`).
 * `transmit-words.test.ts` compares each one with its source file. A `{name}`
 * is a slot, filled in order by `fill`.
 */

/** P-26 heading, and P-24's decline line: the same sentence. */
export const NOT_SENT = 'The app did not send the transaction.'

/** P-26: the reasons, each said under `NOT_SENT`. */
export const REFUSAL = {
  signature: 'The signature is not correct.',
  network: 'This transaction is for {Network}. This wallet sends on {Network}.',
  account: 'The account {address} signed this transaction. The correct account is {address}.',
  partialPayment: 'This is a partial payment. The app does not send partial payments.',
} as const

/** Fixed string: the Transmit step outcome when the window has passed before sending. */
export const EXPIRED_NOTHING_SENT = 'Expired. Nothing was sent.'

/** P-24: the warning after a decline or a copy. */
export const STILL_VALID_WARNING = 'WARNING: This signed transaction is valid until ledger {n}. Until then, a person who has it can send it.'

/** Fills each `{slot}` in order with the next value. A template with more slots
 * than values keeps the rest as written, so a missing value is visible, never blank. */
export function fill(template: string, ...values: Array<string | number>): string {
  let i = 0
  return template.replace(/\{[A-Za-z]+\}/g, (slot) => (i < values.length ? String(values[i++]) : slot))
}
