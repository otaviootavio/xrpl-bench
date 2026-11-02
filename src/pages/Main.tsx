import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BalancesTab } from './tabs/BalancesTab'
import { SendTab } from './tabs/SendTab'
import { ReceiveTab } from './tabs/ReceiveTab'
import { HistoryTab } from './tabs/HistoryTab'
import { TrustLinesTab } from './tabs/TrustLinesTab'
import { WalletTab } from './tabs/WalletTab'
import { Unlock } from './Unlock'
import { WalletScreens } from './WalletScreens'
import { useRoute } from '@/hooks/useRoute'
import { isTaskRoute } from '@/lib/route'
import { clearConfigureFocusReturn } from '@/lib/configure-launch'
import { useActiveWallet, useActiveNetwork, useActiveNode, useWalletIsOpen } from '@/store/app-store'
import { useIncomingPaymentNotifications } from '@/hooks/useIncomingPaymentNotifications'
import { useAccountLiveUpdates } from '@/hooks/useAccountLiveUpdates'

/** The Local settings tab for the active Wallet; `OpenWallet` mounts it, so the lock is open. */
function WalletPanel() {
  const wallet = useActiveWallet()
  return wallet ? <WalletTab key={wallet.id} wallet={wallet} /> : null
}

/**
 * The six functions, in a fixed order that never changes with state.
 *
 * Each panel carries its own `<h1>` naming the screen (the Local settings tab's is visible and names the wallet). The product name in the
 * header is a constant and therefore cannot be the document's heading: with it
 * as the `<h1>`, the accessibility outline read identically on all six tabs and
 * never said where you were (docs/decisions.md §6.4). Radix unmounts inactive
 * `TabsContent`, so exactly one `<h1>` exists at a time.
 *
 * That heading is visually hidden because the selected tab already states the
 * screen on screen, with `aria-selected` — a visible duplicate would be
 * redundant ink on a dense panel. The outline needs the node; the eye does not. The Local settings tab is the
 * exception: its h1 is on screen as the fixed label "Local settings" and the wallet's name as its own span, because it says whose settings follow.
 */
const PANELS = [
  { value: 'balances', label: 'Balances', heading: 'Balances', Panel: BalancesTab },
  { value: 'send', label: 'Send', heading: 'Send a payment', Panel: SendTab },
  { value: 'receive', label: 'Receive', heading: 'Receive a payment', Panel: ReceiveTab },
  { value: 'history', label: 'History', heading: 'Transaction history', Panel: HistoryTab },
  { value: 'trustlines', label: 'Tokens', heading: 'Tokens and trust lines', Panel: TrustLinesTab },
  { value: 'wallet', label: 'Local settings', heading: null, Panel: WalletPanel },
] as const

/** The six panels and every ledger hook behind them. Mounted ONLY while the
 * active Wallet's lock is open (AD-26): a closed one has no address in play, so
 * nothing here can issue a request that carries it. */
function OpenWallet() {
  const network = useActiveNetwork()
  const node = useActiveNode()
  const wallet = useActiveWallet()
  useIncomingPaymentNotifications(network, wallet?.address ?? null, node)
  useAccountLiveUpdates(network, wallet?.address ?? null, node)
  const route = useRoute()
  // Held here, not in `Tabs`, so the tab the user left (Local settings) is the one a
  // screen returns to; the live hooks above stay mounted behind the screen.
  const [tab, setTab] = useState<string>(isTaskRoute(route) ? 'wallet' : 'balances')
  // A task screen left by the Wallets key, Lock or auto-lock must not leave its focus-return key behind.
  useEffect(() => clearConfigureFocusReturn, [])
  // A task screen takes the whole content area (mobile dialogs S2).
  if (isTaskRoute(route)) return <WalletScreens route={route} />
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        {PANELS.map((p) => (
          <TabsTrigger key={p.value} value={p.value}>
            {p.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {PANELS.map(({ value, heading, Panel }) => (
        <TabsContent key={value} value={value}>
          {heading && <h1 className="sr-only">{heading}</h1>}
          <Panel />
        </TabsContent>
      ))}
    </Tabs>
  )
}

/** The wallet content: the Unlock view or the open wallet. The lifecycle hooks,
 * chassis, header, skip link and main region live in `AppShell` (AD-31). */
export function Main() {
  const wallet = useActiveWallet()
  const open = useWalletIsOpen(wallet?.id)
  if (!wallet) return null
  return open ? <OpenWallet /> : <Unlock key={wallet.id} wallet={wallet} />
}
