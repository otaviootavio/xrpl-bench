import { useState } from 'react'
import { isValidClassicAddress } from 'xrpl'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { TrustLineRow } from '@/components/wallet/TrustLineRow'
import { useAppStore, useActiveWallet } from '@/store/app-store'
import { useTrustLines } from '@/hooks/useTrustLines'
import { useServerReserves } from '@/hooks/useServerReserves'
import { useSpendableBalance } from '@/hooks/useSpendableBalance'
import { submitTrustSet } from '@/lib/xrpl/writes'
import { unlockWalletForSigning } from '@/lib/crypto/keystore'
import { formatXrp, displayCurrencyCode } from '@/lib/xrpl/money'
import { describeResultCode } from '@/lib/xrpl/result-codes'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/notify'

export function TrustLinesTab() {
  const network = useAppStore((s) => s.network)
  const wallet = useActiveWallet()
  const vaultKey = useAppStore((s) => s.vaultKey)
  const trustLines = useTrustLines(network, wallet?.address ?? null)
  const reserves = useServerReserves(network)
  const { spendableDrops } = useSpendableBalance(network, wallet?.address ?? null)
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [issuer, setIssuer] = useState('')
  const [currency, setCurrency] = useState('')
  const [limit, setLimit] = useState('1000000000')
  const [editing, setEditing] = useState<{ issuer: string; currency: string; limit: string } | null>(null)
  const [confirmClose, setConfirmClose] = useState<{ issuer: string; currency: string } | null>(null)
  const [busy, setBusy] = useState(false)

  if (!wallet) return <p className="text-muted-foreground">No active wallet.</p>

  async function submit(currencyArg: string, issuerArg: string, limitArg: string) {
    if (!wallet || !vaultKey) return
    setBusy(true)
    try {
      const signingWallet = await unlockWalletForSigning(wallet.id, vaultKey)
      const result = await submitTrustSet(network, signingWallet, { currency: currencyArg, issuer: issuerArg, limit: limitArg })
      if (result.status === 'validated') {
        toast.success('Trust line updated.')
        setOpen(false)
        setEditing(null)
        setConfirmClose(null)
      } else if (result.status === 'expired') {
        toast.warning('This transaction expired before validating. It was not applied — you can retry.')
      } else if (result.status === 'claimed') {
        toast.error(`${describeResultCode(result.resultCode)} The network fee was still charged.`)
      } else {
        toast.error(describeResultCode(result.resultCode))
      }
      await queryClient.invalidateQueries({ queryKey: ['trustLines', network, wallet.address] })
      await queryClient.invalidateQueries({ queryKey: ['accountState', network, wallet.address] })
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update trust line.')
    } finally {
      setBusy(false)
    }
  }

  const reserveCostDrops = reserves.data?.ownerReserveDrops ?? '200000'
  const canAffordNewLine = spendableDrops ? BigInt(spendableDrops) >= BigInt(reserveCostDrops) : false
  // XRPL currency codes are either a 3-character code or a 40-char hex code.
  const issuerValid = isValidClassicAddress(issuer)
  const currencyValid = /^[A-Za-z0-9]{3}$/.test(currency) || /^[0-9A-Fa-f]{40}$/.test(currency)
  const limitValid = /^\d*\.?\d*$/.test(limit) && /[1-9]/.test(limit)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Trust Lines</CardTitle>
          <CardDescription>Required to hold tokens other than XRP.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add trust line</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add trust line</DialogTitle>
              <DialogDescription>
                This will lock an additional {formatXrp(reserveCostDrops)} owner reserve.
                {!canAffordNewLine && <span className="block text-text-destructive">You don't have enough spendable XRP to cover this.</span>}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="issuer">Issuer address</Label>
                <Input
                  id="issuer"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  placeholder="r..."
                  aria-invalid={issuer.length > 0 && !issuerValid}
                  aria-describedby={issuer.length > 0 && !issuerValid ? 'issuer-error' : undefined}
                />
                {issuer.length > 0 && !issuerValid && (
                  <p id="issuer-error" className="text-sm text-text-destructive">
                    That doesn't look like a valid XRPL address.
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="currency">Currency code</Label>
                <Input
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  placeholder="USD"
                  aria-invalid={currency.length > 0 && !currencyValid}
                  aria-describedby={currency.length > 0 && !currencyValid ? 'currency-error' : undefined}
                />
                {currency.length > 0 && !currencyValid && (
                  <p id="currency-error" className="text-sm text-text-destructive">
                    Use a 3-character code (like USD) or a 40-character hex code.
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="limit">Trust limit</Label>
                <Input id="limit" value={limit} onChange={(e) => setLimit(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => submit(currency, issuer, limit)}
                disabled={busy || !issuerValid || !currencyValid || !limitValid || !canAffordNewLine}
              >
                {busy ? 'Submitting…' : 'Create trust line'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {trustLines.isLoading && <Skeleton className="h-16 w-full" />}
        {trustLines.data?.length === 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">No trust lines yet</p>
            <p className="text-sm text-muted-foreground">
              A trust line is what lets this account hold a token other than XRP. Each one locks{' '}
              {formatXrp(reserveCostDrops)} as an owner reserve, refunded when you close it. Use “Add trust line” above to
              open your first.
            </p>
          </div>
        )}
        {trustLines.data?.map((l) => (
          <TrustLineRow
            key={`${l.account}-${l.currency}`}
            line={l}
            onEditLimit={() => setEditing({ issuer: l.account, currency: l.currency, limit: l.limit })}
            onRemove={() => setConfirmClose({ issuer: l.account, currency: l.currency })}
          />
        ))}
      </CardContent>

      {/* Closing a trust line is irreversible from the app's point of view and
          changes on-ledger state, so it needs an explicit confirm (§4). */}
      <Dialog open={!!confirmClose} onOpenChange={(o) => !o && setConfirmClose(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close this trust line?</DialogTitle>
            <DialogDescription>
              This submits a transaction setting your limit for {confirmClose ? displayCurrencyCode(confirmClose.currency) : ''} to
              zero, which removes the trust line and releases its {formatXrp(reserveCostDrops)} owner reserve. You will not be able
              to receive this token again until you create a new trust line, which costs the reserve again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClose(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmClose && submit(confirmClose.currency, confirmClose.issuer, '0')}
              disabled={busy}
            >
              {busy ? 'Closing…' : 'Close trust line'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit trust line limit</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <Label htmlFor="edit-limit">New limit</Label>
              <Input id="edit-limit" value={editing.limit} onChange={(e) => setEditing({ ...editing, limit: e.target.value })} />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => editing && submit(editing.currency, editing.issuer, editing.limit)} disabled={busy}>
              {busy ? 'Submitting…' : 'Update limit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
