import { AddressDisplay } from '@/components/wallet/AddressDisplay'
import { QrCode } from '@/components/wallet/QrCode'
import { OFFLINE_SCREENS } from '@/lib/wallet-kind-words'
import type { WalletMeta } from '@/lib/crypto/keystore'
import { KindScreenPlate } from './KindScreenPlate'

/**
 * An Offline Wallet's Receive (OS-FR-1, CAP-1): the address and its QR, from the
 * record, with no read. A savings wallet must be able to show where to deposit,
 * and it cannot know whether the account exists or needs a tag, so it says nothing
 * about either. Not `ReceiveTab`: that one reads the account's settings.
 */
export function OfflineReceive({ wallet }: { wallet: WalletMeta }) {
  return (
    <KindScreenPlate title={OFFLINE_SCREENS.receive.title}>
      <AddressDisplay address={wallet.address} />
      <div className="flex justify-center">
        <QrCode address={wallet.address} />
      </div>
    </KindScreenPlate>
  )
}
