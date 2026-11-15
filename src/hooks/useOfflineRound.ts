import { useSyncExternalStore } from 'react'
import { roundOf, subscribeRounds, type Round } from '@/lib/offline-round'

/** The kept round of one Offline Wallet, from the in-memory store (OS-FR-13): `null` when none. */
export function useOfflineRound(walletId: string): Round | null {
  return useSyncExternalStore(subscribeRounds, () => roundOf(walletId))
}
