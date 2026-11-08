import { useEffect, useState, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WalletTab } from '@/pages/tabs/WalletTab'
import { WalletScreens } from '@/pages/WalletScreens'
import { useRoute } from '@/hooks/useRoute'
import { isTaskRoute } from '@/lib/route'
import { clearConfigureFocusReturn } from '@/lib/configure-launch'
import type { WalletMeta } from '@/lib/crypto/keystore'
import { OFFLINE_SCREENS, TRANSMITTER_SCREENS } from '@/lib/wallet-kind-words'
import { KindScreenPlate } from './KindScreenPlate'
import { OfflineReceive } from './OfflineReceive'

const SETTINGS = { value: 'wallet', label: 'Local settings' } as const

/**
 * The shell both non-Online kinds share: their own selector, Local settings last,
 * and the routed task screens in place of the tabs. It mounts no ledger hook, so
 * nothing here can ask the pool for a client (OS-FR-1, CAP-1).
 */
function KindShell({
  wallet,
  first,
  count,
  panels,
}: {
  wallet: WalletMeta
  first: string
  count: 5 | 2
  panels: ReadonlyArray<{ value: string; label: string; render: () => ReactNode }>
}) {
  const route = useRoute()
  // A task screen returns to the tab that opened it: Local settings.
  const [tab, setTab] = useState<string>(isTaskRoute(route) ? SETTINGS.value : first)
  useEffect(() => clearConfigureFocusReturn, [])
  if (isTaskRoute(route)) return <WalletScreens route={route} />
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList count={count}>
        {panels.map((p) => (
          <TabsTrigger key={p.value} value={p.value}>
            {p.label}
          </TabsTrigger>
        ))}
        <TabsTrigger value={SETTINGS.value}>{SETTINGS.label}</TabsTrigger>
      </TabsList>
      {panels.map((p) => (
        <TabsContent key={p.value} value={p.value}>
          {p.render()}
        </TabsContent>
      ))}
      <TabsContent value={SETTINGS.value}>
        <WalletTab key={wallet.id} wallet={wallet} />
      </TabsContent>
    </Tabs>
  )
}

/**
 * An Offline Wallet, a signer (OS-FR-1): New transaction, Sign, Receive, Signed and
 * Local settings, with no balance or history. It never reads from or sends to the
 * ledger. Only Receive is built here; every other screen shows its approved title.
 */
export function OfflineWallet({ wallet }: { wallet: WalletMeta }) {
  const s = OFFLINE_SCREENS
  return (
    <KindShell
      wallet={wallet}
      first="new-transaction"
      count={5}
      panels={[
        { value: 'new-transaction', label: s.newTransaction.label, render: () => <KindScreenPlate title={s.newTransaction.title} /> },
        { value: 'sign', label: s.signFromTransmitter.label, render: () => <KindScreenPlate title={s.signFromTransmitter.title} /> },
        { value: 'receive', label: s.receive.label, render: () => <OfflineReceive wallet={wallet} /> },
        { value: 'signed', label: s.signed.label, render: () => <KindScreenPlate title={s.signed.title} /> },
      ]}
    />
  )
}

/**
 * A Transmitter Wallet, a carrier (OS-FR-1, OS-FR-4). Unsynced, which is every
 * Transmitter until Sync exists: Transmit and Local settings. Transmit shows its
 * approved title only.
 */
export function TransmitterWallet({ wallet }: { wallet: WalletMeta }) {
  const s = TRANSMITTER_SCREENS
  return (
    <KindShell
      wallet={wallet}
      first="transmit"
      count={2}
      panels={[{ value: 'transmit', label: s.transmit.label, render: () => <KindScreenPlate title={s.transmit.title} /> }]}
    />
  )
}
