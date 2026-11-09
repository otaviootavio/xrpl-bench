import type { WalletMeta } from '@/lib/crypto/keystore'

type NetworkId = WalletMeta['network']
type WalletKind = WalletMeta['kind']

/** A closed lock: the six things a card may show and nothing else (AD-43, AD-26, FR-93).
 * The kind joined the Network as a record field, not an Account read (UX owner ruling,
 * 2026-11-08: a locked card still shows its name, kind and Network; OS-FR-1).
 * Do not add another field (no Node, check kind or balance): the chooser cannot render what this type does not hold. */
export interface LockedCard {
  state: 'locked'
  walletId: string
  lockId: string
  label: string
  /** The Account, or `null` for a Transmitter that is not synced (P-5). */
  address: string | null
  network: NetworkId
  kind: WalletKind
}

export interface OpenCard extends Omit<LockedCard, 'state'> {
  state: 'open'
  /** This Wallet's Open Check is not `none`. */
  allowsLock: boolean
  hasNode: boolean
}

export type WalletCardData = LockedCard | OpenCard

const byCreated = (a: WalletMeta, b: WalletMeta) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Every Wallet in chooser order: Seeds by `createdAt` then `seedId`, each Seed's views in
 * view order (AD-43). The one ordering `listWalletCards` and `walletIdsInChooserOrder` share. */
function inChooserOrder(wallets: readonly WalletMeta[]): WalletMeta[] {
  const bySeed = new Map<string, WalletMeta[]>()
  for (const w of wallets) {
    const list = bySeed.get(w.seedId)
    if (list) list.push(w)
    else bySeed.set(w.seedId, [w])
  }
  return [...bySeed]
    .map(([seedId, list]) => ({ seedId, views: [...list].sort(byCreated) }))
    .sort((a, b) => a.views[0].createdAt - b.views[0].createdAt || byText(a.seedId, b.seedId))
    .flatMap((g) => g.views)
}

/** Every Wallet's id in chooser order, the order `listWalletCards` lays the cards in. */
export function walletIdsInChooserOrder(wallets: readonly WalletMeta[]): string[] {
  return inChooserOrder(wallets).map((w) => w.id)
}

/**
 * The one place the Active Wallet is re-picked after a removal (AD-46): `activeId`
 * if it is still there, else the first Wallet in chooser order, else `null`. Pure.
 * `remainingInChooserOrder` is every Wallet left (`walletIdsInChooserOrder`); the
 * removed id is never chosen, whatever the list holds.
 */
export function nextActiveWalletId(
  removedId: string,
  activeId: string | null,
  remainingInChooserOrder: readonly string[],
): string | null {
  const left = remainingInChooserOrder.filter((id) => id !== removedId)
  if (activeId !== null && activeId !== removedId && left.includes(activeId)) return activeId
  return left[0] ?? null
}

/** One card per Wallet, in chooser order (AD-43, FR-93). Pure; a lock is open when the Wallet's own `lockId` is. */
export function listWalletCards(wallets: readonly WalletMeta[], openLocks: Readonly<Record<string, unknown>>): WalletCardData[] {
  return inChooserOrder(wallets).map((w): WalletCardData =>
    Object.prototype.hasOwnProperty.call(openLocks, w.lockId)
      ? {
          state: 'open',
          walletId: w.id,
          lockId: w.lockId,
          label: w.label,
          address: w.address,
          network: w.network,
          kind: w.kind,
          allowsLock: w.openCheck !== 'none',
          hasNode: w.node !== undefined && w.node !== '',
        }
      : // Explicit fields, not a spread: a field added for the open variant must not reach a locked card.
        { state: 'locked', walletId: w.id, lockId: w.lockId, label: w.label, address: w.address, network: w.network, kind: w.kind },
  )
}
