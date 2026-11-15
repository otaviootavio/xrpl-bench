import { useEffect, useRef, useState } from 'react'
import { addressOfScan } from '@/lib/address-of-scan'
import { Button } from '@/components/ui/button'
import { SCAN_AN_ADDRESS, SHIPPED_KEYS, STOP_THE_CAMERA } from '@/lib/offline-round-words'

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
 * "Scan an address with the camera" (P-57): reads a plain address QR on this device
 * and hands it to the address field (OS-FR-21: a new Regular Key address is typed or
 * scanned on the offline device, never taken from the Transmitter). The field's own
 * validation judges it like a typed one. Where the browser cannot read a code with
 * the camera, nothing is shown and the field is the way in. The camera stops on a
 * read, on Stop the camera and on unmount.
 */
export function AddressScan({ onAddress }: { onAddress: (address: string) => void }) {
  const [scanning, setScanning] = useState(false)
  const [failed, setFailed] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const handoff = useRef(onAddress)
  useEffect(() => {
    handoff.current = onAddress
  })

  useEffect(() => {
    if (!scanning) return
    const Ctor = detectorCtor()
    if (!Ctor) return
    let stopped = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      stopped = true
      if (timer) clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
    let detector: Detector
    try {
      detector = new Ctor({ formats: ['qr_code'] })
    } catch {
      queueMicrotask(() => {
        setFailed(true)
        setScanning(false)
      })
      return
    }
    async function tick() {
      if (stopped) return
      const video = videoRef.current
      if (video) {
        try {
          for (const f of await detector.detect(video)) {
            const address = stopped ? null : addressOfScan(f.rawValue)
            if (address) {
              stop()
              setScanning(false)
              handoff.current(address)
              return
            }
          }
        } catch {
          // A frame that cannot be read is skipped.
        }
      }
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
        if (stopped) return
        setFailed(true)
        setScanning(false)
      })
    return stop
  }, [scanning])

  if (detectorCtor() === null) return null
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setFailed(false)
          setScanning((s) => !s)
        }}
      >
        {scanning ? STOP_THE_CAMERA : SCAN_AN_ADDRESS}
      </Button>
      {scanning && <video ref={videoRef} muted playsInline className="max-h-56 w-full rounded-md bg-black" />}
      {failed && (
        <p role="status" className="text-xs">
          {SHIPPED_KEYS.cameraFailed}
        </p>
      )}
    </div>
  )
}
