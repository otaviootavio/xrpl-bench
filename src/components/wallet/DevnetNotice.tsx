import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { NetworkId } from '@/lib/xrpl/networks'

/** The words that must accompany Devnet wherever a Wallet on it is shown or
 * chosen (FR-61): visible text, not a tooltip. */
export const DEVNET_NOTICE = 'Devnet is not a stable ledger — it can be reset, so a Wallet may need re-funding.'

export function DevnetNotice({ network }: { network: NetworkId }) {
  if (network !== 'devnet') return null
  return (
    <Alert variant="warning">
      <AlertTitle>Devnet</AlertTitle>
      <AlertDescription>{DEVNET_NOTICE}</AlertDescription>
    </Alert>
  )
}
