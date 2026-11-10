import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SCAN_COMPLETE, scanProgressWords } from '@/lib/animated-qr-words'
import { CODE_UNREADABLE, MAX_TEXT_LENGTH } from '@/lib/qr-codec'
import { ScanSession, isPayloadText, quarterOf } from '@/lib/qr-scan-session'

/** The part of the browser's `BarcodeDetector` this uses (not in `lib.dom`). */
interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
type DetectorCtor = new (options: { formats: string[] }) => Detector

function detectorCtor(): DetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  return ctor && typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' ? ctor : null
}

/** A frame of an animated code: `ur:<type>/<seqNum>-<seqLen>/…`. */
const isFrame = (t: string) => /^ur:[a-z0-9-]+\/[0-9]+-[0-9]+\//i.test(t)

/** Pasted frames read in one press, at most: a paste past this is not read at all. */
const MAX_PASTED_FRAMES = 1024

type Progress = { percent: number } | 'complete' | null

/**
 * Takes a two-device payload (AD-30) from the camera where the browser has
 * `BarcodeDetector` and `getUserMedia`, and always from pasted text. Both hand
 * the same string to `onPayload`; judging it is the codec's job. Holds no
 * payload after it is handed up, and stops the camera when it stops scanning
 * or unmounts.
 *
 * An animated QR (OS-FR-24) is read frame by frame into one `ScanSession`, from
 * the camera or from pasted frames, starting at any frame and surviving missed
 * ones; `onPayload` gets the whole payload once, only when its checksum is
 * right. The progress line (P-65) updates at each frame; screen readers hear it
 * at each quarter only.
 */
export function QrScanner({ onPayload, label }: { onPayload: (text: string) => void; label: string }) {
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [pasteError, setPasteError] = useState(false)
  const [progress, setProgress] = useState<Progress>(null)
  const [unreadable, setUnreadable] = useState(false)
  const session = useRef<ScanSession | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const canScan = detectorCtor() !== null
  const handoff = useRef(onPayload)
  useEffect(() => {
    handoff.current = onPayload
  })

  /** One code read: true when it completed a payload (already handed up). */
  const take = useRef((text: string): boolean => {
    session.current ??= new ScanSession()
    const wasCollecting = session.current.collecting
    const step = session.current.receive(text)
    if (step.status === 'ignored') return false
    if (step.status === 'failed') {
      setProgress(null)
      setUnreadable(true)
      return false
    }
    setUnreadable(false)
    if (step.status === 'progress') {
      setProgress({ percent: step.percent })
      return false
    }
    setProgress(wasCollecting ? 'complete' : null)
    handoff.current(step.text)
    return true
  })

  useEffect(
    () => () => {
      // Nothing read is kept past the plate.
      session.current?.reset()
    },
    [],
  )

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
          for (const f of found) {
            if (stopped || !isPayloadText(f.rawValue)) continue
            // The camera stays on through the frames of an animated code; a whole payload stops it.
            if (take.current(f.rawValue)) {
              stop()
              setScanning(false)
              return
            }
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
    if (pasteRef.current) pasteRef.current.value = ''
    // A hand-up from a paste ends the scan: the camera must not hand the same payload up again.
    const ended = () => {
      setScanning(false)
      session.current?.reset()
    }
    // Pasted frames of an animated code (one or several) join the session; anything else is judged whole by the screen.
    const tokens = text.split(/\s+/)
    if (tokens.every(isFrame) && tokens.some(isPayloadText)) {
      if (text.length > MAX_TEXT_LENGTH || tokens.length > MAX_PASTED_FRAMES) {
        setUnreadable(true)
        return
      }
      for (const t of tokens) {
        if (take.current(t)) return ended()
      }
      return
    }
    ended()
    onPayload(text)
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
      {progress !== null && (
        <p aria-hidden="true" className="font-data text-xs" data-testid="scan-progress">
          {progress === 'complete' ? SCAN_COMPLETE : scanProgressWords(progress.percent)}
        </p>
      )}
      {/* Always mounted, so its first text is announced; it changes only when a quarter is passed, not every frame. */}
      <p role="status" className="sr-only" data-testid="scan-status">
        {progress === null ? '' : progress === 'complete' ? SCAN_COMPLETE : scanProgressWords(quarterOf(progress.percent))}
      </p>
      {unreadable && (
        <p role="alert" className="text-xs">
          {CODE_UNREADABLE}
        </p>
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
        className="w-full rounded-md border border-input bg-background px-2.5 py-1 font-data text-[0.8125rem] pointer-coarse:text-base shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.14)] aria-invalid:border-destructive"
      />
      {pasteError && <p id="qr-paste-error" className="text-xs">Paste the text first.</p>}
      <Button variant="outline" size="sm" onClick={usePasted}>
        Use the pasted text
      </Button>
    </div>
  )
}
