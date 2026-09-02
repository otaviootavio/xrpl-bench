import { useState } from 'react'
import { isValidClassicAddress } from 'xrpl'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AmountInput, validateAmountString } from '@/components/wallet/AmountInput'
import { TxLink } from '@/components/wallet/AddressLink'
import { TxStatusBadge } from '@/components/wallet/TxStatusBadge'
import { useAppStore, useActiveWallet } from '@/store/app-store'
import { useSpendableBalance } from '@/hooks/useSpendableBalance'
import { useRecommendedFee } from '@/hooks/useRecommendedFee'
import { useTrustLines } from '@/hooks/useTrustLines'
import { useDestinationInfo } from '@/hooks/useDestinationInfo'
import { submitXrpPayment, submitIssuedPayment, type SubmitOutcome } from '@/lib/xrpl/writes'
import { unlockWalletForSigning } from '@/lib/crypto/keystore'
import {
  formatXrp,
  xrpToDropsString,
  displayCurrencyCode,
  isPositiveDecimalString,
  compareDecimalStrings,
} from '@/lib/xrpl/money'
import { describeResultCode } from '@/lib/xrpl/result-codes'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/notify'

const MAX_DESTINATION_TAG = 4294967295

export function SendTab() {
  const network = useAppStore((s) => s.network)
  const wallet = useActiveWallet()
  const vaultKey = useAppStore((s) => s.vaultKey)
  const addressBook = useAppStore((s) => s.addressBook)
  const addAddressBookEntry = useAppStore((s) => s.addAddressBookEntry)
  const queryClient = useQueryClient()

  const [destination, setDestination] = useState('')
  const [asset, setAsset] = useState('XRP')
  const [amount, setAmount] = useState('')
  const [destTag, setDestTag] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null)

  const { spendableDrops } = useSpendableBalance(network, wallet?.address ?? null)
  const fee = useRecommendedFee(network)
  const trustLines = useTrustLines(network, wallet?.address ?? null)
  // Ledger reads go through a query hook, never an onBlur handler (§4).
  const destQuery = useDestinationInfo(network, destination, asset)
  const destInfo = destQuery.data

  // Frozen assets can't be moved, so they're not offerable (decisions.md §2).
  // Balances are DECIMAL strings — never BigInt them.
  const heldTokens = (trustLines.data ?? []).filter((l) => isPositiveDecimalString(l.balance) && !l.freezePeer && !l.freeze)
  const selectedLine = asset === 'XRP' ? null : heldTokens.find((l) => `${l.currency}|${l.account}` === asset)

  const isKnownDestination = addressBook.some((e) => e.address === destination)
  const destinationValid = isValidClassicAddress(destination)
  const isSelfSend = !!wallet && destination === wallet.address
  const amountValidation = validateAmountString(amount || '', asset === 'XRP' ? 'xrp' : 'issued')
  const tagValue = destTag ? Number(destTag) : undefined
  const tagValid = tagValue === undefined || (Number.isInteger(tagValue) && tagValue >= 0 && tagValue <= MAX_DESTINATION_TAG)

  /** Funds check done in the form, so a too-large send fails here with a clear
   * reason instead of costing a fee and coming back as tecUNFUNDED_PAYMENT. */
  const fundsError = (() => {
    if (!amountValidation.valid) return undefined
    if (asset === 'XRP') {
      if (!spendableDrops) return undefined
      // The fee comes out on top of the amount, so both must fit.
      const needed = BigInt(xrpToDropsString(amount)) + BigInt(fee.data ?? '0')
      if (needed > BigInt(spendableDrops)) {
        return `That's more than your spendable balance (${formatXrp(spendableDrops)}) once the network fee is included.`
      }
      return undefined
    }
    if (selectedLine && compareDecimalStrings(amount, selectedLine.balance) > 0) {
      return `You only hold ${selectedLine.balance} ${displayCurrencyCode(selectedLine.currency)}.`
    }
    return undefined
  })()

  async function doSend() {
    if (!wallet || !vaultKey) return
    setBusy(true)
    setOutcome(null)
    try {
      const signingWallet = await unlockWalletForSigning(wallet.id, vaultKey)
      let result: SubmitOutcome
      if (asset === 'XRP') {
        result = await submitXrpPayment(network, signingWallet, {
          destination,
          amountDrops: xrpToDropsString(amount),
          destinationTag: tagValue,
        })
      } else {
        const [currency, issuer] = asset.split('|')
        result = await submitIssuedPayment(network, signingWallet, {
          destination,
          currency,
          issuer,
          value: amount,
          destinationTag: tagValue,
        })
      }
      setOutcome(result)
      setConfirming(false)
      if (result.status === 'validated') {
        toast.success('Payment sent.')
        if (!isKnownDestination) addAddressBookEntry(destination, destination.slice(0, 8))
      } else if (result.status === 'expired') {
        toast.warning('This transaction expired before validating. It was not applied — you can retry.')
      } else if (result.status === 'claimed') {
        // tec*: in a validated ledger, did not go through, fee WAS taken.
        toast.error(`${describeResultCode(result.resultCode)} The network fee was still charged.`)
      } else {
        toast.error(describeResultCode(result.resultCode))
      }
      await queryClient.invalidateQueries({ queryKey: ['accountState', network, wallet.address] })
      await queryClient.invalidateQueries({ queryKey: ['accountTx', network, wallet.address] })
      await queryClient.invalidateQueries({ queryKey: ['trustLines', network, wallet.address] })
    } catch (err: any) {
      toast.error(err?.message ?? 'Send failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!wallet) return <p className="text-muted-foreground">No active wallet.</p>

  const canSend =
    destinationValid &&
    !isSelfSend &&
    amountValidation.valid &&
    !fundsError &&
    tagValid &&
    (!destInfo?.requireDestTag || destTag.length > 0) &&
    !busy

  const amountLabel = asset === 'XRP' ? `${amount} XRP` : `${amount} ${displayCurrencyCode(asset.split('|')[0])}`

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Send</CardTitle>
          <CardDescription>Send XRP or a token you hold.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="dest">Destination address</Label>
            <Input
              id="dest"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="r..."
              aria-invalid={destination.length > 0 && !destinationValid}
              aria-describedby={destination.length > 0 && !destinationValid ? 'dest-error' : undefined}
            />
            {destination.length > 0 && !destinationValid && (
              <p id="dest-error" className="text-sm text-text-destructive">
                That doesn't look like a valid XRPL address.
              </p>
            )}
            {isSelfSend && <p className="text-sm text-text-destructive">You can't send a payment to your own address.</p>}
            {destQuery.isFetching && <p className="text-xs text-muted-foreground">Checking destination…</p>}
          </div>

          {destInfo && !destInfo.exists && (
            <Alert variant="warning">
              <AlertTitle>Destination not activated</AlertTitle>
              <AlertDescription>
                This address doesn't exist on-ledger yet. If you send less than the base reserve in XRP, this payment will fail
                to activate it.
              </AlertDescription>
            </Alert>
          )}

          {destInfo?.hasTrustLine === false && (
            <Alert variant="warning">
              <AlertTitle>Recipient can't hold this token</AlertTitle>
              <AlertDescription>
                They don't have a trust line to this issuer yet, so this payment will most likely fail.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="dtag">
              {destInfo?.requireDestTag ? 'Destination tag (required by recipient)' : 'Destination tag (optional)'}
            </Label>
            <Input
              id="dtag"
              inputMode="numeric"
              value={destTag}
              onChange={(e) => setDestTag(e.target.value.replace(/\D/g, ''))}
              aria-invalid={!tagValid}
              aria-describedby={!tagValid ? 'dtag-error' : undefined}
            />
            {!tagValid && (
              <p id="dtag-error" className="text-sm text-text-destructive">
                A destination tag must be between 0 and {MAX_DESTINATION_TAG}.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Asset</Label>
            <Select value={asset} onValueChange={setAsset}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="XRP">XRP</SelectItem>
                {heldTokens.map((l) => (
                  <SelectItem key={`${l.account}-${l.currency}`} value={`${l.currency}|${l.account}`}>
                    {displayCurrencyCode(l.currency)} (balance {l.balance})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AmountInput
            id="amount"
            label="Amount"
            value={amount}
            onChange={setAmount}
            kind={asset === 'XRP' ? 'xrp' : 'issued'}
            suffix={asset === 'XRP' ? 'XRP' : displayCurrencyCode(asset.split('|')[0])}
            error={amount.length > 0 ? (amountValidation.error ?? fundsError) : undefined}
          />

          {/* A reading, so it is shown in the panel's well rather than a grey
              box: these two numbers are what decide whether the send fits. */}
          <dl className="panel-well flex flex-wrap gap-x-8 gap-y-2 rounded-md px-3 py-2.5">
            <div>
              <dt className="panel-legend text-readout-muted">Network fee</dt>
              <dd className="font-data text-base tracking-tight">{fee.data ? formatXrp(fee.data) : '…'}</dd>
            </div>
            {asset === 'XRP' && spendableDrops && (
              <div>
                <dt className="panel-legend text-readout-muted">Spendable</dt>
                <dd className="font-data text-base tracking-tight">{formatXrp(spendableDrops)}</dd>
              </div>
            )}
          </dl>

          <Button onClick={() => setConfirming(true)} disabled={!canSend}>
            Review payment
          </Button>

          {outcome && (
            <div className="panel-plate flex flex-col gap-2 rounded-md p-3">
              <div className="flex items-center gap-2">
                <TxStatusBadge
                  resultCode={outcome.status === 'expired' ? 'expired' : outcome.resultCode}
                  validated={outcome.status !== 'expired'}
                />
                <TxLink hash={outcome.hash} />
              </div>
              {(outcome.status === 'failed' || outcome.status === 'claimed') && (
                <p className="text-sm text-text-destructive">
                  {describeResultCode(outcome.resultCode)}
                  {outcome.status === 'claimed' && ' The network fee was still charged for this attempt.'}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sending is irreversible, so it ALWAYS gets an explicit confirm step
          stating the exact consequence (§4) — not only for unknown addresses.
          A first-send additionally escalates the warning, since the address
          book auto-records every successful destination. */}
      <Dialog open={confirming} onOpenChange={(o) => !o && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {amountLabel}?</DialogTitle>
            <DialogDescription>
              This sends {amountLabel} to {destination}
              {tagValue !== undefined ? ` (destination tag ${tagValue})` : ''} on {network}, plus a network fee of{' '}
              {fee.data ? formatXrp(fee.data) : 'the current rate'}. Payments on the XRP Ledger are irreversible and cannot be
              cancelled or refunded once sent.
            </DialogDescription>
          </DialogHeader>
          {!isKnownDestination && (
            <Alert variant="warning">
              <AlertTitle>You haven't sent here before</AlertTitle>
              <AlertDescription>Double-check the address character by character before continuing.</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            {/* The one control in this app that moves funds, and therefore the
                only one that may wear --commit. See button.tsx. */}
            <Button variant="commit" onClick={doSend} disabled={busy}>
              {busy ? 'Sending…' : 'Confirm and send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
