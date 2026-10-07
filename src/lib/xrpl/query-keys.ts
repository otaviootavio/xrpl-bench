import type { QueryClient } from '@tanstack/react-query'
import type { NetworkId } from './networks'

/**
 * The single factory that owns every TanStack Query key in the app.
 *
 * Nothing else constructs a key literal, for a read or for an invalidation.
 * Before this module, ten read keys were written by hand and four invalidation
 * sites retyped ten more literals they hoped were the same, with nothing
 * checking the two matched — a key typed differently at an invalidation site
 * leaves the stale entry in the cache, which after a wallet switch or a send
 * means the previous wallet's balance stays on screen.
 *
 * The rule: a read scoped to an account is keyed on the active network and the
 * active wallet's address, so a key cannot be built without them. A read that
 * is genuinely account-independent or device-scoped is a named function here,
 * so the exception is visible in this file rather than implied at a call site.
 *
 * Discarding cached account data goes through one path only:
 * `invalidateAccountScoped()`, below. No call site names an account-scoped key
 * to `invalidateQueries` — four sites that each picked their own subset left
 * history stale after a trust-line change and the incoming-payment watch stale
 * after a send. `scripts/check-account-invalidation.mjs`, run by `bun run lint`,
 * is the guard that enforces this one-path rule; it reads the account-scoped
 * names off the `accountScoped` table below, so keep that table's shape. The
 * destination check is not account-scoped and has its own single helper,
 * `invalidateDestinationCheck()`.
 *
 * `scripts/check-query-keys.mjs`, run by `bun run lint`, rejects any key
 * literal written outside this module.
 */

/** The shape every account-scoped key has: its name, the active network, and
 * the active wallet's address. Declaring the return as a three-element tuple
 * is what makes an account-scoped builder that forgets the address fail the
 * typecheck — a key missing the address is shared across wallets, which is the
 * exact defect this module exists to prevent. */
export type AccountScopedKey = readonly [name: string, network: NetworkId, address: string | null]

export type AccountScopedKeyBuilder = (
  network: NetworkId,
  address: string | null,
) => AccountScopedKey

/** Account-scoped keys — the rule, not an exception. */
const accountScoped = {
  accountState: (network: NetworkId, address: string | null) =>
    ['accountState', network, address] as const,

  accountTx: (network: NetworkId, address: string | null) =>
    ['accountTx', network, address] as const,

  trustLines: (network: NetworkId, address: string | null) =>
    ['trustLines', network, address] as const,

  incomingPaymentWatch: (network: NetworkId, address: string | null) =>
    ['incomingPaymentWatch', network, address] as const,
} satisfies Record<string, AccountScopedKeyBuilder>

/**
 * Invalidates every account-scoped entry for one network and one address, and
 * resolves once each member's invalidation has resolved.
 *
 * The group is `accountScoped` itself, so a builder added there joins it with
 * no call site edited. Network-, destination- and device-scoped keys are not in
 * that table and are never touched; neither is another wallet or network.
 *
 * This is a function that performs the loop, not an exported list of keys for
 * callers to iterate: a key bound to a variable at a call site is invisible to
 * `check-query-keys.mjs`, so handing the set out would recreate four
 * unguarded invalidation sites.
 */
export async function invalidateAccountScoped(
  client: Pick<QueryClient, 'invalidateQueries'>,
  network: NetworkId,
  address: string | null,
): Promise<void> {
  await Promise.all(
    Object.values(accountScoped).map((build) =>
      client.invalidateQueries({ queryKey: build(network, address) }),
    ),
  )
}

/**
 * Marks the destination check stale for one destination on one network — every
 * asset's entry for it — so its next read, and the submit path's post-unlock
 * probe, go back to the ledger instead of a cached answer.
 *
 * A validated send is the one moment the app itself changes what that check
 * says: a payment can activate the address it went to. `destinationInfo` is
 * deliberately outside the `accountScoped` group (it is keyed on someone
 * else's account), so `invalidateAccountScoped()` never reaches it, and without
 * this the form went on saying "not activated" for up to the freshness window
 * and the next send's probe was served from that cache.
 *
 * Every asset, not only the one just sent: an XRP payment that activates an
 * address makes `exists: false` false for that address's token entries too.
 * The prefix `['destinationInfo', network, destination]` reaches exactly those
 * entries and no other destination's.
 */
export async function invalidateDestinationCheck(
  client: Pick<QueryClient, 'invalidateQueries'>,
  network: NetworkId,
  destination: string,
): Promise<void> {
  await client.invalidateQueries({ queryKey: ['destinationInfo', network, destination] })
}

export const queryKeys = {
  ...accountScoped,

  // --- Destination-scoped: an exception. ---

  /** Keyed on the **destination** being looked up, not on the active wallet —
   * the Send form asks about someone else's account, so this entry must not be
   * shared with or invalidated alongside the active wallet's own reads. */
  destinationInfo: (network: NetworkId, destination: string, asset: string) =>
    ['destinationInfo', network, destination, asset] as const,

  // --- Network-scoped: an exception. ---

  /** Ledger-wide reserve settings: the same for every account on a network, so
   * no address element appears and a wallet switch must not invalidate it. */
  serverReserves: (network: NetworkId) => ['serverReserves', network] as const,

  /** Ledger-wide fee estimate; account-independent for the same reason. The
   * literal's first element is `'fee'`, not the function name — it is the key
   * this cache entry has always had. */
  recommendedFee: (network: NetworkId) => ['fee', network] as const,

  // --- Device-scoped: an exception. ---

  /** Whether this device has a passkey registered against the local vault.
   * Neither wallet- nor network-dependent: unaffected by any switch. */
  passkeyRegistered: () => ['passkeyRegistered'] as const,

  /** The local unlock-attempt lockout. Device-scoped for the same reason. */
  lockoutState: () => ['lockoutState'] as const,
}
