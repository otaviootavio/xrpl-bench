import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from '@/lib/notify'
import { fetchAccountTx } from '@/lib/xrpl/reads'
import { formatXrp, formatAmountString, displayCurrencyCode } from '@/lib/xrpl/money'
import type { NetworkId } from '@/lib/xrpl/networks'

/** Cap on remembered hashes — the seen-set only needs to cover the most
 * recent page of history to suppress duplicates, so it must not grow without
 * bound for the lifetime of the session. */
const MAX_SEEN = 500

/** receiving-payments.md US-3/US-4: in-app notification when a payment
 * lands, distinguishing XRP vs. token. Polls account_tx via TanStack Query
 * (never a raw useEffect fetch — docs/decisions.md guardrail #1) and diffs
 * against the last-seen hash to avoid re-notifying on every poll. */
export function useIncomingPaymentNotifications(network: NetworkId, address: string | null) {
  const seenHashes = useRef<Set<string>>(new Set())
  const isFirstLoad = useRef(true)
  // The seen-set and first-load flag belong to ONE account on ONE network.
  // Without this, switching wallet or network replayed the newly selected
  // account's entire existing history as "Received" toasts, because
  // isFirstLoad was already false and the seen-set held the old account's
  // hashes.
  const watchKey = useRef<string | null>(null)

  const query = useQuery({
    queryKey: ['incomingPaymentWatch', network, address],
    queryFn: () => fetchAccountTx(network, address as string),
    enabled: !!address,
    // useAccountLiveUpdates invalidates this key the moment a transaction
    // affecting the account validates, so this poll is only a fallback for a
    // dropped WebSocket. A tight interval here just duplicated the account_tx
    // traffic the history query is already generating.
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (!address) return
    const key = `${network}:${address}`
    if (watchKey.current !== key) {
      watchKey.current = key
      seenHashes.current = new Set()
      isFirstLoad.current = true
    }
  }, [network, address])

  useEffect(() => {
    if (!query.data || !address) return
    // Ignore data that arrived for a previous account before the reset above.
    if (watchKey.current !== `${network}:${address}`) return

    const incoming = query.data.items.filter((tx) => tx.direction === 'received' && tx.validated && tx.type === 'Payment')

    if (isFirstLoad.current) {
      incoming.forEach((tx) => seenHashes.current.add(tx.hash))
      isFirstLoad.current = false
      return
    }

    for (const tx of incoming) {
      if (seenHashes.current.has(tx.hash)) continue
      seenHashes.current.add(tx.hash)
      const amountLabel = tx.amountDrops
        ? formatXrp(tx.amountDrops)
        : tx.amountIssued
          ? `${formatAmountString(tx.amountIssued.value)} ${displayCurrencyCode(tx.amountIssued.currency)}`
          : 'a payment'
      const prefix = tx.amountIsUpperBound ? 'up to ' : ''
      toast.success(`Received ${prefix}${amountLabel}`, { description: `from ${tx.counterparty}` })
    }

    if (seenHashes.current.size > MAX_SEEN) {
      seenHashes.current = new Set([...seenHashes.current].slice(-MAX_SEEN))
    }
  }, [query.data, network, address])
}
