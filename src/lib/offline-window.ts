import type { NetworkId } from '@/lib/xrpl/networks'

/**
 * The signing window, in ledgers: about ten minutes at about four seconds a ledger
 * (OS-FR-16, "ledger count set by architecture"; decided in story 6). Stated to the
 * user as "approximately 10 minutes", never as a promise (P-12, P-13).
 */
export const OFFLINE_LEDGER_WINDOW = 150

/** The highest ledger index a Data to Sign may carry: its LastLedgerSequence must
 * still be a UInt32 (story 6 review). A higher one is malformed. */
export const MAX_RECEIVED_LEDGER_INDEX = 4294967295 - OFFLINE_LEDGER_WINDOW

/**
 * A validated ledger of each Network, as read when this build was made (story 6
 * review): the reference for the ledger-jump warning (P-14) before this Wallet
 * has seen any index, so a first answer can no longer name a ledger far ahead
 * (a window of years) without a warning. `at` is the ledger's close time.
 *
 * Refresh: read `ledger` (`ledger_index: 'validated'`) on each Network's
 * built-in Node and copy `ledger_index` and `ledger.close_time_iso` here.
 * A stale floor only makes the "too high" allowance larger (time since `at`
 * keeps adding ledgers), never refuses. Testnet and Devnet are reset now and
 * then: after a reset their indexes start again below the floor, and the
 * "lower" warning shows until this file is refreshed. Read 2026-11-10.
 */
export const LEDGER_FLOORS: Record<NetworkId, { index: number; at: number }> = {
  mainnet: { index: 108237339, at: Date.parse('2026-11-10T10:26:41Z') },
  testnet: { index: 22214144, at: Date.parse('2026-11-10T10:26:50Z') },
  devnet: { index: 6831893, at: Date.parse('2026-11-10T10:26:51Z') },
}
