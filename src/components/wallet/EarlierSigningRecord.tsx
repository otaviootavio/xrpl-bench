import { RECORD_TERMS } from '@/lib/offline-round-words'
import type { SignedRecord } from '@/lib/signed-list'

/** "Signed at" in local time, date and time: a record can be days old. */
function signedAtLabel(at: number): string {
  return new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * The earlier-signing record (DESIGN.md delta `earlier-signing-record`, P-52): a
 * recessed `dl`, read-only, with the Sequence, the full transaction hash in the
 * data face, the valid-until ledger and the time signed. It holds no blob and no
 * key; it is the Wallet's signed list entry as stored (OS-FR-16).
 */
export function EarlierSigningRecord({ record }: { record: SignedRecord }) {
  const rows: Array<[string, string]> = [
    [RECORD_TERMS.sequence, String(record.sequence)],
    [RECORD_TERMS.hash, record.hash],
    [RECORD_TERMS.validUntil, String(record.lastLedgerSequence)],
    [RECORD_TERMS.signedAt, signedAtLabel(record.signedAt)],
  ]
  return (
    <dl className="grid min-w-0 gap-2 rounded-md border border-input bg-background px-3 py-2.5 text-foreground shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.14)]">
      {rows.map(([term, value]) => (
        <div key={term} className="grid min-w-0 gap-0.5">
          <dt className="panel-legend">{term}</dt>
          <dd className="font-data text-[0.8125rem] leading-relaxed tracking-tight [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
