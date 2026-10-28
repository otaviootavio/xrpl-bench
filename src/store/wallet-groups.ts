import type { WalletMeta } from '@/lib/crypto/keystore'

/** One view of a Seed, as an open card shows it. */
export interface WalletRow {
  walletId: string
  network: WalletMeta['network']
  address: string
  hasNode: boolean
}

/** A closed lock: a name and the ids needed to enter, nothing else (AD-43, AD-26).
 * Do not add a field: the chooser cannot render what this type does not hold. */
export interface LockedGroup {
  state: 'locked'
  seedId: string
  lockId: string
  label: string
  entryWalletId: string
}

export interface OpenGroup {
  state: 'open'
  seedId: string
  lockId: string
  label: string
  entryWalletId: string
  /** The entry view's Open Check is not `none`. */
  allowsLock: boolean
  views: WalletRow[]
}

export type WalletGroup = LockedGroup | OpenGroup

const byCreated = (a: WalletMeta, b: WalletMeta) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** One group per Seed, ordered by Seed `createdAt` then `seedId` (AD-43). Pure. */
export function groupWalletsBySeed(
  wallets: readonly WalletMeta[],
  openLocks: Readonly<Record<string, unknown>>,
  activeWalletId: string | null,
): WalletGroup[] {
  const bySeed = new Map<string, WalletMeta[]>()
  for (const w of wallets) {
    const list = bySeed.get(w.seedId)
    if (list) list.push(w)
    else bySeed.set(w.seedId, [w])
  }
  const groups: { seedId: string; createdAt: number; group: WalletGroup }[] = []
  for (const [seedId, list] of bySeed) {
    const views = [...list].sort(byCreated)
    const entry =
      views.find((v) => v.id === activeWalletId) ?? views.find((v) => v.id === seedId) ?? views[0]
    const isOpen = Object.prototype.hasOwnProperty.call(openLocks, entry.lockId)
    const group: WalletGroup = isOpen
      ? {
          state: 'open',
          seedId,
          lockId: entry.lockId,
          label: entry.label,
          entryWalletId: entry.id,
          allowsLock: entry.openCheck !== 'none',
          views: views.map((v) => ({
            walletId: v.id,
            network: v.network,
            address: v.address,
            hasNode: v.node !== undefined && v.node !== '',
          })),
        }
      : // Explicit fields, not a spread: a field added for the open variant must not reach a locked card.
        { state: 'locked', seedId, lockId: entry.lockId, label: entry.label, entryWalletId: entry.id }
    groups.push({ seedId, createdAt: views[0].createdAt, group })
  }
  groups.sort((a, b) => a.createdAt - b.createdAt || (a.seedId < b.seedId ? -1 : a.seedId > b.seedId ? 1 : 0))
  return groups.map((g) => g.group)
}
