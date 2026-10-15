import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusLegend } from '@/components/ui/lamp'
import { useAccountState } from '@/hooks/useAccountState'
import { usePrompts } from '@/hooks/usePrompts'
import type { WalletMeta } from '@/lib/crypto/keystore'
import { masterKeyAction, masterKeyStatus, setMasterKey, type MasterKeyResult, type MasterKeyStatus } from '@/lib/master-key'
import { NETWORKS } from '@/lib/xrpl/networks'
import { useWalletOpenKey } from '@/store/app-store'

const WORDS: Record<MasterKeyStatus, { tone: 'live' | 'caution' | 'neutral'; text: string }> = {
  on: { tone: 'live', text: 'Master key: on. The ledger shows it can sign for this account' },
  off: { tone: 'caution', text: 'Master key: off. The ledger shows only the Regular Key can sign for this account' },
  unknown: { tone: 'neutral', text: 'Master key: unknown. The ledger could not be read, or the account is not on it' },
}

/**
 * The Account's master-key state and the one action for this Wallet's role
 * (FR-77, AD-29). Renders only: what is offered and why not is
 * `lib/master-key.ts`, the flow is `setMasterKey`, and nothing is remembered.
 * Mount only for a Wallet whose lock is open (AD-26).
 */
export function MasterKeyControl({ wallet }: { wallet: WalletMeta }) {
  const queryClient = useQueryClient()
  const prompts = usePrompts()
  const openKey = useWalletOpenKey(wallet.id)
  const account = useAccountState(wallet.network, wallet.address, wallet.node)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MasterKeyResult | null>(null)

  const readFailed = account.isError
  const state = readFailed ? null : account.data
  // A submission whose re-read failed leaves the status unknown, whatever is cached.
  const unconfirmed = result?.status === 'unconfirmed'
  const status = unconfirmed ? 'unknown' : masterKeyStatus(state)
  const { action, reason } = masterKeyAction(wallet, unconfirmed ? null : state, readFailed || unconfirmed)
  const turningOff = action === 'off'
  const words = WORDS[status]
  const regularKey = state?.exists ? state.regularKey : undefined
  const mainnet = wallet.network === 'mainnet'
  const reasonId = `master-key-reason-${wallet.id}`

  function open() {
    if (busy || reason) return
    setResult(null)
    setConfirming(true)
  }

  async function checkAgain() {
    if (busy) return
    setBusy(true)
    try {
      const r = await account.refetch()
      if (!r.isError && r.data) setResult(null)
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (busy) return
    setBusy(true)
    try {
      const r = await setMasterKey(wallet.id, !turningOff, { queryClient, openKey: openKey ?? undefined, prompts, confirmed: true })
      setResult(r)
      setConfirming(false)
    } catch (err: unknown) {
      // Thrown before anything was sent (setMasterKey reports a send it is unsure of itself).
      setResult({ status: 'refused', reason: err instanceof Error ? err.message : 'Could not change the master key.' })
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground" data-testid="master-key-control">
      <StatusLegend tone={words.tone}>{words.text}</StatusLegend>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-disabled={busy || reason ? true : undefined}
          aria-describedby={reason ? reasonId : undefined}
          onClick={open}
        >
          {turningOff ? 'Turn master key off' : 'Turn master key on'}
        </Button>
        {unconfirmed && (
          <Button variant="outline" size="sm" onClick={() => void checkAgain()} aria-disabled={busy ? true : undefined}>
            Check again
          </Button>
        )}
      </div>
      {reason && <p id={reasonId}>{reason}</p>}
      {result && result.status !== 'validated' && <p role="status">{result.reason}</p>}
      {result?.status === 'validated' && (
        <p role="status">Validated. The ledger now shows the master key as {result.state}.</p>
      )}

      <Dialog open={confirming} onOpenChange={(o) => !o && !busy && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{turningOff ? 'Turn the master key off?' : 'Turn the master key on?'}</DialogTitle>
            <DialogDescription>
              {wallet.label} on {NETWORKS[wallet.network].label}
              {mainnet && ' — real funds'}.
            </DialogDescription>
          </DialogHeader>
          {turningOff ? (
            <div className="flex flex-col gap-2 text-sm">
              <p>
                After this, the master key, and any Controlling Wallet that holds it, can no longer sign for this account. Only the
                Regular Key can{regularKey && <>: <span className="break-all font-mono">{regularKey}</span></>}.
              </p>
              <p>
                If you lose the Regular Key (for a passkey, losing the passkey), you lose the funds in this account: nothing else can
                sign. You can turn the master key back on, but only from the wallet that signs as the Regular Key.
              </p>
            </div>
          ) : (
            <p className="text-sm">
              After this, the master key can sign for this account again. This change is signed by the Regular Key.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant={turningOff ? 'danger' : 'default'} onClick={() => void confirm()} aria-disabled={busy ? true : undefined}>
              {busy ? 'Working…' : turningOff ? 'Turn master key off' : 'Turn master key on'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
