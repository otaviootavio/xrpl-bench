import { useAccountState } from '@/hooks/useAccountState'
import { useSignerList } from '@/hooks/useSignerList'
import type { KeyState } from '@/lib/qr-codec'
import type { NetworkId } from '@/lib/xrpl/networks'

/**
 * The Account's key state from live reads (OS-FR-21: read from the ledger, never stored),
 * in the shape a Data to Sign carries it: Regular Key, master key and signer list. A failed
 * account read is `'unknown'` (P-29), never safe; a failed signer-list read is that row's
 * `'unknown'`. `null` while a read is in flight or the Account is not on the ledger: nothing
 * is claimed (a pending read is not a failed one). Both reads go through the key factory.
 */
export function useLiveKeyState(network: NetworkId, address: string | null, node?: string): KeyState | null {
  const account = useAccountState(network, address, node)
  const signers = useSignerList(network, address, node)
  if (account.isError) return 'unknown'
  const state = account.data
  const signersSettled = signers.isError || signers.data !== undefined
  if (!state?.exists || !signersSettled) return null
  return {
    regular_key: state.regularKey ?? null,
    master_key: state.disableMasterKey ? 'off' : 'on',
    signer_list: signers.isError ? 'unknown' : (signers.data ?? null),
  }
}

/**
 * The key state the warnings need (W5, W2), from the account read alone: the signer list
 * plays no part in them, so they never wait on it (story 11 review). `settled` is false
 * while the account read is in flight: the Online key plate holds its signing keys until
 * then, so no key changes before W5 or W2 could show. `keyState` is `'unknown'` on a failed
 * read (P-29; no W5) and `null` for an Account not on the ledger.
 */
export function useWarningKeyState(network: NetworkId, address: string | null, node?: string): { settled: boolean; keyState: KeyState | null } {
  const account = useAccountState(network, address, node)
  if (account.isError) return { settled: true, keyState: 'unknown' }
  const state = account.data
  if (state === undefined) return { settled: false, keyState: null }
  if (!state.exists) return { settled: true, keyState: null }
  return {
    settled: true,
    keyState: { regular_key: state.regularKey ?? null, master_key: state.disableMasterKey ? 'off' : 'on', signer_list: 'unknown' },
  }
}
