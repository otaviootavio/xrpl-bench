import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { retireNode, verifyNode } from '@/lib/xrpl/client'
import { builtInNodes, NETWORKS } from '@/lib/xrpl/networks'
import { invalidateAccountScoped, invalidateNetworkScoped } from '@/lib/xrpl/query-keys'
import { listWallets, setWalletNode, type WalletMeta } from '@/lib/crypto/keystore'
import { useAppStore } from '@/store/app-store'
import { toast } from '@/lib/notify'

/**
 * Which Node a Wallet reads and submits through (FR-61, AD-20): the network's
 * built-in Nodes, or one the user declares. A declared Node is stored on this
 * Wallet only, and only after `server_info` reports this Wallet's network id —
 * and it is checked again on every connect, so saving is not the last word.
 * It has no failover: if it is down, reads fail and say so.
 */
export function WalletNodeSection({ wallet }: { wallet: WalletMeta }) {
  const setWallets = useAppStore((s) => s.setWallets)
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const inputId = `node-${wallet.id}`

  async function refreshAfterChange() {
    // The old custom socket is closed (a write holding it closes it on release).
    if (wallet.node) retireNode(wallet.network, wallet.node)
    setWallets(await listWallets(wallet.network))
    // The same Account answered by another Node: drop what the old one said,
    // the ledger-wide figures included.
    await invalidateAccountScoped(queryClient, wallet.network, wallet.address)
    await invalidateNetworkScoped(queryClient, wallet.network)
  }

  async function handleTestAndSave() {
    const url = draft.trim()
    setReason(null)
    setBusy(true)
    try {
      await verifyNode(wallet.network, url)
      await setWalletNode(wallet.id, url)
    } catch (err: unknown) {
      // Nothing was stored: the reason is shown, and the Wallet keeps the Node
      // it had.
      setReason(err instanceof Error ? err.message : 'This Node could not be checked.')
      setBusy(false)
      return
    }
    // From here the Node IS stored: a failed refresh must not say it was not.
    setDraft('')
    try {
      await refreshAfterChange()
      toast.success('Node saved for this wallet.')
    } catch {
      toast.error('Node saved, but the screen could not refresh. Reload the app to see it.')
    } finally {
      setBusy(false)
    }
  }

  async function handleUseBuiltIn() {
    setBusy(true)
    try {
      await setWalletNode(wallet.id, undefined)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not change the Node.')
      setBusy(false)
      return
    }
    setReason(null)
    try {
      await refreshAfterChange()
      toast.success('This wallet now uses the built-in Nodes.')
    } catch {
      toast.error('Node changed, but the screen could not refresh. Reload the app to see it.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 grid gap-1.5 text-xs">
      <p className="text-muted-foreground">
        Node: {wallet.node ? `Custom — ${wallet.node}` : `Built-in — ${builtInNodes(wallet.network).join(', ')}`}
      </p>
      <Label htmlFor={inputId}>Custom Node for {NETWORKS[wallet.network].label} (wss://)</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="wss://node.example.com"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          className="min-w-0 flex-1"
        />
        <Button size="sm" variant="outline" onClick={handleTestAndSave} disabled={busy || draft.trim() === ''}>
          {busy ? 'Checking…' : 'Test and save'}
        </Button>
        {wallet.node && (
          <Button size="sm" variant="outline" onClick={handleUseBuiltIn} disabled={busy}>
            Use built-in Nodes
          </Button>
        )}
      </div>
      {reason && (
        <p role="alert" className="text-destructive">
          Not saved. {reason}
        </p>
      )}
    </div>
  )
}
