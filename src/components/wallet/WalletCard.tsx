import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusLegend } from '@/components/ui/lamp'
import { AddressLink } from '@/components/wallet/AddressLink'
import { DEVNET_NOTICE } from '@/components/wallet/DevnetNotice'
import { REMOVE_LOCKED_REASON } from '@/components/wallet/remove-copy'
import { NETWORKS } from '@/lib/xrpl/networks'
import { enterWallet } from '@/store/app-store'
import type { LockedGroup, OpenGroup, WalletGroup, WalletRow } from '@/store/wallet-groups'

/** A key that wraps its legend rather than push a card past 320px or 200% text. */
const KEY = 'h-auto min-h-8 max-w-full whitespace-normal py-1 pointer-coarse:min-h-11'

/** The card's name: `{typography.wallet-name}`, sentence case as typed, wraps. */
function CardName({ children }: { children: string }) {
  return <h2 className="min-w-0 break-words text-[0.9375rem] font-semibold leading-tight">{children}</h2>
}

function NetworkRow({ name, row, active, onRemove }: { name: string; row: WalletRow; active: boolean; onRemove: (walletId: string) => void }) {
  const label = NETWORKS[row.network].label
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-background px-3 py-2 shadow-[inset_0_1px_3px_0_color-mix(in_oklab,var(--foreground)_18%,transparent)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-foreground">{label}</span>
          {row.network === 'mainnet' && <Badge variant="warning">Real funds</Badge>}
          {row.network === 'devnet' && <Badge variant="warning">Not stable</Badge>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <AddressLink address={row.address} network={row.network} className="min-w-0" />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={KEY}
              aria-label={`Open ${name} on ${label}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => enterWallet(row.walletId)}
            >
              Open
            </Button>
            <Button type="button" variant="danger" size="sm" className={KEY} aria-label={`Remove ${name} on ${label}`} onClick={() => onRemove(row.walletId)}>
              Remove
            </Button>
          </div>
        </div>
      </div>
      {row.network === 'devnet' && <p className="text-xs text-muted-foreground">{DEVNET_NOTICE}</p>}
    </li>
  )
}

function RenameKey({ group, onRename }: { group: WalletGroup; onRename: (group: WalletGroup) => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={KEY}
      data-rename-seed={group.seedId}
      aria-label={`Rename ${group.label}`}
      onClick={() => onRename(group)}
    >
      Rename
    </Button>
  )
}

function LockedCard({
  group,
  active,
  onRename,
  onRemove,
}: {
  group: LockedGroup
  active: boolean
  onRename: (group: WalletGroup) => void
  onRemove: (walletId: string) => void
}) {
  const reasonId = `remove-reason-${group.seedId}`
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <CardName>{group.label}</CardName>
        <StatusLegend tone="neutral">
          Locked
        </StatusLegend>
      </div>
      {active && <ActiveLegend />}
      <p className="text-sm text-muted-foreground">Locked.</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={KEY}
          aria-label={`Open ${group.label}`}
          aria-current={active ? 'true' : undefined}
          onClick={() => enterWallet(group.entryWalletId)}
        >
          Open
        </Button>
        <RenameKey group={group} onRename={onRename} />
        {/* `aria-disabled`, not `disabled`: it stays reachable and says why. It still routes to the
            chooser's handler, which re-reads the lock and refuses (AD-46). */}
        <Button
          type="button"
          variant="danger"
          size="sm"
          className={`${KEY} aria-disabled:cursor-not-allowed aria-disabled:opacity-60`}
          aria-label={`Remove ${group.label}`}
          aria-disabled="true"
          aria-describedby={reasonId}
          onClick={() => onRemove(group.entryWalletId)}
        >
          Remove
        </Button>
      </div>
      <p id={reasonId} className="text-sm text-muted-foreground">
        {REMOVE_LOCKED_REASON}
      </p>
    </>
  )
}

function ActiveLegend() {
  return <span className="font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Active</span>
}

function OpenCard({
  group,
  activeWalletId,
  lockFailed,
  onLock,
  onRename,
  onRemove,
}: {
  group: OpenGroup
  activeWalletId: string | null
  lockFailed: boolean
  onLock: (group: OpenGroup) => void
  onRename: (group: WalletGroup) => void
  onRemove: (walletId: string) => void
}) {
  const active = group.views.some((v) => v.walletId === activeWalletId)
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <CardName>{group.label}</CardName>
        <StatusLegend tone="live">
          Open
        </StatusLegend>
      </div>
      {active && <ActiveLegend />}
      <ul className="flex flex-col gap-2">
        {group.views.map((row) => (
          <NetworkRow key={row.walletId} name={group.label} row={row} active={row.walletId === activeWalletId} onRemove={onRemove} />
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <RenameKey group={group} onRename={onRename} />
        {group.allowsLock && (
          <Button type="button" variant="outline" size="sm" className={KEY} aria-label={`Lock ${group.label}`} onClick={() => onLock(group)}>
            Lock
          </Button>
        )}
      </div>
      {!group.allowsLock && (
        <p className="text-sm text-muted-foreground">No Open Check: this wallet opens itself, so there is nothing to lock.</p>
      )}
      {lockFailed && (
        <p role="alert" className="text-sm font-medium text-text-destructive">
          Could not lock this wallet. It is still open.
        </p>
      )}
    </>
  )
}

/** One plate per Seed (AD-43). Reads nothing: everything it shows arrives in `group`. */
export function WalletCard({
  group,
  activeWalletId,
  lockFailed = false,
  onLock,
  onRename,
  onRemove,
}: {
  group: WalletGroup
  activeWalletId: string | null
  lockFailed?: boolean
  onLock: (group: OpenGroup) => void
  onRename: (group: WalletGroup) => void
  /** Called with a Wallet id from a card or a row; the handler re-checks the lock. */
  onRemove: (walletId: string) => void
}) {
  return (
    <li className="panel-plate flex flex-col gap-3 rounded-md px-4 pb-4 pt-3">
      {group.state === 'locked' ? (
        <LockedCard group={group} active={group.entryWalletId === activeWalletId} onRename={onRename} onRemove={onRemove} />
      ) : (
        <OpenCard group={group} activeWalletId={activeWalletId} lockFailed={lockFailed} onLock={onLock} onRename={onRename} onRemove={onRemove} />
      )}
    </li>
  )
}
