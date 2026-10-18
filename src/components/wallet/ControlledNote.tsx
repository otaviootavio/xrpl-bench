import { StatusLegend } from '@/components/ui/lamp'
import { useAccountState } from '@/hooks/useAccountState'
import { controlStatus, operatesAnotherAccount, type ControlStatus } from '@/lib/control'
import type { WalletMeta } from '@/lib/crypto/keystore'

const WORDS: Record<ControlStatus, { tone: 'live' | 'caution' | 'neutral'; text: string; sentence: string }> = {
  controlled: { tone: 'live', text: 'Controlled', sentence: 'The ledger shows this wallet’s key as the Regular Key.' },
  'not-controlled': { tone: 'caution', text: 'Not controlled', sentence: 'The ledger no longer shows this wallet’s key as the Regular Key, so it cannot sign.' },
  unknown: { tone: 'neutral', text: 'Unknown', sentence: 'The ledger could not be read, or the account is not on it.' },
}

/**
 * Says plainly that a Wallet operates another Account as that Account's Regular
 * Key, with the live status from the ledger as text (AD-29): never remembered,
 * never colour alone. Mount only for a Wallet whose lock is open (AD-26).
 */
export function ControlledNote({ wallet }: { wallet: WalletMeta }) {
  // The read lives in the inner component, so a Wallet on its own Account asks nothing.
  return operatesAnotherAccount(wallet) ? <ControlledNoteBody wallet={wallet} /> : null
}

function ControlledNoteBody({ wallet }: { wallet: WalletMeta }) {
  const account = useAccountState(wallet.network, wallet.address, wallet.node)
  const status = controlStatus(account.isError ? null : account.data, wallet.keyAddress)
  const words = WORDS[status]
  return (
    <div className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground" data-testid="controlled-note">
      <p>This wallet operates another account as that account’s Regular Key. Its own address is {wallet.keyAddress}.</p>
      <StatusLegend tone={words.tone}>{words.text}</StatusLegend>
      <p>{words.sentence}</p>
    </div>
  )
}
