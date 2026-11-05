import { useState } from 'react'
import { isValidClassicAddress } from 'xrpl'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { TrustLineRow } from '@/components/wallet/TrustLineRow'
import { QueryErrorState } from '@/components/wallet/QueryErrorState'
import { useActiveWallet, useActiveNetwork, useActiveNode, useWalletOpenKey } from '@/store/app-store'
import { useTrustLines } from '@/hooks/useTrustLines'
import { useServerReserves } from '@/hooks/useServerReserves'
import { useSpendableBalance, type SpendableBalanceStatus } from '@/hooks/useSpendableBalance'
import { useRecommendedFee } from '@/hooks/useRecommendedFee'
import { ReadingValue } from '@/components/wallet/ReadingValue'
import { readStateOf, type ReadState } from '@/lib/read-state'
import { submitTrustSet } from '@/lib/xrpl/writes'
import { signingHandleFor } from '@/lib/crypto/keystore'
import { useYieldingPrompts } from '@/hooks/usePrompts'
import {
  formatXrp,
  displayCurrencyCode,
  coversOwnerReserveAndFee,
  feeWithinCap,
  isCanonicalPositiveDrops,
  MAX_FEE_DROPS,
} from '@/lib/xrpl/money'
import { describeResultCode, UNKNOWN_OUTCOME_WORDS } from '@/lib/xrpl/result-codes'
import { invalidateAccountScoped } from '@/lib/xrpl/query-keys'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/notify'

/**
 * Why an action is refused, in words shown beside its key. `pending` is a read
 * still in flight and is not painted as a failure; `retry` is present only for
 * a read that failed and can be asked for again.
 */
interface Refusal {
  tone: 'pending' | 'refused'
  title?: string
  reason: string
  retry?: () => void | Promise<unknown>
}

/** The fee as it may be shown: a figure only when it is a canonical positive
 * drops string, so a malformed answer is "Unavailable", never formatted. */
function shownFee(state: ReadState<string>): ReadState<string> {
  if (state.status === 'ok' && !isCanonicalPositiveDrops(state.value)) return { status: 'failed' }
  return state
}

/** The fee half of every trust-line action's guard: pending, failed and above
 * the cap each refuse, with the reason that applies. */
function feeRefusal(fee: ReadState<string>, retry: () => void | Promise<unknown>): Refusal | null {
  if (fee.status === 'pending') return { tone: 'pending', reason: 'Reading the network fee…' }
  if (fee.status !== 'ok') {
    return {
      tone: 'refused',
      title: 'Network fee could not be read',
      reason: 'The current network fee could not be read from the ledger, so it cannot be shown or signed. This is held until the read succeeds.',
      retry,
    }
  }
  if (!feeWithinCap(fee.value)) {
    return {
      tone: 'refused',
      reason: `The network fee is ${formatXrp(fee.value)}, above this wallet's limit of ${formatXrp(MAX_FEE_DROPS)}. This is held until the fee falls.`,
    }
  }
  return null
}

/** The balance half of the add guard, for every spendable state but `ok`. */
function balanceRefusal(status: Exclude<SpendableBalanceStatus, 'ok'>): Refusal {
  if (status === 'loading') return { tone: 'pending', reason: 'Reading your spendable balance…' }
  if (status === 'not-activated') {
    return { tone: 'refused', reason: 'This account is not activated on the ledger, so it has no spendable XRP to cover the reserve and fee.' }
  }
  return {
    tone: 'refused',
    reason: 'Your spendable balance could not be read, so it cannot be checked against the reserve and fee.',
  }
}

/** A refusal, rendered where its key is. A failed read with a retry is the
 * inline read-failure device; anything else is one line of text. */
function RefusalNote({ id, refusal }: { id: string; refusal: Refusal }) {
  return (
    <div id={id}>
      {refusal.retry ? (
        <QueryErrorState title={refusal.title ?? 'Could not be read'} description={refusal.reason} onRetry={refusal.retry} />
      ) : (
        <p className={refusal.tone === 'pending' ? 'text-sm text-muted-foreground' : 'text-sm text-text-destructive'}>{refusal.reason}</p>
      )}
    </div>
  )
}

/** The fee, and optionally the reserve, as readings in the panel well — the
 * same device and tokens as Send's fee row, which `check:contrast` measures. */
function CostReadings({ fee, reserve }: { fee: ReadState<string>; reserve?: ReadState<string> }) {
  return (
    <dl className="panel-well flex flex-wrap gap-x-8 gap-y-2 rounded-md px-3 py-2.5">
      {reserve && (
        <div>
          <dt className="panel-legend text-readout-muted">Owner reserve</dt>
          <ReadingValue state={reserve} format={formatXrp} />
        </div>
      )}
      <div>
        <dt className="panel-legend text-readout-muted">Network fee</dt>
        <ReadingValue state={fee} format={formatXrp} />
      </div>
    </dl>
  )
}

export function TrustLinesTab() {
  const network = useActiveNetwork()
  const node = useActiveNode()
  const wallet = useActiveWallet()
  // The Open Key of THIS Wallet's lock, never another's (AD-21).
  const vaultKey = useWalletOpenKey(wallet?.id)
  // The PIN dialog, for a Wallet whose Signing Check is the App PIN.
  const { prompts, promptOpen } = useYieldingPrompts()
  const trustLines = useTrustLines(network, wallet?.address ?? null, node)
  const reserves = useServerReserves(network, node)
  const spendable = useSpendableBalance(network, wallet?.address ?? null, node)
  const fee = useRecommendedFee(network, node)
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [issuer, setIssuer] = useState('')
  const [currency, setCurrency] = useState('')
  const [limit, setLimit] = useState('1000000000')
  const [editing, setEditing] = useState<{ issuer: string; currency: string; limit: string } | null>(null)
  const [confirmClose, setConfirmClose] = useState<{ issuer: string; currency: string } | null>(null)
  const [busy, setBusy] = useState(false)
  /** The fee pinned at the press, while that submission is in flight. The fee
   * read keeps polling, so the dialog shows this — what is being signed — and
   * not the live figure. Cleared when the submission ends. */
  const [submittingFee, setSubmittingFee] = useState<string | null>(null)

  if (!wallet) return <p className="text-muted-foreground">No active wallet.</p>

  /** `feeDrops` is the fee on screen when the key was pressed: it is pinned on
   * the TrustSet, so what was shown is what is signed. */
  async function submit(currencyArg: string, issuerArg: string, limitArg: string, feeDrops: string) {
    if (!wallet || !vaultKey) return
    setBusy(true)
    setSubmittingFee(feeDrops)
    // A new attempt: what the last one reported is not current.
    toast.resolve('trustline')
    try {
      const signing = await signingHandleFor(wallet.id, { openKey: vaultKey, prompts })
      const result = await submitTrustSet(network, signing, { currency: currencyArg, issuer: issuerArg, limit: limitArg, feeDrops }, node)
      if (result.status === 'validated') {
        toast.success('Trust line updated.')
        setOpen(false)
        setEditing(null)
        setConfirmClose(null)
      } else if (result.status === 'expired') {
        toast.warning('This transaction expired before validating. It was not applied — you can retry.', { action: 'trustline' })
      } else if (result.status === 'claimed') {
        toast.error(`${describeResultCode(result.resultCode)} The network fee was still charged.`, { action: 'trustline' })
      } else if (result.status === 'unknown') {
        // It may have applied: a warning naming the hash, never an error. The
        // dialog closes, so one click cannot resubmit and pay a second fee.
        toast.warning(`${UNKNOWN_OUTCOME_WORDS} Hash: ${result.hash}`, { action: 'trustline' })
        setOpen(false)
        setEditing(null)
        setConfirmClose(null)
      } else {
        toast.error(describeResultCode(result.resultCode), { action: 'trustline' })
      }
      await invalidateAccountScoped(queryClient, network, wallet.address)
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update trust line.', { action: 'trustline' })
    } finally {
      setBusy(false)
      setSubmittingFee(null)
    }
  }

  // Each read as a read state: a figure only when read, and never one retained
  // under a read that is in error now (docs/decisions.md §12 rule 2).
  const reserveRead = readStateOf(reserves)
  const reserveState: ReadState<string> =
    reserveRead.status === 'ok' ? { status: 'ok', value: reserveRead.value.ownerReserveDrops } : reserveRead
  const reserveDrops = reserveState.status === 'ok' ? reserveState.value : null
  const feeState = shownFee(readStateOf(fee))
  const retryFee = () => fee.refetch()
  const feeBlock = feeRefusal(feeState, retryFee)
  /** The fee a key signs if pressed now; null whenever the fee guard refuses. */
  const pinnableFee = feeBlock === null && feeState.status === 'ok' ? feeState.value : null
  /** What each dialog's Network fee reading shows: the pinned figure while a
   * submission is in flight, the live read otherwise. */
  const dialogFee: ReadState<string> = submittingFee !== null ? { status: 'ok', value: submittingFee } : feeState
  /** Refusals describe the live reads, so none is shown beside a submission
   * that is already signing the pinned fee. */
  const shownFeeBlock = busy ? null : feeBlock

  /** One reason, in a fixed order: reserve, balance, fee, cap, then whether
   * the balance covers the reserve and fee. Null means a line may be added. */
  function addRefusalOf(): Refusal | null {
    if (reserveState.status === 'pending') return { tone: 'pending', reason: 'Reading the owner reserve…' }
    if (reserveState.status !== 'ok') {
      return {
        tone: 'refused',
        title: 'Owner reserve could not be read',
        reason: 'The owner reserve could not be read from the ledger, so the cost of a new trust line is not known. Adding one is held until the read succeeds.',
        retry: () => reserves.refetch(),
      }
    }
    if (spendable.status !== 'ok' || spendable.spendableDrops === null) {
      return balanceRefusal(spendable.status === 'ok' ? 'loading' : spendable.status)
    }
    if (feeBlock) return feeBlock
    if (pinnableFee === null) return { tone: 'pending', reason: 'Reading the network fee…' }
    if (!coversOwnerReserveAndFee(spendable.spendableDrops, reserveState.value, pinnableFee)) {
      return { tone: 'refused', reason: "You don't have enough spendable XRP to cover the reserve and fee." }
    }
    return null
  }
  const addRefusal = addRefusalOf()
  const shownAddRefusal = busy ? null : addRefusal

  /** Create re-checks the whole add guard at the press, not only `disabled`. */
  function createLine() {
    if (busy || !issuerValid || !currencyValid || !limitValid || addRefusal !== null || pinnableFee === null) return
    void submit(currency, issuer, limit, pinnableFee)
  }
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
        <Dialog open={open && !promptOpen} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add trust line</Button>
          </DialogTrigger>
          <DialogContent variant="sheet">
            <DialogHeader>
              <DialogTitle>Add trust line</DialogTitle>
              <DialogDescription>
                A trust line locks one more owner reserve while it is open, refunded when you close it. Creating it also spends
                the network fee.
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
              <CostReadings reserve={reserveState} fee={dialogFee} />
              {shownAddRefusal && <RefusalNote id="add-refusal" refusal={shownAddRefusal} />}
            </div>
            <DialogFooter>
              <Button
                onClick={createLine}
                disabled={busy || !issuerValid || !currencyValid || !limitValid || addRefusal !== null || pinnableFee === null}
                aria-describedby={shownAddRefusal ? 'add-refusal' : undefined}
              >
                {busy ? 'Submitting…' : 'Create trust line'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {trustLines.isLoading && <Skeleton className="h-16 w-full" />}
        {/* On a first failed read there is no data at all and the list renders
            as nothing; on a failed refetch TanStack keeps the previous data, so
            the empty branch below CAN fire beside this one. Both cases need the
            failure said out loud, and the empty branch gated on it. */}
        {trustLines.isError && (
          <QueryErrorState
            title="Trust lines unavailable"
            description="The trust lines for this account could not be read from the ledger. The list below is not empty — the app simply does not know what is on it."
            onRetry={() => trustLines.refetch()}
          />
        )}
        {trustLines.data?.length === 0 && !trustLines.isError && (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">No trust lines yet</p>
            <p className="text-sm text-muted-foreground">
              A trust line is what lets this account hold a token other than XRP. Each one locks{' '}
              {reserveDrops !== null ? `${formatXrp(reserveDrops)} as an owner reserve` : 'an owner reserve'}, refunded when
              you close it. Use “Add trust line” above to open your first.
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
        <DialogContent dismissOnOutsidePress>
          <DialogHeader>
            <DialogTitle>Close this trust line?</DialogTitle>
            <DialogDescription>
              This submits a transaction setting your limit for {confirmClose ? displayCurrencyCode(confirmClose.currency) : ''} to
              zero, which removes the trust line and releases its{' '}
              {reserveDrops !== null ? `${formatXrp(reserveDrops)} owner reserve` : 'owner reserve'}. You will not be able to
              receive this token again until you create a new trust line, which costs the reserve again.
            </DialogDescription>
          </DialogHeader>
          <CostReadings fee={dialogFee} />
          {shownFeeBlock && <RefusalNote id="close-refusal" refusal={shownFeeBlock} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClose(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmClose && pinnableFee && submit(confirmClose.currency, confirmClose.issuer, '0', pinnableFee)}
              disabled={busy || pinnableFee === null}
              aria-describedby={shownFeeBlock ? 'close-refusal' : undefined}
            >
              {busy ? 'Closing…' : 'Close trust line'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing && !promptOpen} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent variant="sheet">
          <DialogHeader>
            <DialogTitle>Edit trust line limit</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <Label htmlFor="edit-limit">New limit</Label>
              <Input id="edit-limit" value={editing.limit} onChange={(e) => setEditing({ ...editing, limit: e.target.value })} />
            </div>
          )}
          <CostReadings fee={dialogFee} />
          {shownFeeBlock && <RefusalNote id="edit-refusal" refusal={shownFeeBlock} />}
          <DialogFooter>
            <Button
              onClick={() => editing && pinnableFee && submit(editing.currency, editing.issuer, editing.limit, pinnableFee)}
              disabled={busy || pinnableFee === null}
              aria-describedby={shownFeeBlock ? 'edit-refusal' : undefined}
            >
              {busy ? 'Submitting…' : 'Update limit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
