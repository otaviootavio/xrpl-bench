---
title: 'Retire Operating another account and Two-device signing'
type: 'refactor'
created: '2026-11-15'
status: 'in-progress'
baseline_commit: 'c70e07f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/product-prd-changes.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-offline-signing-2026-11-07/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Local settings still carries the FR-75 "Operating another account" plate (with "Let another wallet sign" and its screen) and the FR-78 "Two-device signing" plate (with its screen), which the Wallet kinds, the two routes, Signs for and the key plate replace; the keystore still resolves today's controlled views (`accountAddress`), and the product PRD still says "Planned change" where the feature has shipped (CAP-12, OS-FR-19).

**Approach:** Delete both plates, both task screens and their routes, the libraries only they use (`control.ts`, `master-key.ts`, `two-device.ts`, the two-device write helpers and the legacy QR forms), and the controlled-view machinery (`addControlledView`, the resolver's `accountAddress` fallback, the shared-record refusals). A stored controlled view is dropped, not converted (FR-95, OS-FR-19 "dropped, not migrated"). Old route segments land on the wallet shell. The product PRD's pointers read "Replaced by".

## Boundaries & Constraints

**Always:** No new user-visible words (removal only). Signs for (`WalletView.signsFor`, story 10) stays and is the one way a key signs for another Account. A record that holds a controlled view keeps its own Wallet working, listed and openable. Words still used by live screens stay pinned, as literals when their only source file is deleted. Every rule outside the removal (money, failed reads, fee cap, never-resubmit, the Transmit step) is unchanged.

**Never:** No migration or conversion of a controlled view into a Signs-for Wallet (it would sign for another Account without the user asking). No read-only listing of a controlled view (it needs words nobody approved). No dead screen at an old path. No change to the offline routes' payloads (`u`, `s`, `r`, `d` UR kinds).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Local settings, Online | any Online Wallet | no "Operating another account", no "Two-device signing" plate; Key state plate stays | — |
| Local settings, Offline / Transmitter | any | neither plate (as before) | — |
| Old segment `two-device` / `control` | `/wallets/:id/two-device` or `/control`, lock open, any kind | location replaced by `/wallets/:id`; the shell renders, nothing of the old screen | no such Wallet or lock closed: chooser (`/`) |
| Record with a controlled view (forced) | Seed record K: own view + `{accountAddress: X}` view | only K's own Wallet listed; the controlled view is not listed, not openable, signs nothing | — |
| FR-93 after the drop | import K with Signs for X on the same Network, or set K's Signs for to X | allowed (the dropped view is not counted) | other duplicates: today's refusals |
| Kind change / Signs for on that record | K's own Wallet | no shared-record refusal; works as for any Wallet | — |
| Remove K's own Wallet | record with a dropped view | record, lock (and App PIN when last) removed; Remove dialog says the Seed goes | — |
| A write that remaps views | Signs for, kind change, setting, ledger seen, on that record | the dropped view is not written back (gone from storage) | — |
| Older build's QR code | `xrplbench:1:u:…` / `xrplbench:1:s:…` (FR-78's single-code form) | shipped "That code is from a version of XRPL Bench this one does not understand." | — |
| Unsigned code with no `ledger_index` | two-device's UR envelope | malformed, as before (story 9) | — |
| Regression | Offline-builds Payment on Testnet | validates end to end (two contexts) | — |

</frozen-after-approval>

## Code Map

- `src/pages/tabs/WalletTab.tsx` -- `ControlPlate`, Two-device plate, the shared branch of `SignsForPlate`.
- `src/pages/WalletScreens.tsx`, `src/lib/route.ts`, `src/components/AppShell.tsx` -- task screens and segments; retired segments canonicalised to the shell.
- `src/components/wallet/{TwoDeviceSign,ControlWalletScreen,ControlledNote}.tsx`, `src/lib/{two-device,control,master-key}.ts` -- deleted; `BalancesTab.tsx` drops `ControlledNote`.
- `src/lib/crypto/keystore.ts`, `db.ts` -- `viewsOf` drops `accountAddress` views; `addControlledView` and the shared-record refusals go.
- `src/lib/xrpl/writes.ts` -- `prepareUnsigned`, `submitSignedBlob`, `TWO_DEVICE_LEDGER_WINDOW` go.
- `src/lib/qr-codec.ts` -- legacy single-code form and `decodeUnsigned` go; `encodeUnsigned` needs `ledgerIndex`.
- `src/lib/remove-copy.ts`, `kind-change-words.ts`, `ChangeKindScreens.tsx` -- sibling and shared-record words go.
- `src/lib/__tests__/offline-round-words.test.ts` -- four shipped words re-pinned as literals.
- PRD, `docs/decisions.md` §15.1–15.3, `docs/agents/keys-and-secrets.md`, `docs/glossary.md`, `PRODUCT.md`, `CLAUDE.md`, `deferred-work.md`.

## Tasks & Acceptance

**Execution:**
- [ ] screens, plates, routes, libraries removed; old segments land on the shell
- [ ] keystore drops controlled views; refusals and words that only they reached removed
- [ ] codec legacy form removed; older build's code answered as unknown version
- [ ] tests for every matrix row; removed suites deleted; words re-pinned
- [ ] PRD pointers, docs, CLAUDE.md, deferred entries
- [ ] gates; browser pass

**Acceptance Criteria:**
- Given an Online, an Offline and a Transmitter Wallet, when Local settings opens, then neither removed plate shows.
- Given a record with a controlled view, when the app lists Wallets, then only the own Wallet shows and it works as any Wallet.
- Given the gates, all four are green.

## Implementation Notes

## Design Notes

## Verification
