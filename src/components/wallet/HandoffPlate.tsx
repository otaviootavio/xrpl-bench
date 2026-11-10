import { useId, useState, type ReactNode, type RefObject } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PayloadQr } from '@/components/wallet/PayloadQr'
import { useWakeLock } from '@/hooks/useWakeLock'
import { WRAPPING_KEYS } from '@/components/wallet/wrapping-keys'
import { BACK, MAKE_THE_CODE_LARGER, QR_ALT, SCAN_COUNT } from '@/lib/offline-round-words'
import { fill } from '@/lib/transmit-words'
import { NETWORKS, type NetworkId } from '@/lib/xrpl/networks'

/**
 * The QR hand-off plate (DESIGN.md `qr-handoff-plate`, EXPERIENCE "QR hand-off
 * plate"): its heading, a row with the Network, the code (one still code or an
 * animated QR, OS-FR-24), then the plate's lines and "Make the code larger"
 * (P-59), which shows the code filling the screen until "Back". The screen stays
 * awake while it is up. No auto-advance: the device cannot know the other side
 * scanned it.
 *
 * `heading` is the plate's title ("Data to sign needed", "Data to sign",
 * "Signed transaction"); it takes focus when the plate arrives (`headingRef`).
 * `scan` is the round's scan count, shown under the code ("Scan 1 of 3"). The
 * image's text alternative names the payload and the Network (owner 2026-11-10).
 */
export function HandoffPlate({
  heading,
  headingRef,
  network,
  text,
  scan,
  children,
}: {
  heading: string
  scan?: 1 | 2 | 3
  headingRef?: RefObject<HTMLHeadingElement | null>
  network: NetworkId
  text: string
  children?: ReactNode
}) {
  const [large, setLarge] = useState(false)
  useWakeLock(true)
  const label = NETWORKS[network].label
  const headingId = useId()
  const alt = fill(QR_ALT, heading.toLowerCase(), label)
  return (
    <section aria-labelledby={headingId} className={`panel-plate flex min-w-0 flex-col gap-3 rounded-md px-4 pb-4 pt-3 ${WRAPPING_KEYS}`}>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-sm font-semibold [overflow-wrap:anywhere]">
        {heading}
      </h2>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-foreground">{label}</span>
        {network === 'mainnet' && <Badge variant="warning">Real funds</Badge>}
        {network === 'devnet' && <Badge variant="warning">Not stable</Badge>}
      </div>
      <PayloadQr text={text} alt={alt} />
      {scan !== undefined && <p className="text-xs text-muted-foreground">{fill(SCAN_COUNT, scan)}</p>}
      {children}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => setLarge(true)}>
          {MAKE_THE_CODE_LARGER}
        </Button>
      </div>
      {large && <LargeCode text={text} alt={alt} onBack={() => setLarge(false)} />}
    </section>
  )
}

/**
 * The code at the size of the screen (P-59); "Back" returns. Sized by CSS, so it
 * follows a rotation or a resize: the smaller of the viewport's width and height
 * less a reserve for the dialog's padding, its close control, an animated code's
 * keys and caption, and "Back". Drawn large once and scaled down.
 */
const LARGE_CODE_STYLE = { width: 'min(calc(100vw - 4rem), calc(100dvh - 17rem))', minWidth: '10rem', height: 'auto' } as const

function LargeCode({ text, alt, onBack }: { text: string; alt: string; onBack: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onBack()}>
      <DialogContent aria-describedby={undefined} className="max-w-[min(100vw,56rem)]">
        <DialogTitle className="sr-only">{MAKE_THE_CODE_LARGER}</DialogTitle>
        <div className="flex min-w-0 flex-col items-center gap-3 pt-6">
          {/* Below the close control, which would otherwise sit over a corner of the code. */}
          <PayloadQr text={text} size={720} alt={alt} imgStyle={LARGE_CODE_STYLE} />
          <Button type="button" variant="outline" onClick={onBack}>
            {BACK}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
