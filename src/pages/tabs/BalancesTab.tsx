import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusLegend } from '@/components/ui/lamp'
import { AddressDisplay } from '@/components/wallet/AddressDisplay'
import { Readout, type ScaleMark } from '@/components/wallet/Readout'
import { useAccountState } from '@/hooks/useAccountState'
import { useSpendableBalance } from '@/hooks/useSpendableBalance'
import { useTrustLines } from '@/hooks/useTrustLines'
import { useServerReserves } from '@/hooks/useServerReserves'
import { useAppStore, useActiveWallet } from '@/store/app-store'
import { formatXrp, formatXrpValue, formatAmountString, displayCurrencyCode } from '@/lib/xrpl/money'
import { requestTestnetFunds } from '@/lib/xrpl/faucet'
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
  const { spendableDrops, reservedDrops, isLoading: reserveLoading } = useSpendableBalance(network, address)
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
      await queryClient.invalidateQueries({ queryKey: ['accountState', network, wallet!.address] })
    } catch (err: any) {
      toast.error(err?.message ?? 'Faucet request failed.')
    } finally {
      setFunding(false)
    }
  }

  const nonZeroLines = trustLines.data?.filter((l) => l.balance !== '0') ?? []
  const zeroLines = trustLines.data?.filter((l) => l.balance === '0') ?? []

  const marks: ScaleMark[] =
    !reserveLoading && spendableDrops && reservedDrops
      ? [
          { label: 'Spendable', value: formatXrpValue(spendableDrops) },
          {
            label: 'Reserved',
            value: formatXrpValue(reservedDrops),
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

      {accountState.data && !accountState.data.exists && (
        <Alert variant="warning">
          <AlertTitle>Account not activated yet</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>
              This address needs to receive at least{' '}
              {reserves.data ? formatXrp(reserves.data.baseReserveDrops) : 'the base reserve'} to become an account
              on-ledger.
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

      {accountState.data?.exists && (
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
          {nonZeroLines.length === 0 && !trustLines.isLoading && (
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
