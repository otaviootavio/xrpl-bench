import QRCode from 'qrcode'
import { isPayloadUrType } from '@/lib/qr-codec'
import { DEFAULT_LIMITS, encodePartCbor, findNominalFragmentLength } from '@/lib/ur/fountain'
import { encodeMinimal } from '@/lib/ur/bytewords'
import { UREncoder, decodeSinglePart, looksLikeUr } from '@/lib/ur/ur'

/**
 * How one payload is drawn (OS-FR-24): one still code when it fits, else an
 * animated QR with fountain codes. Decided here, once, so every QR plate draws
 * the same way.
 *
 * - **Still** when the payload's message (the CBOR in its single-part UR) is at
 *   most `STILL_MAX_MESSAGE_BYTES`. That keeps today's common payloads (a
 *   payment, a trust line, a key change, signed or not) one code of at most QR
 *   version 21, about the density today's single code had.
 * - **Animated** otherwise: multi-part UR frames of at most
 *   `FRAME_MAX_FRAGMENT_BYTES` of message each (QR version 15 at most), shown at
 *   not more than three frames each second (`FRAME_INTERVAL_MS`).
 *
 * A UR is drawn in upper case so the QR uses its alphanumeric mode (about 5.5
 * bits a character, not 8). Today's single-code form is drawn as it is: base64url
 * is case-sensitive.
 */

export const STILL_MAX_MESSAGE_BYTES = 500
export const FRAME_MAX_FRAGMENT_BYTES = 250
/** Not more than three frames each second (OS-FR-24; WCAG 2.3.1 three flashes). */
export const FRAME_INTERVAL_MS = 350
/** The error correction the plates draw at. */
export const QR_ERROR_CORRECTION = 'M' as const

export type QrPlan =
  | { kind: 'still'; text: string }
  | {
      kind: 'animated'
      /** Fragments in the message: the frames a reader needs if it misses none. */
      seqLen: number
      /** One QR version for every frame, so the code does not change size between frames. */
      version: number
      /** Frame `index + 1`, upper case. Frames 1..seqLen carry the message as it is; every later
       * one is mixed, so the stream runs on without end and never loops back to frame 1. */
      frameAt: (index: number) => string
    }

/** The QR version a text needs at the plates' error correction. */
export function qrVersionOf(text: string): number {
  return QRCode.create(text, { errorCorrectionLevel: QR_ERROR_CORRECTION }).version
}

/** How to draw `text`, a payload from `qr-codec` (or any other text, drawn still). */
export function planQr(text: string): QrPlan {
  if (!looksLikeUr(text)) return { kind: 'still', text }
  let ur: { type: string; cbor: Uint8Array }
  try {
    ur = decodeSinglePart(text)
  } catch {
    return { kind: 'still', text }
  }
  if (!isPayloadUrType(ur.type) || ur.cbor.length <= STILL_MAX_MESSAGE_BYTES) return { kind: 'still', text: text.toUpperCase() }
  const encoder = new UREncoder(ur, FRAME_MAX_FRAGMENT_BYTES)
  // Never animate what no decoder of this app would take in: drawn still, such a code fails to draw
  // and says so (QrCode), rather than animating without end.
  if (ur.cbor.length > DEFAULT_LIMITS.maxMessageLen || encoder.seqLen > DEFAULT_LIMITS.maxSeqLen) return { kind: 'still', text: text.toUpperCase() }
  // The longest frame this stream can ever make: the largest sequence number in
  // the path and in the CBOR, over a fragment of the stream's length.
  const fragmentLen = findNominalFragmentLength(ur.cbor.length, 10, FRAME_MAX_FRAGMENT_BYTES)
  const worst = encodePartCbor({ seqNum: 0xffffffff, seqLen: encoder.seqLen, messageLen: ur.cbor.length, checksum: 0xffffffff, data: new Uint8Array(fragmentLen) })
  const version = qrVersionOf(`ur:${ur.type}/${0xffffffff}-${encoder.seqLen}/${encodeMinimal(worst)}`.toUpperCase())
  // A frame is a pure function of its index: a re-render or a remount draws the same frame.
  const frameAt = (index: number) => new UREncoder(ur, FRAME_MAX_FRAGMENT_BYTES, index >>> 0).nextPart().toUpperCase()
  return { kind: 'animated', seqLen: encoder.seqLen, version, frameAt }
}

/** About four pixels per module plus the quiet zone, so a dense code stays scannable; the plate shrinks it to fit. */
export function qrDrawSizeForVersion(version: number): number {
  const modules = 17 + 4 * version
  return Math.min(720, Math.max(220, (modules + 2) * 4))
}
