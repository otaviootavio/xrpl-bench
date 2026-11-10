import { isPayloadUrType } from '@/lib/qr-codec'
import { URDecoder, encodeSinglePart, looksLikeUr } from '@/lib/ur/ur'

/**
 * What a scan plate does with each code it reads (OS-FR-24). A scan is one
 * payload: the session collects the frames of an animated QR, from any frame
 * and with any missed, and hands up the whole payload once, as the single-part
 * UR `qr-codec` decodes, so every check runs on the whole payload. It accepts
 * the joined payload only when its CRC-32 equals the checksum its frames named.
 *
 * - A still code (a single-part payload UR, or today's `xrplbench:` form) is
 *   whole at once.
 * - A frame of another payload than the one being collected is ignored, until
 *   `SWITCH_AFTER_FOREIGN` such frames come in a row: then the session starts
 *   over on the new payload (a plate re-renders for a changed payload). One
 *   stray frame, or a second code in view, does not drop what is held.
 * - A whole payload (a single-part UR) is whole at once, even while collecting.
 * - A UR that is not an XRPL Bench payload, and any other text, is ignored, as
 *   the camera ignores any other QR code in view.
 */

export type ScanStep =
  /** The whole payload: hand it up. The session is empty again. */
  | { status: 'complete'; text: string }
  /** One more frame of an animated code. `percent` is the share of its fragments recovered, 0–99. */
  | { status: 'progress'; percent: number }
  /** The joined frames failed their checksum. Nothing is handed up; the session is empty again. */
  | { status: 'failed' }
  /** Not a code this session reads, or nothing new. */
  | { status: 'ignored' }

/** True for a text a scan plate should look at: a payload UR or today's form. */
export function isPayloadText(text: string): boolean {
  const t = text.trim()
  if (t.startsWith('xrplbench:')) return true
  const m = /^ur:([a-z0-9-]+)\//i.exec(t)
  return m !== null && isPayloadUrType(m[1].toLowerCase())
}

/** Foreign frames in a row before the session gives up what it holds for the new payload. */
export const SWITCH_AFTER_FOREIGN = 3

const isSinglePart = (t: string) => /^ur:[a-z0-9-]+\/[^/]+$/i.test(t)

export class ScanSession {
  private decoder = new URDecoder()
  private foreignInARow = 0

  /** True while frames of an animated code are held. */
  get collecting(): boolean {
    return this.decoder.progress.total > 0
  }

  receive(raw: string): ScanStep {
    const text = raw.trim()
    if (!isPayloadText(text)) return { status: 'ignored' }
    if (!looksLikeUr(text)) {
      this.reset()
      return { status: 'complete', text }
    }
    if (isSinglePart(text)) {
      // A still code is a whole payload: read it alone, leaving any frames held untouched.
      const single = new URDecoder()
      const r = single.receive(text) === 'accepted' ? single.result : null
      if (!r?.ok) return { status: 'ignored' }
      this.reset()
      return { status: 'complete', text: encodeSinglePart(r.ur) }
    }
    let status = this.decoder.receive(text)
    if (status === 'foreign') {
      this.foreignInARow += 1
      if (this.foreignInARow < SWITCH_AFTER_FOREIGN) return { status: 'ignored' }
      this.reset()
      status = this.decoder.receive(text)
    }
    if (status === 'invalid' || status === 'foreign') return { status: 'ignored' }
    this.foreignInARow = 0
    const result = this.decoder.result
    if (result) {
      this.reset()
      return result.ok ? { status: 'complete', text: encodeSinglePart(result.ur) } : { status: 'failed' }
    }
    if (status !== 'accepted') return { status: 'ignored' }
    const { received, total } = this.decoder.progress
    return { status: 'progress', percent: Math.min(99, Math.floor((received * 100) / total)) }
  }

  reset(): void {
    this.decoder.reset()
    this.foreignInARow = 0
  }
}

/** The share a screen reader hears: the last quarter passed (0, 25, 50, 75). */
export const quarterOf = (percent: number): number => Math.floor(percent / 25) * 25
