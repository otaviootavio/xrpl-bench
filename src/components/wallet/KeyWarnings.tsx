import { Alert, AlertDescription } from '@/components/ui/alert'
import { KeyWarning } from '@/components/wallet/KeyStateRows'
import { isBlackHole, keyWalletHere } from '@/lib/key-warnings'
import { KEY_IS_WALLET_HERE, W1_SENTENCE, W2_SENTENCE } from '@/lib/offline-round-words'
import { fill } from '@/lib/transmit-words'
import { useAppStore } from '@/store/app-store'

/**
 * Under a new Regular Key address (OS-FR-21, EXPERIENCE "Approved strings" W1, W2, P-30):
 * P-30 when a key Wallet on this device has that key, else W1; and W2 when it is one of the
 * two black-hole addresses. Cautions only: nothing here blocks. One component for the
 * Online plate, the Offline and Transmitter Builds and both offline signing reviews.
 */
export function RegularKeyNotes({ address }: { address: string }) {
  const wallets = useAppStore((s) => s.wallets)
  const here = keyWalletHere(wallets, address)
  return (
    <>
      {here ? (
        <Alert role="none">
          <AlertDescription className="break-words">{fill(KEY_IS_WALLET_HERE, here.label)}</AlertDescription>
        </Alert>
      ) : (
        <KeyWarning words={W1_SENTENCE} />
      )}
      {isBlackHole(address) && <KeyWarning words={W2_SENTENCE} />}
    </>
  )
}
