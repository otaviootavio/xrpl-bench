import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { QrCode } from '@/components/wallet/QrCode'
import { ANIMATED_QR_CAPTION, ANIMATED_QR_KEYS } from '@/lib/animated-qr-words'
import { FRAME_INTERVAL_MS, QR_ERROR_CORRECTION, planQr, qrDrawSizeForVersion, qrVersionOf, type QrPlan } from '@/lib/qr-frames'

/**
 * One payload from `qr-codec` on a QR plate (OS-FR-24): one still code when it
 * fits, else an animated QR with fountain codes, with Pause/Continue and Next
 * frame keys and the P-64 caption. A changed payload replaces the whole thing
 * (keyed by the text), so a frame of an old payload never shows under a new one.
 */
export function PayloadQr({ text }: { text: string }) {
  const plan = useMemo(() => planQr(text), [text])
  if (plan.kind === 'still') return <QrCode text={plan.text} size={stillSize(plan.text)} />
  return <AnimatedQr key={text} plan={plan} />
}

function stillSize(text: string): number {
  try {
    return qrDrawSizeForVersion(qrVersionOf(text))
  } catch {
    // Too long for any QR version: QrCode says it could not draw it.
    return 220
  }
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

function AnimatedQr({ plan }: { plan: Extract<QrPlan, { kind: 'animated' }> }) {
  // Under reduced motion the code starts paused; Next frame steps it (WCAG 2.2.2).
  const [paused, setPaused] = useState(reducedMotion)
  const [index, setIndex] = useState(0)
  const [drawn, setDrawn] = useState<{ index: number; url: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const size = qrDrawSizeForVersion(plan.version)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(plan.frameAt(index), { width: size, margin: 1, errorCorrectionLevel: QR_ERROR_CORRECTION, version: plan.version })
      .then((url) => {
        if (!cancelled) setDrawn({ index, url })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [plan, index, size])

  // The next frame is asked for only once this one is on screen, so a slow draw
  // never makes frames change faster than FRAME_INTERVAL_MS.
  const shown = drawn?.index === index
  useEffect(() => {
    if (paused || !shown) return
    const t = setTimeout(() => setIndex((i) => i + 1), FRAME_INTERVAL_MS)
    return () => clearTimeout(t)
  }, [paused, shown, index])

  if (failed) return <p role="status" className="text-xs">The QR code could not be drawn.</p>
  return (
    <div className="flex flex-col items-start gap-2" data-testid="animated-qr">
      {drawn ? (
        <div className="panel-plate rounded-md bg-white p-2">
          {/* The last drawn frame stays up until the next is ready: no blank between frames. */}
          <img
            src={drawn.url}
            alt="QR code carrying a signing payload"
            width={size}
            height={size}
            data-frame={drawn.index + 1}
            className="block h-auto max-w-full"
          />
        </div>
      ) : (
        <div style={{ width: size, height: size }} className="max-w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setPaused((p) => !p)}>
          {paused ? ANIMATED_QR_KEYS.resume : ANIMATED_QR_KEYS.pause}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setIndex((i) => i + 1)}>
          {ANIMATED_QR_KEYS.next}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{ANIMATED_QR_CAPTION}</p>
    </div>
  )
}
