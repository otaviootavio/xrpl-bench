import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RenameDialog, type RenameTarget } from '@/components/wallet/RenameDialog'
import { WalletCard } from '@/components/wallet/WalletCard'
import { renameWallet } from '@/lib/crypto/keystore'
import { notify } from '@/lib/notify'
import { tearDownLock } from '@/lib/teardown'
import { useAppStore } from '@/store/app-store'
import { groupWalletsBySeed, type OpenGroup, type WalletGroup } from '@/store/wallet-groups'

/**
 * The chooser (FR-79, FR-81, AD-36): one card per Seed, read from `wallets` and
 * `openLocks` through the one grouping selector and nothing else. It mounts no
 * ledger hook, no `useActiveWallet`/`useActiveNetwork`/`useActiveNode`, no
 * `NetworkPlate` and no `lockInfo` read, and shows no balance. Do not add one:
 * a locked card is typed to hold a name only.
 */
export function Chooser() {
  const wallets = useAppStore((s) => s.wallets)
  const openLocks = useAppStore((s) => s.openLocks)
  const activeWalletId = useAppStore((s) => s.activeWalletId)
  const groups = useMemo(() => groupWalletsBySeed(wallets, openLocks, activeWalletId), [wallets, openLocks, activeWalletId])
  const queryClient = useQueryClient()
  const [sharedNote, setSharedNote] = useState<string | null>(null)
  const [failedSeedId, setFailedSeedId] = useState<string | null>(null)
  const setWallets = useAppStore((s) => s.setWallets)
  const [renaming, setRenaming] = useState<RenameTarget | null>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previous = useRef<Map<string, string> | null>(null)

  // One polite region for every lock-state change, whatever caused it. Written
  // to the node, not held in state; nothing is announced on first render.
  useEffect(() => {
    const now = new Map(groups.map((g) => [g.seedId, g.state]))
    const before = previous.current
    previous.current = now
    if (!before || !statusRef.current) return
    const said: string[] = []
    for (const g of groups) {
      const was = before.get(g.seedId)
      if (was && was !== g.state) said.push(`${g.label}: ${g.state === 'locked' ? 'Locked' : 'Open'}.`)
    }
    if (said.length > 0) statusRef.current.textContent = said.join(' ')
  }, [groups])

  const onLock = useCallback(
    (group: OpenGroup) => {
      const others = groups.filter((g) => g.lockId === group.lockId && g.seedId !== group.seedId).map((g) => g.label)
      try {
        tearDownLock(queryClient, group.lockId)
      } catch {
        setFailedSeedId(group.seedId)
        setSharedNote(null) // an earlier "also locked" line would misdescribe this failure
        return
      }
      setFailedSeedId((id) => (id === group.seedId ? null : id)) // another card's failure stays
      setSharedNote(others.length > 0 ? `Locking ${group.label} also locked ${others.join(', ')}: they share one lock.` : null)
      headingRef.current?.focus()
    },
    [groups, queryClient],
  )

  const onRename = useCallback((group: WalletGroup) => setRenaming({ seedId: group.seedId, name: group.label }), [])

  // The one place a label reaches the store: the keystore's projection of the Seed it wrote.
  const saveName = useCallback(
    async (seedId: string, name: string) => {
      const result = await renameWallet(seedId, name)
      if (!result.ok) return result.reason
      const { wallets: current } = useAppStore.getState()
      // A Seed removed meanwhile is not brought back by its rename.
      if (current.some((w) => w.seedId === seedId)) setWallets(current.filter((w) => w.seedId !== seedId).concat(result.metas))
      // Only this dialog: the user may have cancelled it and opened another card's since.
      setRenaming((r) => (r?.seedId === seedId ? null : r))
      notify.success('Wallet renamed.')
      return true as const
    },
    [setWallets],
  )

  // A failure is about an open card: once that card has flipped (Lock elsewhere, auto-lock) it is
  // cleared, so it cannot come back when the card is opened again. Adjusting state during render.
  if (failedSeedId !== null && !groups.some((g) => g.seedId === failedSeedId && g.state === 'open')) {
    setFailedSeedId(null)
  }

  return (
    <section aria-labelledby="chooser-heading" className="mx-auto flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 id="chooser-heading" ref={headingRef} tabIndex={-1} className="font-legend text-base font-semibold uppercase leading-tight tracking-[0.08em]">
          Wallets
        </h1>
        <p className="text-sm leading-snug text-muted-foreground">Choose a wallet to open. Each one has its own lock.</p>
        {sharedNote && <p className="text-sm leading-snug text-muted-foreground">{sharedNote}</p>}
        <div ref={statusRef} role="status" aria-live="polite" className="sr-only" />
      </div>
      <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        {groups.map((group) => (
          <WalletCard
            key={group.seedId}
            group={group}
            activeWalletId={activeWalletId}
            lockFailed={group.state === 'open' && group.seedId === failedSeedId}
            onLock={onLock}
            onRename={onRename}
          />
        ))}
      </ul>
      <RenameDialog
        target={renaming}
        others={renaming ? groups.filter((g) => g.seedId !== renaming.seedId).map((g) => g.label) : []}
        onSave={saveName}
        onClose={() => setRenaming(null)}
        returnFocusTo={(seedId) => document.querySelector<HTMLElement>(`[data-rename-seed="${CSS.escape(seedId)}"]`)}
      />
    </section>
  )
}
