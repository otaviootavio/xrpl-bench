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
 * - A frame of another payload than the one being collected starts over on the
 *   new one: a plate re-renders for a changed payload, and the old frames are
 *   never wanted again.
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

export class ScanSession {
  private decoder = new URDecoder()

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
    let status = this.decoder.receive(text)
    if (status === 'foreign') {
      this.reset()
      status = this.decoder.receive(text)
    }
    if (status === 'invalid' || status === 'foreign') return { status: 'ignored' }
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
  }
}

/** The share a screen reader hears: the last quarter passed (0, 25, 50, 75). */
export const quarterOf = (percent: number): number => Math.floor(percent / 25) * 25
