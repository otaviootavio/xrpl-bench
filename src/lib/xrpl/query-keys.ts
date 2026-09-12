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
