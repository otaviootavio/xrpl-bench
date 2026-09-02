import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { TransactionStream } from 'xrpl'
import { getXrplClient } from '@/lib/xrpl/client'
import type { NetworkId } from '@/lib/xrpl/networks'

/**
 * Real-time updates via the XRPL WebSocket `subscribe` stream — this is
 * what actually fixes "on-chain updates don't trigger a live update"
 * (bug report): polling alone left History never refreshing for
 * externally-caused transactions, and Balances/Tokens only refreshed while
 * their tab happened to be mounted. This hook is mounted once at the Main
 * level (regardless of which tab is open) and invalidates every query keyed
 * on this account the instant a transaction affecting it validates.
 *
 * This is a plain WebSocket side effect, not a ledger *read* — it stays a
 * `useEffect` rather than a TanStack Query hook (docs/decisions.md
 * guardrail #1 is about reads, not about subscribing to a push stream).
 */
export function useAccountLiveUpdates(network: NetworkId, address: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!address) return
    let cancelled = false

    function invalidateAccountQueries() {
      queryClient.invalidateQueries({ queryKey: ['accountState', network, address] })
      queryClient.invalidateQueries({ queryKey: ['trustLines', network, address] })
      queryClient.invalidateQueries({ queryKey: ['accountTx', network, address] })
      queryClient.invalidateQueries({ queryKey: ['incomingPaymentWatch', network, address] })
    }

    function handleTransaction(event: TransactionStream) {
      // xrpl.js's default API version puts the transaction under `tx_json`
      // (the same `DeliverMax`-style v2 shape as account_tx — see
      // lib/xrpl/reads.ts); `transaction` is the older v1 field name.
      const tx = event.tx_json ?? event.transaction
      if (!tx) return
      if (tx.Account === address || tx.Destination === address) {
        invalidateAccountQueries()
        return
      }
      // The account can also be affected without being sender or destination
      // — e.g. a payment that ripples through one of its trust lines. The
      // metadata is authoritative about which ledger entries actually moved.
      const affected = (event.meta as any)?.AffectedNodes
      if (Array.isArray(affected) && affectsAddress(affected, address as string)) {
        invalidateAccountQueries()
      }
    }

    let subscribedClient: Awaited<ReturnType<typeof getXrplClient>> | null = null

    getXrplClient(network).then(async (client) => {
      if (cancelled) return
      subscribedClient = client
      client.on('transaction', handleTransaction)
      try {
        await client.request({ command: 'subscribe', accounts: [address] })
      } catch {
        // Subscription failure isn't fatal — the existing refetchInterval
        // polling on each hook remains as a fallback.
      }
    })

    return () => {
      cancelled = true
      // Only tear down a connection that already exists — calling
      // getXrplClient here would reconnect a closed socket purely to
      // unsubscribe from it.
      const client = subscribedClient
      if (!client) return
      client.off('transaction', handleTransaction)
      if (!client.isConnected()) return
      client.request({ command: 'unsubscribe', accounts: [address] }).catch(() => {
        // Best-effort — the connection may already be closing.
      })
    }
  }, [network, address, queryClient])
}

/** True if any affected ledger entry belongs to this account — covers
 * AccountRoot changes and RippleState (trust line) entries on either side. */
function affectsAddress(affectedNodes: any[], address: string): boolean {
  return affectedNodes.some((node) => {
    const entry = node.ModifiedNode ?? node.CreatedNode ?? node.DeletedNode
    const fields = entry?.FinalFields ?? entry?.NewFields ?? entry?.PreviousFields
    if (!fields) return false
    if (fields.Account === address) return true
    return fields.LowLimit?.issuer === address || fields.HighLimit?.issuer === address
  })
}
