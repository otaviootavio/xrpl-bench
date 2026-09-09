import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppHeader } from '@/components/AppHeader'
import { ChassisShell } from '@/components/ChassisShell'
import { BalancesTab } from './tabs/BalancesTab'
import { SendTab } from './tabs/SendTab'
import { ReceiveTab } from './tabs/ReceiveTab'
import { HistoryTab } from './tabs/HistoryTab'
import { TrustLinesTab } from './tabs/TrustLinesTab'
import { SettingsTab } from './tabs/SettingsTab'
import { useAppStore, useActiveWallet } from '@/store/app-store'
import { useIncomingPaymentNotifications } from '@/hooks/useIncomingPaymentNotifications'
import { useAccountLiveUpdates } from '@/hooks/useAccountLiveUpdates'
import { useAutoLock } from '@/hooks/useAutoLock'
import { useClearCacheOnLock } from '@/hooks/useClearCacheOnLock'
import { useAppUpdate } from '@/hooks/useAppUpdate'
import { Lamp } from '@/components/ui/lamp'

/**
 * The six functions, in a fixed order that never changes with state.
 *
 * Each panel carries its own `<h1>` naming the screen. The product name in the
 * header is a constant and therefore cannot be the document's heading: with it
 * as the `<h1>`, the accessibility outline read identically on all six tabs and
 * never said where you were (docs/decisions.md §6.4). Radix unmounts inactive
 * `TabsContent`, so exactly one `<h1>` exists at a time.
 *
 * That heading is visually hidden because the selected tab already states the
 * screen on screen, with `aria-selected` — a visible duplicate would be
 * redundant ink on a dense panel. The outline needs the node; the eye does not.
 */
const PANELS = [
  { value: 'balances', label: 'Balances', heading: 'Balances', Panel: BalancesTab },
  { value: 'send', label: 'Send', heading: 'Send a payment', Panel: SendTab },
  { value: 'receive', label: 'Receive', heading: 'Receive a payment', Panel: ReceiveTab },
  { value: 'history', label: 'History', heading: 'Transaction history', Panel: HistoryTab },
  { value: 'trustlines', label: 'Tokens', heading: 'Tokens and trust lines', Panel: TrustLinesTab },
  { value: 'settings', label: 'Settings', heading: 'Settings', Panel: SettingsTab },
] as const

export function Main() {
  const network = useAppStore((s) => s.network)
  const wallet = useActiveWallet()
  useIncomingPaymentNotifications(network, wallet?.address ?? null)
  useAccountLiveUpdates(network, wallet?.address ?? null)
  useAutoLock()
  useClearCacheOnLock()
  // US-2's "persistent, quiet marker": a lamp on the Settings tab, so an
  // available update is discoverable without opening Settings first — but
  // never a modal, never a redirect. Declined releases (US-4) don't relight
  // it, only a newer one does.
  const { updateReady, declined } = useAppUpdate()
  const showUpdateMarker = updateReady && !declined

  return (
    // The chassis shell (docs/decisions.md §9.1, N1) reserves the annunciator
    // band at the base for every screen, this one included, so blank lower
    // area reads as panel face and a notice arriving never covers a control.
    <ChassisShell
      header={
        <>
          {/* First focusable element on the page: the header's network and
              wallet selects precede the content on every tab
              (docs/decisions.md §6.4). */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:border focus:border-input focus:bg-card focus:px-3 focus:py-2 focus:font-legend focus:text-sm focus:font-semibold focus:uppercase focus:tracking-[0.09em] focus:shadow-md"
          >
            Skip to content
          </a>
          <AppHeader />
        </>
      }
    >
      {/* tabIndex={-1} so the skip link moves FOCUS here, not just the
          sequential-navigation start point — Safari needs the explicit
          target. It stays out of the tab order. Nothing suppresses the ring on
          this landing target: §6.3 admits no carve-out. */}
      <main id="main-content" tabIndex={-1} className="px-4 pb-6 pt-3">
        <Tabs defaultValue="balances">
          <TabsList>
            {PANELS.map((p) => {
              const marked = p.value === 'settings' && showUpdateMarker
              return (
                <TabsTrigger key={p.value} value={p.value} aria-label={marked ? `${p.label}, update available` : undefined}>
                  {p.label}
                  {marked && <Lamp tone="caution" className="ml-1" />}
                </TabsTrigger>
              )
            })}
          </TabsList>
          {PANELS.map(({ value, heading, Panel }) => (
            <TabsContent key={value} value={value}>
              <h1 className="sr-only">{heading}</h1>
              <Panel />
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </ChassisShell>
  )
}
