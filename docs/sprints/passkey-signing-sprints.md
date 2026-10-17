# Passkey-Signing Sprint Plan

**Status: planned, not built.** Sequencing for PRD §4.14 (FR-60..FR-78). The
contract is `_bmad-output/specs/spec-passkey-signing/SPEC.md` (13 capabilities)
and its `check-rules.md`; the mechanism is
`_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-passkey-signing-2026-10-10/ARCHITECTURE-SPINE.md`
(AD-18..AD-30). Stories are in the spec's `stories.yaml`. This file only orders
them — it restates no requirement.

Sprint numbers continue from Sprint 17 (`notices-sprints.md`).

## Before Sprint 18

| Item | Why |
|---|---|
| Amend the parent spine and `docs/decisions.md` §1, §2, §4 as the changes land | Each parent AD now carries a *Planned change* note; rewrite it only when its sprint ships. |
| Decide the production domain | Story 6 keeps Mainnet Passkey-Derived Seeds disabled on `*.b-cdn.net` (`docs/decisions.md` §8.11). Not a blocker for any sprint, only for enabling that one option. |
| Re-verify the built-in Nodes | Verified 2026-10-11 (`check-rules.md`); re-check the day Sprint 18 starts. |

## Sprint 18 — Foundation: locks, migration, Network and Node

Stories 1 and 2. Per-Wallet locks and the migration of existing Wallets
(CAP-10), then Network and Node per Wallet with Devnet (CAP-2).

- **Pause for review** after story 1's spec and after it is done. Nothing else
  ships unless existing Wallets carry over with the same address and no weaker
  protection (FR-74, FR-48: only on user acceptance).
- The app-wide `network` in the store becomes a Wallet field (AD-19); every
  query key keeps Wallet and Network (AD-4).

## Sprint 19 — The checks that are real

Stories 3 and 4. A structural Signing Check, the one-use Signer through
`submitAndClassify`, shared App PIN lockout (CAP-5), then per-Wallet Open Check,
auto-lock and the locked-Wallet view (CAP-4).

- **Pause for review** after story 3's spec and after it is done. It carries the
  money-moving property: with the session unlocked, no path yields the Seed
  without the check. It needs a test that fails if the property is removed.
- Hard lock must never wipe a passkey-only Wallet (AD-25).

## Sprint 20 — Creating Wallets

Stories 5, 6, 7. The creation flow and policy function (CAP-1, CAP-3), the
Passkey-Derived Seed with the passkey rule (CAP-3, CAP-7), then the written-Seed
confirmation and reveal (CAP-8, CAP-6).

- **Pause for review** after story 6's spec (rpId and recovery by ordinal).
- Passkey flows need the virtual-authenticator procedure in
  `docs/agents/verifying-your-work.md`; gates alone do not prove them.

## Sprint 21 — Editing and control

Stories 8, 9, 10. Edit checks (CAP-9), Controlling Wallet and Regular Key
(CAP-11), master key off and on (CAP-12).

- **Pause for review** after story 10's spec: it is an irreversible-class action
  and the only one that can lose funds permanently if the Regular Key is lost.
- Verify against Testnet with real transactions before marking done; the
  Regular Key and master-key state are read from the ledger only.

## Sprint 22 — Two-device signing

Story 11 (CAP-13). One QR codec, explicit `LastLedgerSequence` (about +75), the
online side verifies what returns.

## Every sprint

`bun run lint` · `bun run build` · `bun run test` · `bun run check:contrast`,
plus `docs/agents/verifying-your-work.md` for anything visual. Update
`docs/decisions.md` §15 and the parent-AD notes in the same change that ships
each piece.
