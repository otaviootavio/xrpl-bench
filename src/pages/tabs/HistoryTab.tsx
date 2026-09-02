import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AddressLink, TxLink } from '@/components/wallet/AddressLink'
import { TxStatusBadge } from '@/components/wallet/TxStatusBadge'
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
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useAccountTxHistory(network, wallet?.address ?? null)

  if (!wallet) return <p className="text-muted-foreground">No active wallet.</p>

  const allItems = data?.pages.flatMap((p) => p.items) ?? []
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
        {!isLoading && items.length === 0 && (
          <div className="flex flex-col items-start gap-1">
            {allItems.length > 0 && filter !== 'all' ? (
              <>
                <p className="text-sm font-medium">No {filter} transactions loaded yet</p>
                <Button variant="outline" size="sm" className="mt-1" onClick={() => setFilter('all')}>
                  Show all transactions
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">No transactions yet</p>
                <p className="text-sm text-muted-foreground">
                  Payments this account sends or receives will appear here once the ledger validates them.
                </p>
              </>
            )}
          </div>
        )}
        {items.map((tx) => (
          <div key={tx.hash} className="panel-plate rounded-md p-3">
            <button
              className="flex w-full items-center justify-between gap-2 rounded-sm text-left"
              aria-expanded={expanded === tx.hash}
              onClick={() => setExpanded(expanded === tx.hash ? null : tx.hash)}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-legend text-sm font-semibold uppercase tracking-[0.09em]">{tx.direction}</span>
                  {/* Non-Payment types (e.g. the wallet's own TrustSet) are
                      listed too, so name the type when it isn't a payment. */}
                  {tx.type !== 'Payment' && <span className="text-xs text-muted-foreground">{tx.type}</span>}
                  <TxStatusBadge resultCode={tx.resultCode} validated={tx.validated} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {tx.date ? new Date(tx.date * 1000).toLocaleString() : 'Date unknown'}
                </div>
              </div>
              <div className="shrink-0 text-right font-data text-base tracking-tight">
                {tx.amountDrops
                  ? `${tx.amountIsUpperBound ? '≤ ' : ''}${formatXrp(tx.amountDrops)}`
                  : tx.amountIssued
                    ? `${tx.amountIsUpperBound ? '≤ ' : ''}${formatAmountString(tx.amountIssued.value)} ${displayCurrencyCode(tx.amountIssued.currency)}`
                    : '—'}
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
                    a colour-only tint. */}
                {tx.amountIsUpperBound && (
                  <Alert variant="warning" className="mt-2.5">
                    <AlertTitle>Delivered amount is an upper bound</AlertTitle>
                    <AlertDescription>
                      The ledger could not report the exact delivered amount for this transaction, so the figure above is a
                      maximum — less may have actually arrived.
                    </AlertDescription>
                  </Alert>
                )}
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
