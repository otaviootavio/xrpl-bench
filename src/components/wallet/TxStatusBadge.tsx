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
 * (docs/decisions.md §5.5). `'unknown'` is the sentinel for a validated
 * transaction whose result could not be read (History and Send both use it).
 *
 * Only the bracketed result code is unbreakable: `tecUNFUNDED_PAYMENT` split
 * across two lines would read as two codes. The words before it ("Failed — fee
 * charged") wrap normally, so on a narrow row the code moves to its own line as
 * a unit instead of pushing the row wider than its box. The text sits in one
 * span so it flows as a single run beside the lamp; loose text runs inside the
 * legend's `inline-flex` would each become a flex item and could not wrap onto
 * a line below one another.
 */
function Status({ tone, code, breakableCode, children }: { tone: LampTone; code?: string; breakableCode?: boolean; children: React.ReactNode }) {
  return (
    <StatusLegend tone={tone}>
      <span className={breakableCode ? 'min-w-0' : undefined}>
        {children}
        {code !== undefined && (
          <>
            {' '}
            <span className={breakableCode ? '[overflow-wrap:anywhere]' : 'whitespace-nowrap'}>({code})</span>
          </>
        )}
      </span>
    </StatusLegend>
  )
}

/**
 * `breakableCode` (offline signing story 11): inside a narrow plate (the Online key plate,
 * 320 px at 200% text) the code may break inside itself, and only when it alone is wider than
 * its box; it still moves to its own line as a unit first. Off by default: History keeps the
 * unbreakable code.
 */
export function TxStatusBadge({ resultCode, validated, breakableCode }: { resultCode?: string; validated: boolean; breakableCode?: boolean }) {
  if (!validated) return <Status tone="neutral">Pending</Status>
  if (resultCode === 'tesSUCCESS') return <Status tone="live">Validated</Status>
  if (resultCode === 'expired') return <Status tone="caution">Expired — not applied</Status>
  // Validated, but the ledger's answer carried no readable result: never
  // "Failed", which would invite a resend that pays twice.
  if (resultCode === 'unknown') return <Status tone="caution">Result not read</Status>
  if (resultCode?.startsWith('tec')) return <Status tone="caution" code={resultCode} breakableCode={breakableCode}>Failed — fee charged</Status>
  return <Status tone="alert" code={resultCode ?? ''} breakableCode={breakableCode}>Failed</Status>
}
