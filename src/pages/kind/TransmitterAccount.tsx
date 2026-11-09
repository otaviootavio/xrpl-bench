import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusLegend } from '@/components/ui/lamp'
import { AddressDisplay } from '@/components/wallet/AddressDisplay'
import { AddressLink } from '@/components/wallet/AddressLink'
import { QueryErrorState } from '@/components/wallet/QueryErrorState'
import { Readout, type ScaleMark } from '@/components/wallet/Readout'
import { TrustLineRow } from '@/components/wallet/TrustLineRow'
import { WarningSentence } from '@/components/wallet/WarningSentence'
import { useAccountState } from '@/hooks/useAccountState'
import { useDelegates } from '@/hooks/useDelegates'
import { useServerReserves } from '@/hooks/useServerReserves'
import { useSpendableBalance } from '@/hooks/useSpendableBalance'
import { useTrustLines } from '@/hooks/useTrustLines'
import type { TransmitterMeta } from '@/lib/crypto/keystore'
import { DELEGATE_WARNING, NONE, VALUE_UNKNOWN } from '@/lib/transmitter-words'
import { MASTER_KEY, REGULAR_KEY, TRANSMITTER_SCREENS } from '@/lib/wallet-kind-words'
import { formatXrp, formatXrpValue } from '@/lib/xrpl/money'
import { KindScreenPlate } from './KindScreenPlate'

/**
 * A Synced Transmitter's Account (OS-FR-4, OS-FR-22, EXPERIENCE "Screens by type"):
 * one read-only screen with the balance readout, the trust lines, the key state
 * and the delegates. Every read goes through the account-scoped key factory for
 * this Wallet's Network and Synced address. A failed read is said as unavailable
 * or as P-29, never as empty or zero, and `isError` wins over retained data.
 * Nothing here offers to sign, fund or change anything. The words are the shipped
 * Balances words and the approved P-n; the signer list has no approved words yet,
 * so it is not shown (story 4 record).
 */
export function TransmitterAccount({ wallet, address }: { wallet: TransmitterMeta; address: string }) {
  const { network, node } = wallet
  const account = useAccountState(network, address, node)
  const spendable = useSpendableBalance(network, address, node)
  const lines = useTrustLines(network, address, node)
  const reserves = useServerReserves(network, node)
  const delegates = useDelegates(network, address, node)

  const marks: ScaleMark[] = spendable.reserveFailed
    ? [
        { label: 'Spendable', value: 'Unavailable', unavailable: true },
        { label: 'Reserved', value: 'Unavailable', unavailable: true },
      ]
    : spendable.status === 'ok' && spendable.spendableDrops !== null && spendable.reservedDrops !== null
      ? [
          { label: 'Spendable', value: formatXrpValue(spendable.spendableDrops) },
          { label: 'Reserved', value: formatXrpValue(spendable.reservedDrops) },
        ]
      : []

  const state = account.isError ? null : account.data
  return (
    <KindScreenPlate title={TRANSMITTER_SCREENS.account.title}>
      <AddressDisplay address={address} />
      {account.isLoading && <Skeleton className="h-36 w-full" />}
      {account.isError && (
        <QueryErrorState
          title="Balance unavailable"
          description="The XRP balance could not be read from the ledger. Nothing is shown here because the app does not know what this account holds right now — this is not a balance of zero."
          onRetry={() => account.refetch()}
        />
      )}
      {state && !state.exists && (
        <Alert variant="warning">
          <AlertTitle>Account not activated yet</AlertTitle>
          <AlertDescription>
            This address needs to receive at least {reserves.data && !reserves.isError ? formatXrp(reserves.data.baseReserveDrops) : 'the base reserve'} to become an account on-ledger.
          </AlertDescription>
        </Alert>
      )}
      {state?.exists && (
        <Readout
          legend="XRP Balance"
          value={formatXrpValue(state.balanceDrops)}
          unit="XRP"
          marks={marks}
          lamp={
            <StatusLegend tone="live" className="text-readout-muted">
              Live
            </StatusLegend>
          }
        />
      )}
      {spendable.reserveFailed && (account.isError || state?.exists) && (
        <QueryErrorState
          title="Reserve unavailable"
          description="The network's reserve requirement could not be read from the ledger. Part of this account's balance is reserved and cannot be sent, but the app cannot say how much — so no Spendable or Reserved figure is shown."
          onRetry={() => spendable.retryReserves()}
        />
      )}

      {/* Key state (OS-FR-21 display): a failed read is P-29, never "safe". An
          account that is not on the ledger has no key state to show. */}
      {(account.isError || state?.exists) && (
        <dl className="flex flex-col gap-2 text-sm">
          <div className="min-w-0">
            <dt className="panel-legend">{REGULAR_KEY}</dt>
            <dd className="mt-0.5 [overflow-wrap:anywhere]">
              {!state ? VALUE_UNKNOWN : state.regularKey ? <AddressLink address={state.regularKey} network={network} /> : NONE}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="panel-legend">{MASTER_KEY}</dt>
            <dd className="mt-0.5">{!state ? VALUE_UNKNOWN : state.disableMasterKey ? 'Master key off' : 'Master key on'}</dd>
          </div>
        </dl>
      )}

      <section aria-label="Tokens and trust lines" className="flex flex-col gap-2">
        <h2 className="panel-legend">Tokens and trust lines</h2>
        {lines.isLoading && <Skeleton className="h-12 w-full" />}
        {lines.isError ? (
          <QueryErrorState
            title="Token balances unavailable"
            description="The trust lines for this account could not be read from the ledger, so the app cannot say which tokens it holds."
            onRetry={() => lines.refetch()}
          />
        ) : lines.data && lines.data.length === 0 ? (
          <p className="text-sm">{NONE}</p>
        ) : (
          lines.data?.map((l) => <TrustLineRow key={`${l.account}-${l.currency}`} line={l} />)
        )}
      </section>

      {/* Delegates (OS-FR-22, P-32): the warning, then each delegate and what the
          ledger lets it do, in the ledger's own permission names. */}
      <section aria-label={DELEGATE_WARNING} className="flex flex-col gap-2">
        <WarningSentence words={DELEGATE_WARNING} />
        {delegates.isError ? (
          <p className="text-sm">{VALUE_UNKNOWN}</p>
        ) : delegates.isLoading || !delegates.data ? (
          <Skeleton className="h-8 w-full" />
        ) : delegates.data.length === 0 ? (
          <p className="text-sm">{NONE}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {delegates.data.map((d) => (
              <li key={d.authorize} className="flex min-w-0 flex-col gap-1 text-sm">
                <AddressLink address={d.authorize} network={network} />
                <span className="font-data text-[0.8125rem] [overflow-wrap:anywhere]">{d.permissions.join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </KindScreenPlate>
  )
}
