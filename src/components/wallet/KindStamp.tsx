import { Badge } from '@/components/ui/badge'
import type { WalletKind } from '@/lib/crypto/db'
import { KIND_WORDS } from '@/lib/wallet-kind-words'

/** The Wallet's kind in words (`kind-stamp`, OS-FR-1): a fixed label, so an `outline`
 * stamp, never a colour and never a lamp. The three kinds differ only by the word. */
export function KindStamp({ kind }: { kind: WalletKind }) {
  return <Badge variant="outline">{KIND_WORDS[kind]}</Badge>
}
