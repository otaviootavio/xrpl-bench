import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { WalletCard } from '@/components/wallet/WalletCard'
import { Button } from '@/components/ui/button'
import { consumeAdded } from '@/lib/chooser-signals'
import { ADD_WALLET_PATH, navigate } from '@/lib/route'
import { tearDownLock } from '@/lib/teardown'
import { useAppStore } from '@/store/app-store'
import { listWalletCards, type OpenCard } from '@/store/wallet-groups'

/**
 * The chooser (FR-79, FR-81, AD-36): one card per Wallet, read from `wallets` and
 * `openLocks` through the one card selector and nothing else. It mounts no
 * ledger hook, no `useActiveWallet`/`useActiveNetwork`/`useActiveNode`, no
 * `NetworkPlate` and no `lockInfo` read, and shows no balance. Do not add one:
 * a locked card is typed to hold a name, address and Network only.
 */
export function Chooser() {
  const wallets = useAppStore((s) => s.wallets)
  const openLocks = useAppStore((s) => s.openLocks)
  const activeWalletId = useAppStore((s) => s.activeWalletId)
  const cards = useMemo(() => listWalletCards(wallets, openLocks), [wallets, openLocks])
  const queryClient = useQueryClient()
  const [sharedNote, setSharedNote] = useState<string | null>(null)
  const [failedWalletId, setFailedWalletId] = useState<string | null>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previous = useRef<Map<string, string> | null>(null)

  // Add wallet announced the card it made: focus its h2, once. A cold start announced nothing.
  useEffect(() => {
    const walletId = consumeAdded()
    if (!walletId) return
    // The card is not there (a failed refresh): the h1 still names the screen.
    const card = document.querySelector<HTMLElement>(`[data-wallet-id="${CSS.escape(walletId)}"] h2`)
    ;(card ?? headingRef.current)?.focus()
  }, [])

  // One polite region for every lock-state change, whatever caused it. Written
  // to the node, not held in state; nothing is announced on first render.
  useEffect(() => {
    const now = new Map(cards.map((c) => [c.walletId, c.state]))
    const before = previous.current
    previous.current = now
    if (!before || !statusRef.current) return
    const said: string[] = []
    for (const g of cards) {
      const was = before.get(g.walletId)
      if (was && was !== g.state) said.push(`${g.label}: ${g.state === 'locked' ? 'Locked' : 'Open'}.`)
    }
    if (said.length > 0) statusRef.current.textContent = said.join(' ')
  }, [cards])

  const onLock = useCallback(
    (card: OpenCard) => {
      const others = cards.filter((g) => g.lockId === card.lockId && g.walletId !== card.walletId).map((g) => g.label)
      try {
        tearDownLock(queryClient, card.lockId)
      } catch {
        setFailedWalletId(card.walletId)
        setSharedNote(null) // an earlier "also locked" line would misdescribe this failure
        return
      }
      setFailedWalletId((id) => (id === card.walletId ? null : id)) // another card's failure stays
      setSharedNote(others.length > 0 ? `Locking ${card.label} also locked ${others.join(', ')}: they share one lock.` : null)
      headingRef.current?.focus()
    },
    [cards, queryClient],
  )

  // A failure is about an open card: once that card has flipped (Lock elsewhere, auto-lock) it is
  // cleared, so it cannot come back when the card is opened again. Adjusting state during render.
  if (failedWalletId !== null && !cards.some((g) => g.walletId === failedWalletId && g.state === 'open')) {
    setFailedWalletId(null)
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
      <ul className="flex flex-col gap-3">
        {cards.map((card) => (
          <WalletCard
            key={card.walletId}
            card={card}
            activeWalletId={activeWalletId}
            lockFailed={card.state === 'open' && card.walletId === failedWalletId}
            onLock={onLock}
          />
        ))}
      </ul>
      <Button type="button" variant="outline" className="h-auto min-h-8 w-full sm:w-fit whitespace-normal py-1 pointer-coarse:min-h-11" onClick={() => navigate(ADD_WALLET_PATH)}>
        Add wallet
      </Button>
    </section>
  )
}
