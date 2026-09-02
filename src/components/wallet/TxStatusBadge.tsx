import { Lamp, type LampTone } from '@/components/ui/lamp'
import { cn } from '@/lib/utils'

/**
 * A status lamp with its legend.
 *
 * The panel reports live state with a lit lamp beside a word, not with a filled
 * pill. The word is always present and always specific, so the state never
 * depends on the lamp's colour (WCAG 1.4.1) — the lamp only makes it findable
 * at a glance down a list of rows.
 *
 * `tec*` results deliberately read differently from `tef*`/`tem*`: a `tec` is in
 * a validated ledger and consumed its fee, so the user is told the fee was
 * taken rather than being shown an undifferentiated "Failed"
 * (docs/decisions.md §5.5).
 */
const TONE_TEXT: Record<LampTone, string> = {
  neutral: 'text-muted-foreground',
  live: 'text-text-success',
  caution: 'text-text-warning',
  alert: 'text-text-destructive',
}

function Status({ tone, children }: { tone: LampTone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.1em]',
        TONE_TEXT[tone],
      )}
    >
      <Lamp tone={tone} />
      {children}
    </span>
  )
}

export function TxStatusBadge({ resultCode, validated }: { resultCode?: string; validated: boolean }) {
  if (!validated) return <Status tone="neutral">Pending</Status>
  if (resultCode === 'tesSUCCESS') return <Status tone="live">Validated</Status>
  if (resultCode === 'expired') return <Status tone="caution">Expired — not applied</Status>
  if (resultCode?.startsWith('tec')) return <Status tone="caution">Failed — fee charged ({resultCode})</Status>
  return <Status tone="alert">Failed ({resultCode})</Status>
}
