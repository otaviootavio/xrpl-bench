import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusLegend } from '@/components/ui/lamp'
import { AddressLink } from '@/components/wallet/AddressLink'
import { DEVNET_NOTICE } from '@/components/wallet/DevnetNotice'
import { NO_OPEN_CHECK_ANSWER } from '@/components/wallet/check-words'
import { NETWORKS } from '@/lib/xrpl/networks'
import { enterWallet } from '@/store/app-store'
import type { OpenCard, WalletCardData } from '@/store/wallet-groups'

/** A key that wraps its legend rather than push a card past 320px or 200% text. */
const KEY = 'h-auto min-h-8 max-w-full whitespace-normal py-1 pointer-coarse:min-h-11'

/** The card's name: `{typography.wallet-name}`, sentence case as typed, wraps. */
function CardName({ children }: { children: string }) {
  // tabIndex -1: the Chooser puts focus here once, on the card Add wallet just made.
  return (
    <h2 tabIndex={-1} className="min-w-0 break-words text-[0.9375rem] font-semibold leading-tight">
      {children}
    </h2>
  )
}

/** Name, then its one state word (and "Active" beside it): the head every card opens with. */
function CardHead({ name, tone, state, active }: { name: string; tone: 'neutral' | 'live'; state: string; active: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <CardName>{name}</CardName>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusLegend tone={tone}>{state}</StatusLegend>
        {active && <ActiveLegend />}
      </div>
    </div>
  )
}

function ActiveLegend() {
  return (
    <>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <span className="font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Active</span>
    </>
  )
}

/** One plate per Wallet (AD-43, FR-93). Reads nothing: everything it shows arrives in `card`. */
export function WalletCard({
  card,
  activeWalletId,
  lockFailed = false,
  onLock,
}: {
  card: WalletCardData
  activeWalletId: string | null
  lockFailed?: boolean
  onLock: (card: OpenCard) => void
}) {
  const active = card.walletId === activeWalletId
  const open = card.state === 'open'
  const label = NETWORKS[card.network].label
  return (
    <li data-wallet-id={card.walletId} className="panel-plate flex flex-col gap-3 rounded-md px-4 pb-4 pt-3">
      <CardHead name={card.label} tone={open ? 'live' : 'neutral'} state={open ? 'Open' : 'Locked'} active={active} />
      <div className="flex flex-col gap-2 rounded-md border border-border bg-background px-3 py-2 shadow-[inset_0_1px_3px_0_color-mix(in_oklab,var(--foreground)_18%,transparent)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-foreground">{label}</span>
          {card.network === 'mainnet' && <Badge variant="warning">Real funds</Badge>}
          {card.network === 'devnet' && <Badge variant="warning">Not stable</Badge>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <AddressLink address={card.address} network={card.network} className="min-w-0" />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={KEY}
              aria-label={`Open ${card.label} on ${label}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => enterWallet(card.walletId)}
            >
              Open
            </Button>
            {card.state === 'open' && card.allowsLock && (
              <Button type="button" variant="outline" size="sm" className={KEY} aria-label={`Lock ${card.label} on ${label}`} onClick={() => onLock(card)}>
                Lock
              </Button>
            )}
          </div>
        </div>
      </div>
      {card.network === 'devnet' && <p className="text-xs text-muted-foreground">{DEVNET_NOTICE}</p>}
      {card.state === 'open' && !card.allowsLock && (
        <p className="text-sm text-muted-foreground">{NO_OPEN_CHECK_ANSWER}. This wallet opens itself, so there is nothing to lock.</p>
      )}
      {card.state === 'open' && lockFailed && (
        <p role="alert" className="text-sm font-medium text-text-destructive">
          Could not lock this wallet. It is still open.
        </p>
      )}
    </li>
  )
}
