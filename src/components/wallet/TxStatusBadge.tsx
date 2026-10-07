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
 * Only the bracketed result code is unbreakable: `tecUNFUNDED_PAYMENT` split
 * across two lines would read as two codes. The words before it ("Failed — fee
 * charged") wrap normally, so on a narrow row the code moves to its own line as
 * a unit instead of pushing the row wider than its box. The text sits in one
 * span so it flows as a single run beside the lamp; loose text runs inside the
 * legend's `inline-flex` would each become a flex item and could not wrap onto
 * a line below one another.
 */
function Status({ tone, code, children }: { tone: LampTone; code?: string; children: React.ReactNode }) {
  return (
    <StatusLegend tone={tone}>
      <span>
        {children}
        {code !== undefined && (
          <>
            {' '}
            <span className="whitespace-nowrap">({code})</span>
          </>
        )}
      </span>
    </StatusLegend>
  )
}

export function TxStatusBadge({ resultCode, validated }: { resultCode?: string; validated: boolean }) {
  if (!validated) return <Status tone="neutral">Pending</Status>
  if (resultCode === 'tesSUCCESS') return <Status tone="live">Validated</Status>
  if (resultCode === 'expired') return <Status tone="caution">Expired — not applied</Status>
  if (resultCode?.startsWith('tec')) return <Status tone="caution" code={resultCode}>Failed — fee charged</Status>
  return <Status tone="alert" code={resultCode ?? ''}>Failed</Status>
}
