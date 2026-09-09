import { StatusLegend } from '@/components/ui/lamp'
import { Button } from '@/components/ui/button'
import { AddressLink } from './AddressLink'
import { displayCurrencyCode, formatAmountString } from '@/lib/xrpl/money'
import type { TrustLine } from '@/lib/xrpl/reads'

/**
 * One trust line, read as a panel row: the currency as the engraved legend, the
 * held amount as the reading, the issuer and limit as the fine print beneath.
 */
export function TrustLineRow({
  line,
  onRemove,
  onEditLimit,
}: {
  line: TrustLine
  onRemove?: () => void
  onEditLimit?: () => void
}) {
  // A non-zero balance blocks closing the line. The control stays rendered and
  // focusable with the reason in visible text — previously the call site simply
  // omitted `onRemove`, so a holder saw no Close button and no explanation, and
  // the component's own `title` fallback was unreachable on a `disabled`
  // button. See docs/decisions.md §6.4.
  const hasBalance = line.balance !== '0'
  const blockedReason = hasBalance ? 'Balance must be zero to close' : undefined
  // Stable per-row id for aria-describedby, from the line's natural key.
  const rowId = `tl-${line.currency}-${line.account}`
  return (
    <div className="panel-plate flex flex-wrap items-start justify-between gap-x-4 gap-y-3 rounded-md p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-data text-sm font-medium tracking-tight">{displayCurrencyCode(line.currency)}</span>
          {line.freezePeer && (
            <StatusLegend tone="alert">Frozen by issuer</StatusLegend>
          )}
          {line.freeze && (
            <StatusLegend tone="caution">Frozen by you</StatusLegend>
          )}
        </div>
        <p className="mt-1 font-data text-xl leading-tight tracking-tight">{formatAmountString(line.balance)}</p>
        <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <dt className="panel-legend">Limit</dt>
            <dd className="font-data tracking-tight">{formatAmountString(line.limit)}</dd>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="panel-legend">Issuer</dt>
            <dd className="min-w-0">
              <AddressLink address={line.account} />
            </dd>
          </div>
        </dl>
      </div>
      <div className="flex shrink-0 flex-wrap items-start gap-2">
        {onEditLimit && (
          <Button variant="outline" size="sm" onClick={onEditLimit}>
            Edit limit
          </Button>
        )}
        {onRemove && (
          <div className="flex flex-col items-end gap-1">
            <Button
              variant="outline"
              size="sm"
              aria-disabled={hasBalance}
              aria-describedby={blockedReason ? `${rowId}-blocked` : undefined}
              onClick={() => {
                if (!hasBalance) onRemove()
              }}
              className={hasBalance ? 'opacity-55' : undefined}
            >
              Close
            </Button>
            {blockedReason && (
              <span id={`${rowId}-blocked`} className="max-w-[11rem] text-right text-xs text-muted-foreground">
                {blockedReason}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
