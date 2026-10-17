import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** receiving-payments.md US-1/US-2: QR code for an address, optionally
 * embedding a destination tag via the standard XRPL URI format. */
export function QrCode({
  address,
  text,
  destinationTag,
  size = 220,
}: {
  address?: string
  /** Arbitrary text to draw instead of an address: the two-device signing payload (AD-30). */
  text?: string
  destinationTag?: number
  className?: string
  size?: number
}) {
  const [done, setDone] = useState<{ uri: string; size: number; url: string } | null>(null)
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const uri = text ?? (destinationTag !== undefined ? `ripple:${address}?dt=${destinationTag}` : (address ?? ''))
  const failed = failedFor === uri
  // An image drawn for a different payload or size is never shown under the new one.
  const dataUrl = done && done.uri === uri && done.size === size ? done.url : null

  useEffect(() => {
    let cancelled = false
    // Error correction M is what `qr-codec`'s capacity figure assumes.
    QRCode.toDataURL(uri, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setDone({ uri, size, url })
      })
      .catch(() => {
        if (!cancelled) setFailedFor(uri)
      })
    return () => {
      cancelled = true
    }
  }, [uri, size])

  if (failed) return <p role="status" className="text-xs">The QR code could not be drawn.</p>
  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="animate-pulse rounded-md bg-muted motion-reduce:animate-none"
      />
    )
  }
  // Deliberately left dark-on-white in both panel finishes: a QR code has to
  // keep its own contrast to stay scannable, so it is a printed label mounted on
  // the panel rather than a themed surface.
  return (
    <div className="panel-plate rounded-md bg-white p-2">
      <img src={dataUrl} alt={text !== undefined ? 'QR code carrying a signing payload' : `QR code for address ${address}`} width={size} height={size} className="block h-auto max-w-full" />
    </div>
  )
}
