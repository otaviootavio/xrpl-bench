import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

/** The part of the browser's `BarcodeDetector` this uses (not in `lib.dom`). */
interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
type DetectorCtor = new (options: { formats: string[] }) => Detector

function detectorCtor(): DetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  return ctor && typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' ? ctor : null
}

/**
 * Takes a two-device payload (AD-30) from the camera where the browser has
 * `BarcodeDetector` and `getUserMedia`, and always from pasted text. Both hand
 * the same string to `onPayload`; judging it is the codec's job. Holds no
 * payload after it is handed up, and stops the camera when it stops scanning
 * or unmounts.
 */
export function QrScanner({ onPayload, label }: { onPayload: (text: string) => void; label: string }) {
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [pasteError, setPasteError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const canScan = detectorCtor() !== null
  const handoff = useRef(onPayload)
  useEffect(() => {
    handoff.current = onPayload
  })

  useEffect(() => {
    if (!scanning) return
    const Ctor = detectorCtor()
    if (!Ctor) return
    let detector: Detector
    try {
      detector = new Ctor({ formats: ['qr_code'] })
    } catch {
      // Queued, not set here: the effect body does not set state synchronously.
      queueMicrotask(() => {
        setCameraError('This browser cannot scan a QR code. Paste the text instead.')
        setScanning(false)
      })
      return
    }
    let stopped = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      stopped = true
      if (timer) clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
    async function tick() {
      if (stopped) return
      const video = videoRef.current
      if (video) {
        try {
          const found = await detector.detect(video)
          const hit = found.find((f) => f.rawValue.startsWith('xrplbench:'))
          if (hit && !stopped) {
            stop()
            setScanning(false)
            handoff.current(hit.rawValue)
            return
          }
        } catch {
          // A frame that cannot be read is skipped.
        }
      }
      // No video element yet is a frame to wait for, not the end of the scan.
      if (!stopped) timer = setTimeout(() => void tick(), 250)
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const video = videoRef.current
        if (video) {
          video.srcObject = s
          void video.play().catch(() => {})
        }
        void tick()
      })
      .catch(() => {
        // A rejection that lands after stop or unmount is not news.
        if (stopped) return
        setCameraError('The camera could not be opened. Paste the text instead.')
        setScanning(false)
      })
    return stop
  }, [scanning])

  function toggle() {
    setCameraError(null)
    setScanning((s) => !s)
  }

  function usePasted() {
    const text = pasteRef.current?.value.trim() ?? ''
    if (!text) {
      setPasteError(true)
      return
    }
    setPasteError(false)
    onPayload(text)
    if (pasteRef.current) pasteRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-2" data-testid="qr-scanner">
      {canScan ? (
        <>
          <Button variant="outline" size="sm" onClick={toggle}>
            {scanning ? 'Stop the camera' : `Scan ${label} with the camera`}
          </Button>
          {scanning && <video ref={videoRef} muted playsInline className="max-h-56 w-full rounded-md bg-black" />}
          {cameraError && <p role="status" className="text-xs">{cameraError}</p>}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">This browser cannot scan a QR code, so paste the text of {label} instead.</p>
      )}
      <Label htmlFor="qr-paste">Or paste the text of {label}</Label>
      <textarea
        id="qr-paste"
        ref={pasteRef}
        rows={3}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={pasteError ? true : undefined}
        aria-describedby={pasteError ? 'qr-paste-error' : undefined}
        className="w-full rounded-md border border-input bg-background px-2.5 py-1 font-data text-[0.8125rem] shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.14)] aria-invalid:border-destructive"
      />
      {pasteError && <p id="qr-paste-error" className="text-xs">Paste the text first.</p>}
      <Button variant="outline" size="sm" onClick={usePasted}>
        Use the pasted text
      </Button>
    </div>
  )
}
