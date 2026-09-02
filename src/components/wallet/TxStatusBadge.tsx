import { StatusLegend, type LampTone } from '@/components/ui/lamp'

/**
 * A transaction's result, as a status lamp and its legend.
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
 *
 * `whitespace-nowrap` is this call site's own: these legends carry a bracketed
 * result code, and `tecUNFUNDED_PAYMENT` breaking across two lines would read
 * as two codes. Most legends are one word and should wrap normally, so the
 * shared component does not assume it.
 */
function Status({ tone, children }: { tone: LampTone; children: React.ReactNode }) {
  return (
    <StatusLegend tone={tone} className="whitespace-nowrap">
      {children}
    </StatusLegend>
  )
}

export function TxStatusBadge({ resultCode, validated }: { resultCode?: string; validated: boolean }) {
  if (!validated) return <Status tone="neutral">Pending</Status>
  if (resultCode === 'tesSUCCESS') return <Status tone="live">Validated</Status>
  if (resultCode === 'expired') return <Status tone="caution">Expired — not applied</Status>
  if (resultCode?.startsWith('tec')) return <Status tone="caution">Failed — fee charged ({resultCode})</Status>
  return <Status tone="alert">Failed ({resultCode})</Status>
}
