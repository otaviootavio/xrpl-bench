import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AddressLink, TxLink } from '@/components/wallet/AddressLink'
import { TxStatusBadge } from '@/components/wallet/TxStatusBadge'
import { QueryErrorState } from '@/components/wallet/QueryErrorState'
import { useAppStore, useActiveWallet } from '@/store/app-store'
import { useAccountTxHistory } from '@/hooks/useAccountTxHistory'
import { formatXrp, formatAmountString, displayCurrencyCode } from '@/lib/xrpl/money'
import { describeResultCode } from '@/lib/xrpl/result-codes'

type Filter = 'all' | 'sent' | 'received'

export function HistoryTab() {
  const network = useAppStore((s) => s.network)
  const wallet = useActiveWallet()
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAccountTxHistory(network, wallet?.address ?? null)

  if (!wallet) return <p className="text-muted-foreground">No active wallet.</p>

  const allItems = data?.pages.flatMap((p) => p.items) ?? []

  /**
   * Retry the read that actually failed. With pages already loaded the failure
   * came from `fetchNextPage`, and `refetch` there would clear the error while
   * never fetching the missing page — the list would silently stop short.
   */
  const retryRead = () => (data && data.pages.length > 0 ? fetchNextPage() : refetch())
  const items = filter === 'all' ? allItems : allItems.filter((t) => t.direction === filter)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Transaction History</CardTitle>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList variant="inline">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="received">Received</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isLoading && <Skeleton className="h-32 w-full" />}
        {/* A failed read is not an empty account. Saying "No transactions yet"
            here would state as fact something the app does not know — the worst
            thing this screen can do. The list itself stays rendered when a
            *later* page fails, so a failing "Load more" never takes away
            history the user already has. */}
        {isError && (
          <QueryErrorState
            title="History unavailable"
            description="The transaction history could not be read from the ledger, so this list may be incomplete or empty for a reason that has nothing to do with this account."
            onRetry={retryRead}
          />
        )}
        {!isLoading && items.length === 0 && (
          <div className="flex flex-col items-start gap-1">
            {allItems.length > 0 && filter !== 'all' ? (
              // Accurate whether or not the read failed — rows were loaded, this
              // filter matches none of them — and it carries the only way back
              // to "All", so it must survive an error.
              <>
                <p className="text-sm font-medium">No {filter} transactions loaded yet</p>
                <Button variant="outline" size="sm" className="mt-1" onClick={() => setFilter('all')}>
                  Show all transactions
                </Button>
              </>
            ) : (
              // The false claim. Only ever said when a read actually succeeded.
              !isError && (
                <>
                  <p className="text-sm font-medium">No transactions yet</p>
                  <p className="text-sm text-muted-foreground">
                    Payments this account sends or receives will appear here once the ledger validates them.
                  </p>
                </>
              )
            )}
          </div>
        )}
        {items.map((tx) => (
          <div key={tx.hash} className="panel-plate rounded-md p-3">
            {/* Three lines below `sm`: direction and amount, then the status
                legend on its own full-width line, then the date. A failed row's
                legend carries an unbreakable result code that cannot fit beside
                the amount at 320px, and the amount (with its `≤`) must never be
                pushed off-screen. From `sm` up the grid places the legend back
                beside the direction and centres the amount across both lines,
                as before. DOM order is the same at every width (DESIGN.md). */}
            <button
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-sm text-left sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              aria-expanded={expanded === tx.hash}
              onClick={() => setExpanded(expanded === tx.hash ? null : tx.hash)}
            >
              <div className="flex min-w-0 items-center gap-2 sm:col-start-1 sm:row-start-1">
                <span className="font-legend text-sm font-semibold uppercase tracking-[0.09em]">{tx.direction}</span>
                {/* Non-Payment types (e.g. the wallet's own TrustSet) are
                    listed too, so name the type when it isn't a payment. */}
                {tx.type !== 'Payment' && <span className="text-xs text-muted-foreground">{tx.type}</span>}
              </div>
              <div className="text-right font-data text-base tracking-tight sm:col-start-3 sm:row-span-2 sm:row-start-1">
                {tx.amountDrops
                  ? `${tx.amountIsUpperBound ? '≤ ' : ''}${formatXrp(tx.amountDrops)}`
                  : tx.amountIssued
                    ? `${tx.amountIsUpperBound ? '≤ ' : ''}${formatAmountString(tx.amountIssued.value)} ${displayCurrencyCode(tx.amountIssued.currency)}`
                    : '—'}
              </div>
              <div className="col-span-2 flex min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                <TxStatusBadge resultCode={tx.resultCode} validated={tx.validated} />
              </div>
              <div className="col-span-2 text-xs text-muted-foreground sm:col-start-1 sm:row-start-2">
                {tx.date ? new Date(tx.date * 1000).toLocaleString() : 'Date unknown'}
              </div>
            </button>
            {expanded === tx.hash && (
              <div className="mt-3 border-t border-border pt-3">
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="panel-legend">Hash</dt>
                    <dd className="mt-0.5">
                      <TxLink hash={tx.hash} />
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="panel-legend">Counterparty</dt>
                    <dd className="mt-0.5">
                      <AddressLink address={tx.counterparty} />
                    </dd>
                  </div>
                  {tx.destinationTag !== undefined && (
                    <div>
                      <dt className="panel-legend">Destination tag</dt>
                      <dd className="mt-0.5 font-data text-sm tracking-tight">{tx.destinationTag}</dd>
                    </div>
                  )}
                  {tx.feeDrops && (
                    <div>
                      <dt className="panel-legend">Fee</dt>
                      <dd className="mt-0.5 font-data text-sm tracking-tight">{formatXrp(tx.feeDrops)}</dd>
                    </div>
                  )}
                  {tx.ledgerIndex && (
                    <div>
                      <dt className="panel-legend">Ledger</dt>
                      <dd className="mt-0.5 font-data text-sm tracking-tight">{tx.ledgerIndex}</dd>
                    </div>
                  )}
                </dl>
                <p className="mt-2.5 text-sm leading-snug text-muted-foreground">{describeResultCode(tx.resultCode)}</p>
                {/* The most consequential sentence on this surface: the figure
                    above is only an upper bound. It gets the caution lamp, not
                    a colour-only tint, and is worded by cause — a failed
                    payment delivered nothing, which is a different fact from
                    the ledger not reporting what arrived. */}
                {tx.amountIsUpperBound &&
                  (tx.resultCode && tx.resultCode !== 'tesSUCCESS' ? (
                    <Alert variant="warning" className="mt-2.5">
                      <AlertTitle>This payment failed — nothing was delivered</AlertTitle>
                      <AlertDescription>
                        The figure above is the amount that was requested, not an amount that arrived. No funds moved
                        to the destination.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="warning" className="mt-2.5">
                      <AlertTitle>Delivered amount is an upper bound</AlertTitle>
                      <AlertDescription>
                        The ledger could not report the exact delivered amount for this transaction, so the figure above
                        is a maximum — less may have actually arrived.
                      </AlertDescription>
                    </Alert>
                  ))}
              </div>
            )}
          </div>
        ))}
        {hasNextPage && (
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
