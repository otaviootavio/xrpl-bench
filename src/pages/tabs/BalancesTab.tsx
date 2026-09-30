import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusLegend } from '@/components/ui/lamp'
import { AddressDisplay } from '@/components/wallet/AddressDisplay'
import { Readout, type ScaleMark } from '@/components/wallet/Readout'
import { QueryErrorState } from '@/components/wallet/QueryErrorState'
import { useAccountState } from '@/hooks/useAccountState'
import { useSpendableBalance } from '@/hooks/useSpendableBalance'
import { useTrustLines } from '@/hooks/useTrustLines'
import { useServerReserves } from '@/hooks/useServerReserves'
import { useAppStore, useActiveWallet } from '@/store/app-store'
import { formatXrp, formatXrpValue, formatAmountString, displayCurrencyCode } from '@/lib/xrpl/money'
import { requestTestnetFunds } from '@/lib/xrpl/faucet'
import { invalidateAccountScoped } from '@/lib/xrpl/query-keys'
import { toast } from '@/lib/notify'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

/**
 * The panel's primary face: what this account holds, right now.
 *
 * The readout well leads because "check the position" is the dominant job (see
 * the surface brief). Spendable and reserved are scale marks inside that same
 * well rather than sibling cards, because they are subordinate readings of the
 * one quantity above them — splitting them into tiles would say they are three
 * separate facts.
 */
export function BalancesTab() {
  const network = useAppStore((s) => s.network)
  const wallet = useActiveWallet()
  const address = wallet?.address ?? null
  const accountState = useAccountState(network, address)
  const spendable = useSpendableBalance(network, address)
  const trustLines = useTrustLines(network, address)
  const reserves = useServerReserves(network)
  const queryClient = useQueryClient()
  const [funding, setFunding] = useState(false)

  if (!wallet) return <p className="text-muted-foreground">No active wallet.</p>

  async function handleFaucet() {
    setFunding(true)
    try {
      const result = await requestTestnetFunds(network, wallet!.address)
      toast.success(`Funded with ${result.amountXrp} test XRP.`)
      await invalidateAccountScoped(queryClient, network, wallet!.address)
    } catch (err: any) {
      toast.error(err?.message ?? 'Faucet request failed.')
    } finally {
      setFunding(false)
    }
  }

  // TanStack keeps the previous data across a failed refetch, so `data` and
  // `isError` are true together on the 15-second poll. A retained figure shown
  // beside "could not be read" is a stale number presented as current, which is
  // the falsehood this screen exists to avoid — so the failure replaces it.
  const linesReadable = !trustLines.isError
  const nonZeroLines = linesReadable ? (trustLines.data?.filter((l) => l.balance !== '0') ?? []) : []
  const zeroLines = linesReadable ? (trustLines.data?.filter((l) => l.balance === '0') ?? []) : []

  /**
   * The two derived readings, and what they say when they cannot be read.
   *
   * `spendable.reserveFailed` and `spendable.status` are the inputs here —
   * never the figures on their own. Reading the figures directly is what let a
   * reserve read that had failed produce `marks: []`, and an empty array skips
   * the whole `<dl>`
   * (`Readout.tsx:68`): Spendable and Reserved left the screen without a
   * trace, so the operator saw a balance with no obligation against it. A
   * missing number reads as a smaller obligation, which is the more dangerous
   * of the two directions to be wrong in.
   *
   * On `unavailable` the rows stay and state it in words. On `loading` they
   * are still absent — a read in flight is not a read that failed, and the
   * loading treatment is deliberately unchanged.
   */
  const marks: ScaleMark[] =
    // The failure is tested FIRST, so nothing can fall through into it: these
    // two rows appear when, and only when, the reserve read is in error.
    spendable.reserveFailed
      ? [
          // One thing each, in words. No owned-object note: a count beside
          // "Unavailable" would be a second statement on a row whose whole
          // job is to make one.
          { label: 'Spendable', value: 'Unavailable', unavailable: true },
          { label: 'Reserved', value: 'Unavailable', unavailable: true },
        ]
      : // `status === 'ok'` is the gate. The two null tests after it narrow
        // `string | null` for the typechecker and decide nothing — the hook
        // returns `ok` only with both figures present — and if that ever
        // stopped being true the marks would fall to the loading treatment,
        // never to the failure rows above.
        spendable.status === 'ok' && spendable.spendableDrops !== null && spendable.reservedDrops !== null
        ? [
            { label: 'Spendable', value: formatXrpValue(spendable.spendableDrops) },
            {
              label: 'Reserved',
              value: formatXrpValue(spendable.reservedDrops),
              note:
                accountState.data && accountState.data.ownerCount > 0
                  ? `${accountState.data.ownerCount} owned object${accountState.data.ownerCount > 1 ? 's' : ''}`
                  : undefined,
            },
          ]
        : []

  return (
    <div className="flex flex-col gap-3">
      {accountState.isLoading && <Skeleton className="h-36 w-full" />}

      {/* Where the readout would be, not inside it: the destructive tone does
          not hold contrast on readout ground, and a balance the app could not
          read has no figure to engrave. A blank panel here would read as
          "nothing to show", which is exactly the wrong thing to say about
          money. */}
      {accountState.isError && (
        <QueryErrorState
          title="Balance unavailable"
          description="The XRP balance could not be read from the ledger. Nothing is shown here because the app does not know what this account holds right now — this is not a balance of zero."
          onRetry={() => accountState.refetch()}
        />
      )}

      {/* Also gated on `!isError`: offering the faucet would act on data the
          panel has just said it cannot read. */}
      {accountState.data && !accountState.data.exists && !accountState.isError && (
        <Alert variant="warning">
          <AlertTitle>Account not activated yet</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>
              This address needs to receive at least{' '}
              {/* `!isError` as well as `data`: across a failed refetch TanStack
                  keeps the previous answer, and engraving it here would state a
                  figure the app cannot currently vouch for — directly beneath
                  the message saying the reserve could not be read. The prose
                  fallback stands unchanged; it just covers one more state. */}
              {reserves.data && !reserves.isError
                ? formatXrp(reserves.data.baseReserveDrops)
                : 'the base reserve'}{' '}
              to become an account on-ledger.
            </span>
            {network === 'testnet' ? (
              <Button size="sm" onClick={handleFaucet} disabled={funding}>
                {funding ? 'Requesting…' : 'Fund with Testnet XRP'}
              </Button>
            ) : (
              <span>Fund it with real XRP from an exchange or another wallet — there is no faucet on Mainnet.</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Retained data again: the lamp says "Live", and a balance that failed to
          refetch is not live. Rather than inventing a stale-lamp state — a new
          visual vocabulary this epic may not add — the reading steps aside and
          the failure above stands in its place, which is what its words say. */}
      {accountState.data?.exists && !accountState.isError && (
        <Readout
          legend="XRP Balance"
          value={formatXrpValue(accountState.data.balanceDrops)}
          unit="XRP"
          marks={marks}
          lamp={
            // The word takes the well's own muted token — the tone token would
            // not hold contrast on readout ground — while the lamp stays green.
            <StatusLegend tone="live" className="text-readout-muted">
              Live
            </StatusLegend>
          }
          footer={
            network === 'testnet' && (
              <Button size="sm" variant="outline" onClick={handleFaucet} disabled={funding}>
                {funding ? 'Requesting…' : 'Fund with Testnet XRP'}
              </Button>
            )
          }
        />
      )}

      {/* Reported beside the readings it belongs to, not in place of the
          balance: the reserve read failing takes down only what is derived
          from it, and `account_info` succeeded. Gated on the reserve read
          alone — when both reads fail the screen says so once per read,
          because one message standing in for two leaves a failure unreported.
          The rows above say what they are in their own words; this carries the
          retry, which is a real button, never disabled, and expires on no
          timer. It says nothing about the balance read: when that one failed
          too, its own message above is what speaks for it — the I/O matrix's
          both-fail row is one message per read, so this one still appears.
          What it does NOT appear beside is a screen where those figures were
          never going to be: the first-load skeleton, and an account that does
          not exist yet. There it would describe a row nobody can see. */}
      {spendable.reserveFailed && (accountState.isError || accountState.data?.exists) && (
        <QueryErrorState
          title="Reserve unavailable"
          description="The network's reserve requirement could not be read from the ledger. Part of this account's balance is reserved and cannot be sent, but the app cannot say how much — so no Spendable or Reserved figure is shown."
          onRetry={() => spendable.retryReserves()}
        />
      )}

      {/* The engraved serial plate. Below the reading, because the address
          answers "which account" and the reading answers "what do I hold" —
          and the second question is the one this screen exists for. */}
      <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
        <AddressDisplay address={wallet.address} />

        <Card>
          <CardHeader className="sm:flex-row sm:items-baseline sm:justify-between">
            <CardTitle>Tokens</CardTitle>
          {nonZeroLines.length > 0 && (
            <span className="font-data text-xs text-muted-foreground">{nonZeroLines.length} held</span>
          )}
        </CardHeader>
          <CardContent className="flex flex-col gap-2">
          {trustLines.isLoading && <Skeleton className="h-12 w-full" />}
          {/* Same false claim as the history empty state: with the read failed,
              `nonZeroLines` is empty because nothing came back, not because
              this account holds no tokens. */}
          {trustLines.isError && (
            <QueryErrorState
              title="Token balances unavailable"
              description="The trust lines for this account could not be read from the ledger, so the app cannot say which tokens it holds."
              onRetry={() => trustLines.refetch()}
            />
          )}
          {nonZeroLines.length === 0 && !trustLines.isLoading && linesReadable && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">No token balances yet</p>
              <p className="text-sm leading-snug text-muted-foreground">
                Holding a token other than XRP needs a trust line to its issuer first. Open one from the Tokens tab.
              </p>
            </div>
          )}
          {nonZeroLines.map((l) => (
            <div
              key={`${l.account}-${l.currency}`}
              className="flex items-center justify-between gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-data text-sm tracking-tight">{displayCurrencyCode(l.currency)}</span>
                {l.freezePeer && (
                  <StatusLegend tone="alert">Frozen by issuer</StatusLegend>
                )}
              </span>
              <span className="font-data text-base tracking-tight">{formatAmountString(l.balance)}</span>
            </div>
          ))}
          {zeroLines.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {zeroLines.length === 1
                ? '1 trust line with a zero balance. See the Tokens tab.'
                : `${zeroLines.length} trust lines with a zero balance. See the Tokens tab.`}
            </p>
          )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
