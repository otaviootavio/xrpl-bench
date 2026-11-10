import { Badge } from '@/components/ui/badge'
import { WAS_ONLINE } from '@/lib/kind-change-words'

/** The Was-online mark in words (`was-online-stamp`, OS-FR-7): the `warning` pair
 * "Real funds" uses, never a colour alone. Always followed by P-4 where it shows. */
export function WasOnlineStamp() {
  return <Badge variant="warning">{WAS_ONLINE}</Badge>
}
