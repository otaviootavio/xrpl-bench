import type { WalletNameReason } from '@/lib/wallet-name'

export const RENAME_ERRORS: Record<WalletNameReason, string> = {
  empty: 'Give this wallet a name.',
  duplicate: 'Another wallet on this device already has that name.',
  'too-long': 'Use 40 characters or fewer.',
}
export const RENAME_HELP = 'Only on this device. Never sent to the ledger.'
export const RENAME_WRITE_FAILED = 'Could not rename the wallet. Nothing was changed.'
