/**
 * The approved words of the animated QR (OS-FR-24, OS-FR-12): P-64 (the keys and
 * the caption under an animated code) and P-65 (the scan plate's progress),
 * copied character for character from the offline signing UX spine
 * (`_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md`),
 * approved by the owner on 2026-11-08. `animated-qr-words.test.ts` compares each
 * with that file.
 */

/** P-64: the keys under an animated code. */
export const ANIMATED_QR_KEYS = { pause: 'Pause', resume: 'Continue', next: 'Next frame' } as const

/** P-64: the caption under an animated code. */
export const ANIMATED_QR_CAPTION =
  'This code has more than one frame. Keep the camera on the code until the other device reads all of it.'

/** P-65: the scan plate's progress while it reads an animated code. */
export const scanProgressWords = (percent: number): string => `The app read ${percent} percent of the code.`

/** P-65: the scan plate when it has all of an animated code. */
export const SCAN_COMPLETE = 'The app read the code.'
