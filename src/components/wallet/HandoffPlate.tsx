import { useState, type ReactNode, type RefObject } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PayloadQr } from '@/components/wallet/PayloadQr'
import { useWakeLock } from '@/hooks/useWakeLock'
import { WRAPPING_KEYS } from '@/components/wallet/wrapping-keys'
import { BACK, MAKE_THE_CODE_LARGER } from '@/lib/offline-round-words'
import { NETWORKS, type NetworkId } from '@/lib/xrpl/networks'

/**
 * The QR hand-off plate (DESIGN.md `qr-handoff-plate`, EXPERIENCE "QR hand-off
 * plate"): its heading, a row with the Network, the code (one still code or an
 * animated QR, OS-FR-24), then the plate's lines and "Make the code larger"
 * (P-59), which shows the code filling the screen until "Back". The screen stays
 * awake while it is up. No auto-advance: the device cannot know the other side
 * scanned it.
 *
 * `heading` is the plate's title where an approved one exists ("Data to sign
 * needed"), else the plate's first approved line. It takes focus when the plate
 * arrives (`headingRef`).
 */
export function HandoffPlate({
  heading,
  headingRef,
  network,
  text,
  children,
}: {
  heading: string
  headingRef?: RefObject<HTMLHeadingElement | null>
  network: NetworkId
  text: string
  children?: ReactNode
}) {
  const [large, setLarge] = useState(false)
  useWakeLock(true)
  const label = NETWORKS[network].label
  return (
    <section aria-label={heading} className={`panel-plate flex min-w-0 flex-col gap-3 rounded-md px-4 pb-4 pt-3 ${WRAPPING_KEYS}`}>
      <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold [overflow-wrap:anywhere]">
        {heading}
      </h2>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-foreground">{label}</span>
        {network === 'mainnet' && <Badge variant="warning">Real funds</Badge>}
        {network === 'devnet' && <Badge variant="warning">Not stable</Badge>}
      </div>
      <PayloadQr text={text} />
      {children}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => setLarge(true)}>
          {MAKE_THE_CODE_LARGER}
        </Button>
      </div>
      {large && <LargeCode text={text} onBack={() => setLarge(false)} />}
    </section>
  )
}

/** The code at the size of the screen (P-59); "Back" returns. */
function LargeCode({ text, onBack }: { text: string; onBack: () => void }) {
  // The largest square that fits with the key below it, never wider than the viewport.
  const size = Math.max(160, Math.floor(Math.min(window.innerWidth - 48, window.innerHeight - 160)))
  return (
    <Dialog open onOpenChange={(open) => !open && onBack()}>
      <DialogContent aria-describedby={undefined} className="max-w-[min(100vw,56rem)]">
        <DialogTitle className="sr-only">{MAKE_THE_CODE_LARGER}</DialogTitle>
        <div className="flex min-w-0 flex-col items-center gap-3">
          <PayloadQr text={text} size={size} />
          <Button type="button" variant="outline" onClick={onBack}>
            {BACK}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
