import type { QueryClient } from '@tanstack/react-query'
import { fetchAccountStateOnce } from './xrpl/query-reads'
import type { NetworkId } from './xrpl/networks'

/**
 * What both Seed-import screens share, so importing a Seed is the same
 * operation wherever it is done (Epic 11, G-24): the same check, in the same
 * order, reported in the same words.
 *
 * The order is: parse the input (`parseSeedInput` in the keystore), ask this
 * module whether the operator must be warned, and only then write to the
 * vault — immediately if there is no warning, or once the operator has read
 * it and chosen to continue. Nothing here receives the Seed: the screen derives
 * the address through the keystore and hands over only that.
 */

/** The one message for a value that is not a Seed, on both screens. */
export const INVALID_SEED_MESSAGE = 'That seed looks invalid. Double-check and try again.'

/**
 * Why an import must stop and ask before the vault write.
 *
 * - `master-key-disabled` — the account exists and has `lsfDisableMaster` set.
 * - `unchecked` — the account could not be read, so nobody knows. A failed read
 *   is not the permissive answer (AD-13): it gets a warning of its own rather
 *   than the silent path an account with a working master key gets.
 */
export type ImportWarning = 'master-key-disabled' | 'unchecked'

export const IMPORT_WARNING_COPY: Record<ImportWarning, { title: string; body: string }> = {
  'master-key-disabled': {
    title: 'Master key disabled',
    body:
      "This account's master key is disabled (a Regular Key has been set elsewhere). Signing with this seed alone may not work. " +
      'The seed has not been saved yet.',
  },
  unchecked: {
    title: 'Master key not checked',
    body:
      'The wallet could not read this account from the ledger, so it could not check whether its master key is disabled. ' +
      'If a Regular Key has been set elsewhere, signing with this seed alone may not work. The seed has not been saved yet.',
  },
}

/**
 * Reads the account a Seed belongs to and says whether the import must warn
 * before it writes. `null` means "write now": the account either does not
 * exist yet (nothing can have disabled its key) or exists with its master key
 * enabled.
 *
 * Never throws for a ledger that cannot be reached — that is `'unchecked'`,
 * the same answer on both screens.
 */
export async function checkBeforeImport(
  queryClient: QueryClient,
  network: NetworkId,
  address: string,
): Promise<ImportWarning | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), IMPORT_CHECK_TIMEOUT_MS)
  })
  try {
    const state = await Promise.race([fetchAccountStateOnce(queryClient, network, address), timedOut])
    if (state === 'timeout') return 'unchecked'
    return state.exists && state.disableMasterKey ? 'master-key-disabled' : null
  } catch {
    return 'unchecked'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * How long the pre-flight check may take before it is reported as
 * `'unchecked'`. Without a bound, a socket that dies without closing — seen in
 * the browser pass with the connection dropped under an already-open client —
 * left the operator at "Checking…" for about forty seconds before the request
 * timed out underneath. Not checking is reported, never assumed fine, so a
 * short bound costs a warning, not safety.
 */
export const IMPORT_CHECK_TIMEOUT_MS = 15_000
