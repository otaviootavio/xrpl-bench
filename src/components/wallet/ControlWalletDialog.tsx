import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { StatusLegend } from '@/components/ui/lamp'
import { AddressLink } from '@/components/wallet/AddressLink'
import { useAccountState } from '@/hooks/useAccountState'
import { usePrompts } from '@/hooks/usePrompts'
import { confirmControl, controlStatus, eligibleTargets, setRegularKey, setRegularKeyBlockedReason, type ControlResult } from '@/lib/control'
import type { WalletMeta } from '@/lib/crypto/keystore'
import { NETWORKS } from '@/lib/xrpl/networks'
import { useWalletOpenKey } from '@/store/app-store'

const STATUS_WORDS = {
  controlled: 'Controlled by the chosen wallet',
  'not-controlled': 'Not controlled by the chosen wallet',
  unknown: 'Unknown: choose a wallet, or the ledger could not be read',
} as const

function usesPasskey(w: WalletMeta): boolean {
  return w.seedMethod === 'passkey-derived' || w.signingCheck === 'passkey'
}

/**
 * Controlling Wallet (FR-75, FR-76): lets another wallet on this device sign for
 * this wallet's Account as its single Regular Key. This component only renders;
 * the flow, the fresh reads and the claim are `lib/control.ts`, and it holds no
 * Seed, key or PIN. The action is `aria-disabled` with its reason in words when
 * the ledger read errored (AD-29), never hidden.
 */
export function ControlWalletDialog({
  controller,
  wallets,
  onClose,
  onControlled,
}: {
  controller: WalletMeta | null
  wallets: readonly WalletMeta[]
  onClose: () => void
  onControlled: (meta: WalletMeta) => void | Promise<void>
}) {
  // True while a key-changing transaction is in flight or the replace confirm is
  // open: dismissing then would hide the outcome or strand the flow.
  const [locked, setLocked] = useState(false)
  return (
    <Dialog open={!!controller} onOpenChange={(o) => !o && !locked && onClose()}>
      {controller && (
        <ControlWalletBody controller={controller} wallets={wallets} onClose={onClose} onControlled={onControlled} onLockedChange={setLocked} />
      )}
    </Dialog>
  )
}

function ControlWalletBody({
  controller,
  wallets,
  onClose,
  onControlled,
  onLockedChange,
}: {
  controller: WalletMeta
  wallets: readonly WalletMeta[]
  onClose: () => void
  onControlled: (meta: WalletMeta) => void | Promise<void>
  onLockedChange: (locked: boolean) => void
}) {
  const queryClient = useQueryClient()
  const prompts = usePrompts()
  const openKey = useWalletOpenKey(controller.id)
  const account = useAccountState(controller.network, controller.address, controller.node)
  const targets = eligibleTargets(controller, wallets)
  const [targetId, setTargetId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ControlResult | null>(null)
  const [replaceKey, setReplaceKey] = useState<string | null>(null)
  const replaceResolver = useRef<((ok: boolean) => void) | null>(null)

  useEffect(() => {
    onLockedChange(busy || replaceKey !== null)
  }, [busy, replaceKey, onLockedChange])
  useEffect(
    () => () => {
      onLockedChange(false)
      replaceResolver.current?.(false)
    },
    [onLockedChange],
  )

  const target = targets.find((t) => t.id === targetId)
  const readFailed = account.isError
  const state = readFailed ? null : account.data
  const blocked = setRegularKeyBlockedReason(state, readFailed)
  const status = target ? controlStatus(state, target.keyAddress) : 'unknown'
  const existing = state?.exists ? state.regularKey : undefined
  const mainnet = controller.network === 'mainnet'

  async function finish(r: ControlResult) {
    setResult(r)
    if (r.status !== 'controlled') return
    try {
      await onControlled(r.meta)
    } catch {
      // The key IS set on the ledger and the view is written: only this screen's list
      // could not refresh. "Check again" runs the read and the claim, nothing is sent.
      setResult({ status: 'unconfirmed', reason: 'It is done on the ledger, but this screen could not refresh. Check again.' })
    }
  }

  async function handleSet() {
    if (busy || blocked || !target) return
    setBusy(true)
    setResult(null)
    try {
      await finish(
        await setRegularKey(controller.id, target.id, {
          queryClient,
          openKey: openKey ?? undefined,
          prompts,
          confirmReplace: (old) =>
            new Promise<boolean>((resolve) => {
              replaceResolver.current = resolve
              setReplaceKey(old)
            }),
        }),
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleCheckAgain() {
    if (busy || !target) return
    setBusy(true)
    try {
      await finish(await confirmControl(controller.id, target.id, { queryClient }))
    } finally {
      setBusy(false)
    }
  }

  function answerReplace(ok: boolean) {
    replaceResolver.current?.(ok)
    replaceResolver.current = null
    setReplaceKey(null)
  }

  const done = result?.status === 'controlled'

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Let another wallet sign for this account</DialogTitle>
        <DialogDescription>
          {controller.label} on {NETWORKS[controller.network].label}
          {mainnet && ' — real funds'}. Its account is <AddressLink address={controller.address} />.
        </DialogDescription>
      </DialogHeader>

      <Alert variant="warning">
        <AlertTitle>Whoever holds this phone can take over the account</AlertTitle>
        <AlertDescription>
          The wallet you choose gets a key that can send this account’s funds. Anyone who can open that wallet here can do the same.
        </AlertDescription>
      </Alert>

      {replaceKey !== null ? (
        <div className="flex flex-col gap-3" role="group" aria-label="Replace the Regular Key">
          <p className="text-sm">
            This account already has a Regular Key, <span className="break-all font-mono">{replaceKey}</span>. Setting a new one
            replaces it, and that key will stop working. Replace it?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => answerReplace(false)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => answerReplace(true)}>
              Replace it
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="control-target">Wallet that will sign</Label>
            {targets.length === 0 ? (
              <p className="text-sm text-muted-foreground" id="control-target">
                No other wallet on {NETWORKS[controller.network].label} is on this device. Add one first.
              </p>
            ) : (
              <select
                id="control-target"
                className="h-9 rounded-md border bg-card px-2 text-sm"
                value={targetId}
                disabled={busy || done}
                onChange={(e) => {
                  setTargetId(e.target.value)
                  setResult(null)
                }}
              >
                <option value="">Choose a wallet</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1 text-sm" aria-live="polite">
            <StatusLegend tone={status === 'controlled' ? 'live' : status === 'not-controlled' ? 'caution' : 'neutral'}>
              {STATUS_WORDS[status]}
            </StatusLegend>
            {existing && <p className="text-xs text-muted-foreground">Current Regular Key: <span className="break-all font-mono">{existing}</span></p>}
            {blocked && <p className="text-xs text-text-destructive" id="control-blocked">{blocked}</p>}
          </div>

          {target && usesPasskey(target) && (
            <p className="text-sm">
              {target.label} uses a passkey. The passkey becomes an extra key for this account. The master key keeps working.
            </p>
          )}

          {result && result.status !== 'controlled' && (
            <p className="text-sm" role="status">
              {result.reason}
            </p>
          )}
          {result?.status === 'controlled' && (
            <p className="text-sm" role="status">
              {result.sent ? 'Done.' : 'Already set.'} {target?.label} now operates this account.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={busy}>
              {done ? 'Close' : 'Cancel'}
            </Button>
            {result?.status === 'unconfirmed' && (
              <Button variant="outline" onClick={() => void handleCheckAgain()} disabled={busy}>
                Check again
              </Button>
            )}
            {!done && (
              <Button
                aria-disabled={busy || !!blocked || !target ? true : undefined}
                aria-describedby={blocked ? 'control-blocked' : undefined}
                onClick={() => void handleSet()}
              >
                {busy ? 'Working…' : existing && existing !== target?.keyAddress ? 'Replace Regular Key' : 'Set Regular Key'}
              </Button>
            )}
          </DialogFooter>
        </>
      )}
    </DialogContent>
  )
}
