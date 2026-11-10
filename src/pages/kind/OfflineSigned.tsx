import { EarlierSigningRecord } from '@/components/wallet/EarlierSigningRecord'
import { useSignedList } from '@/hooks/useSignedList'
import type { KeyWalletMeta } from '@/lib/crypto/keystore'
import { SIGNED_LIST_EMPTY, SIGNED_LIST_LINE } from '@/lib/offline-round-words'
import { OFFLINE_SCREENS } from '@/lib/wallet-kind-words'
import { KindScreenPlate } from './KindScreenPlate'

/**
 * Signed by this wallet (OS-FR-16, P-49, P-56): the signed list, newest first,
 * each entry an earlier-signing record. It holds no blob and no key, and a lock
 * does not erase it. A list that cannot be read shows P-49 alone: never P-56,
 * which would state a failed read as an empty list.
 */
export function OfflineSigned({ wallet }: { wallet: KeyWalletMeta }) {
  const signed = useSignedList(wallet.id)
  const list = signed.status === 'ok' ? [...signed.list].sort((a, b) => b.signedAt - a.signedAt) : []
  return (
    <KindScreenPlate title={OFFLINE_SCREENS.signed.title}>
      <p className="text-sm">{SIGNED_LIST_LINE}</p>
      {signed.status === 'ok' && list.length === 0 && <p className="text-sm text-muted-foreground">{SIGNED_LIST_EMPTY}</p>}
      {list.length > 0 && (
        <ol className="flex min-w-0 flex-col gap-3">
          {list.map((record) => (
            <li key={`${record.hash}-${record.signedAt}`}>
              <EarlierSigningRecord record={record} />
            </li>
          ))}
        </ol>
      )}
    </KindScreenPlate>
  )
}
