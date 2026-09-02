import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** receiving-payments.md US-1/US-2: QR code for an address, optionally
 * embedding a destination tag via the standard XRPL URI format. */
export function QrCode({ address, destinationTag, size = 220 }: { address: string; destinationTag?: number; className?: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const uri = destinationTag !== undefined ? `ripple:${address}?dt=${destinationTag}` : address
    QRCode.toDataURL(uri, { width: size, margin: 1 }).then((url) => {
      if (!cancelled) setDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [address, destinationTag, size])

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
      <img src={dataUrl} alt={`QR code for address ${address}`} width={size} height={size} className="block" />
    </div>
  )
}
