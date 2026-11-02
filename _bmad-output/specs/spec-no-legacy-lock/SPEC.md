---
id: SPEC-no-legacy-lock
companions: []
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# No legacy lock, no backward compatibility (FR-95)

## Why

A mandate the owner set: the product has not launched and has no users, yet the code carries a legacy lock, a startup migration and fallbacks for records no build will ever write again (about 46 source and 43 test references). It costs review time on code that signs for real money, makes UI copy wrong (the chooser says each wallet has its own lock; first-run Import breaks that), and keeps AD-27 and FR-74 alive for nobody. Source: PRD FR-95 and `addendum.md` §9 in `_bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/`. Built in PR #56 on `feat/create-wallet-quiz`.

## Capabilities

- **CAP-1**
  - **intent:** Every Wallet gets its own lock when it is created, including the first Wallet at first-run Onboarding, created or imported.
  - **success:** On a clean install, importing a Seed at first run yields a Wallet whose lock id is its own; locking one Wallet leaves another open; no Wallet's lock id is `legacy`. A controlled Wallet still opens with the lock of the Wallet that holds its key.

- **CAP-2**
  - **intent:** The app contains no migration and no legacy lock: it does not read, upgrade or repair a record an older build wrote.
  - **success:** `LEGACY_LOCK_ID`, `migrateLegacyVault`, its startup call and the old App-PIN vault setup path no longer exist in `src`, and neither does the `either` Open Check (an Open Check is `pin`, `passkey` or `none`); startup runs no migration; a test fails if any returns.

- **CAP-3**
  - **intent:** A stored or persisted Wallet record that lacks a lock id, Seed id, key address, Network, algorithm, Open Check, Signing Check or Seed method is invalid and is not shown.
  - **success:** Given such a record, the chooser lists no card for it, nothing throws, and no field is filled in with a default.

- **CAP-4**
  - **intent:** Nothing the user reads mentions an older build or a shared legacy lock, and no test exists only for the legacy path.
  - **success:** The "older build cannot open" warning, the legacy branch of the Seed-reveal copy, the shared-lock note in the Wallet tab and the "they share one lock" chooser line are gone (the controlled-Wallet case keeps its own wording); the chooser header "Each one has its own lock" is true for every Wallet; legacy-only tests are deleted.

- **CAP-5**
  - **intent:** Unlock and signing for a current Wallet behave exactly as before the removal.
  - **success:** The existing unlock, Open Check, Signing Check, Edit checks, Reveal Seed, Remove and controlled-Wallet tests pass unchanged except for fixtures; `bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast` are green after every story.

## Constraints

- Order is forced. First-run Import leaves the legacy lock before the legacy lock is deleted; otherwise a clean install cannot import.
- Deleting the legacy unlock path must not weaken the proof: an unlock is still shown by decrypting known ciphertext, and a Passkey-Derived Seed by address match. No secret enters state, a store, the URL or storage.
- The controlled-Wallet shared lock (FR-93, FR-75) stays. It is shared by design.
- Only tests that exist solely for the legacy path are deleted. A test of current behaviour that used a legacy fixture is rewritten onto a current fixture, never dropped.
- No data is migrated or rescued: the owner clears their own wallets before running this build (FR-93, FR-95).
- Each story is verified by its own tests and a real-browser pass of the screen it touches; a diff that only passes the four gates is not done for a story that changes unlock.

## Non-goals

- No change to what the Open Check or Signing Check ask for.
- The controlled-Wallet lock sharing is not removed.
- No "reset" or "your wallets are from an older build" screen to replace migration.
- The Address Book, the quiz and the chooser layout are not touched beyond the copy in CAP-4.

## Success signal

A clean install imports its first Wallet through the same flow as Add wallet, every Wallet it ever holds has its own lock, and a search of `src` for `legacy` lock code, a migration or older-build copy finds nothing outside the controlled-Wallet case.

## Assumptions

- Invalid records are filtered when read, not deleted from the vault; "Remove all wallets" still clears the device.
- First-run Import reuses `CreateWalletFlow` with an Import source, as `AddWalletScreen` does. The App PIN is then created on demand (FR-68), so Onboarding's separate vault-setup step has no job left.
