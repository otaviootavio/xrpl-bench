import { useAppUpdate } from '@/hooks/useAppUpdate'

/**
 * The one predicate for the "update waiting" lamp: an update is waiting and the
 * user has not declined this release. Read by the chooser's XRPL Bench key and the wallet
 * header's Wallets key; nothing else re-derives it. Never a modal, never a
 * redirect (US-2); a declined release does not relight it (US-4).
 */
export function useUpdateMarker(): boolean {
  const { updateReady, declined } = useAppUpdate()
  return updateReady && !declined
}
