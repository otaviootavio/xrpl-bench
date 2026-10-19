# Signing Check copy — findings

Source: `interfaces:better-writing` review (code reading only), 2026-10-18, of `fix/dialogs-mobile` at `12d3c49` plus its uncommitted tree. Raised by the owner; recorded as finding 8 in the Clodovil ledger.
Baseline Audit Health Score: not given (a copy review does not score). Verified by this run: no, code reading only; every `file:line` below was re-checked against the current code.

Issue IDs are the ledger's own: finding 8 is P2 overall, split into 8a–8i with the review's own severity (HIGH / MEDIUM / LOW). The verdict column holds the wording decision, taken as given from the review and confirmed by the owner for the plan.

## Root cause

The three Signing Check options and the seed-reveal sentence were each written on their own. One describes an absence ("no further check"), two are fragments with different shapes, and none says who the app asks. The result reads as though Standard does no checking, and the options cannot be compared at a glance.

## Issues

| # | Sev | Issue | file:line | Verdict |
|---|---|---|---|---|
| 8a | P2 (HIGH) | Standard describes an absence and reads as "no checking exists" | `CreateWalletFlow.tsx:642`, `EditChecksDialog.tsx:442` | "Signs without asking again once the wallet is open." |
| 8b | P2 (MEDIUM) | Passkey only detail is a fragment, not parallel | `CreateWalletFlow.tsx:653` | "Asks for your passkey on every signature." |
| 8c | P2 (MEDIUM) | App PIN only detail has no verb | `CreateWalletFlow.tsx:664`, `EditChecksDialog.tsx:452` | "Asks for your App PIN on every signature." |
| 8d | P2 (MEDIUM) | Passkey detail, second sentence is a fragment | `EditChecksDialog.tsx:461` | "Asks for your passkey on every signature. The passkey is named after this wallet." |
| 8e | P2 (MEDIUM) | Seed-reveal sentence describes an absence, lowercase "seed", off-pattern with its siblings ("After you confirm, …") | `SettingsTab.tsx:60` (test `settings-reveal.test.tsx:92`, regex `/no further check/`) | "After you confirm, the Seed is shown with no further prompt." |
| 8f | P3 (LOW) | Label drops "Passkey only" when the current check is a passkey | `EditChecksDialog.tsx:460` | "Passkey only: a new passkey" |
| 8g | P3 (LOW) | "No Open Check" has no description while Signing Check options do | `CreateWalletFlow.tsx:618`, `EditChecksDialog.tsx:415` | detail: "Opens without asking. Testnet and Devnet only." Shown only when the option is available. |
| 8h | P3 (LOW) | Open Check passkey detail worded differently from its Signing Check twin | `CreateWalletFlow.tsx:584`, `EditChecksDialog.tsx:403` | "The passkey is named after this wallet." |
| 8i | P3 (LOW) | Open Check label drops "Passkey" when the current check is a passkey | `EditChecksDialog.tsx:402` | "Passkey: a new passkey" |

Checked while writing this file:
- 8g's claim holds: `Unlock.tsx:27` states a lock with no Open Check is Testnet and Devnet only, and `edit-checks-dialog.test.tsx:104` shows it `aria-disabled` on Mainnet with the policy reason. That policy reason is already shown on Mainnet, so the detail must not duplicate it there.
- Tests that name these strings and may break: `settings-reveal.test.tsx:92`; `edit-checks-dialog.test.tsx:114` (`/A new passkey/`, hit by 8f); `edit-checks-dialog.test.tsx:106` and `create-wallet-flow.test.tsx:186,201,202,253,255,297,644` (the `No Open Check` radio, which 8g touches only if the new detail becomes part of its accessible name). No test asserts the old detail strings themselves.
- Decided by the owner's delegation (2026-10-18): lowercase "wallet" stays; 8h and 8i were added; 8g shows only where the option is available.

## Fix order

| Slice | Issues | What ships |
|---|---|---|
| C1 | 8a–8i | New wording on nine lines in three files, plus the tests that name the old text. One build, no dependency on the mobile-dialogs slices. |

## Not verified by the audit — manual checks

- The longer Signing Check detail lines at 320px in the create-wallet flow and Edit checks (wrap, no overflow), both themes.
- Whether the new "No Open Check" detail duplicates the Mainnet policy reason when the option is disabled.
- Screen-reader reading of the radio names after 8f and 8g.

## Constraints

- Copy only: no change to signing, key or Check logic, and no money value touched.
- Glossary terms stay verbatim: Open Check, Signing Check, Standard, App PIN, Seed (PRD §3).
- Nothing styles `:focus`; `outline-none` is banned. No new claim the product cannot back.
- Gates: `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast`.
- Stage by explicit path only: the `fix/dialogs-mobile` working tree is unfinished and must not be swept in.
