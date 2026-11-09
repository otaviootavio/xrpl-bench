import { useEffect, useState, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WalletTab } from '@/pages/tabs/WalletTab'
import { WalletScreens } from '@/pages/WalletScreens'
import { useRoute } from '@/hooks/useRoute'
import { isTaskRoute } from '@/lib/route'
import { clearConfigureFocusReturn } from '@/lib/configure-launch'
import type { KeyWalletMeta, TransmitterMeta, WalletMeta } from '@/lib/crypto/keystore'
import { HistoryTab } from '@/pages/tabs/HistoryTab'
import { useAccountLiveUpdates } from '@/hooks/useAccountLiveUpdates'
import { TransmitScreen } from './TransmitScreen'
import { TransmitterAccount } from './TransmitterAccount'
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
  panels: ReadonlyArray<{
    value: string
    label: string
    render: () => ReactNode
  }>
}) {
  const route = useRoute()
  // A task screen returns to the tab that opened it: Local settings.
  const [tab, setTab] = useState<string>(isTaskRoute(route) ? SETTINGS.value : first)
  useEffect(() => clearConfigureFocusReturn, [])
  if (isTaskRoute(route)) return <WalletScreens route={route} />
  // A screen that went away (a Transmitter's Sync removed) falls back to the first one.
  const value = tab === SETTINGS.value || panels.some((p) => p.value === tab) ? tab : first
  return (
    <Tabs value={value} onValueChange={setTab}>
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
export function OfflineWallet({ wallet }: { wallet: KeyWalletMeta }) {
  const s = OFFLINE_SCREENS
  return (
    <KindShell
      wallet={wallet}
      first="new-transaction"
      count={5}
      panels={[
        {
          value: 'new-transaction',
          label: s.newTransaction.label,
          render: () => <KindScreenPlate title={s.newTransaction.title} />,
        },
        {
          value: 'sign',
          label: s.signFromTransmitter.label,
          render: () => <KindScreenPlate title={s.signFromTransmitter.title} />,
        },
        {
          value: 'receive',
          label: s.receive.label,
          render: () => <OfflineReceive wallet={wallet} />,
        },
        {
          value: 'signed',
          label: s.signed.label,
          render: () => <KindScreenPlate title={s.signed.title} />,
        },
      ]}
    />
  )
}

/**
 * A Transmitter Wallet, a carrier (OS-FR-1, OS-FR-3, OS-FR-4). Unsynced: Transmit
 * and Local settings. Synced: Transmit, Account, History, New transaction and Local
 * settings; the screens change on the next render after a Sync change. Account and
 * History are read-only views of the Synced address. New transaction shows its
 * title only: building an Unsigned Transaction is story 9. Nothing here signs.
 */
export function TransmitterWallet({ wallet }: { wallet: TransmitterMeta }) {
  const s = TRANSMITTER_SCREENS
  const address = wallet.address
  const transmit = {
    value: 'transmit',
    label: s.transmit.label,
    render: () => <TransmitScreen wallet={wallet} />,
  }
  return (
    <>
      {/* Live account updates only for a Synced address; an unsynced one mounts nothing that reads. */}
      {address && <LiveUpdates wallet={wallet} address={address} />}
      <KindShell
        wallet={wallet}
        first="transmit"
        count={address ? 5 : 2}
        panels={
          address
            ? [
                transmit,
                {
                  value: 'account',
                  label: s.account.label,
                  render: () => <TransmitterAccount wallet={wallet} address={address} />,
                },
                {
                  value: 'history',
                  label: s.history.label,
                  render: () => (
                    <>
                      <h1 className="sr-only">{s.history.title}</h1>
                      <HistoryTab />
                    </>
                  ),
                },
                {
                  value: 'new-transaction',
                  label: s.newTransaction.label,
                  render: () => <KindScreenPlate title={s.newTransaction.title} />,
                },
              ]
            : [transmit]
        }
      />
    </>
  )
}

function LiveUpdates({ wallet, address }: { wallet: TransmitterMeta; address: string }) {
  useAccountLiveUpdates(wallet.network, address, wallet.node)
  return null
}
