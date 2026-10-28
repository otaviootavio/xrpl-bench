---
title: 'Rename'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '20edfd4ecab309f95dd20262a0b4b72ffcac3af5'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-18-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/DESIGN.md'
warnings: []
deferred:
  - summary: >-
      The interleaving test runs the rename and `commitWalletEdit` back to back, not truly concurrently; the repo has no fake-indexeddb and the hand-rolled `idb` mock replaces the whole store on commit, so a simultaneous run reports a lost update the real database would not.
    evidence: |-
      Real IndexedDB serialises readwrite transactions on one store, and `seedStamp` excludes `label`, so a rename neither aborts nor is lost. A test against a real transaction layer (add fake-indexeddb) would pin it.
    location: >-
      src/lib/crypto/__tests__/rename-wallet.test.ts
    severity: medium (unverified)
  - summary: >-
      The duplicate check in `renameWallet` is a separate read before the write transaction, so two tabs renaming different Seeds to the same new name can both succeed.
    evidence: |-
      AD-42 calls the re-check a best-effort guard across tabs, not a security boundary; moving it inside `mutateStoredWallet` needs a multi-record transaction.
    location: >-
      src/lib/crypto/keystore.ts
    severity: low
  - summary: >-
      Rename keys on two Seeds with the same grandfathered name share one accessible name; `uniqueDefaultName` is unguarded at 40 code points and not yet wired into creation; the shared-rule guard is a source-text test.
    evidence: |-
      Duplicates are grandfathered by AD-42 and a locked card has only its name (AD-26); Stories 11 and 13 wire `uniqueDefaultName` and can cap it. A spy on `validateWalletName` through a module mock would replace the text check.
    location: >-
      src/components/wallet/WalletCard.tsx, src/lib/wallet-name.ts
    severity: low
  - summary: >-
      The Rename dialog and the card keys are unverified at 320, 390 and desktop in both themes, and Esc or Back closing the dialog has no test.
    evidence: |-
      jsdom cannot observe layout; the dialog primitive owns Esc and Back.
    location: >-
      src/components/wallet/RenameDialog.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** A wallet's name is fixed at creation. A locked card shows only its name (AD-26), so two Seeds with the same or confusable names cannot be told apart, and the user cannot name a wallet something they recognise.

**Approach:** One pure name rule (`lib/wallet-name.ts`, AD-42); one keystore write, `renameWallet`, that changes only the Seed record's `label` without bumping `rev`, asking a lock or touching the ledger (AD-41); a Rename key and a single-field dialog on every card, locked or open.

## Boundaries & Constraints

**Always:** `src/lib/wallet-name.ts` is the only place the rule lives and is pure: `validateWalletName(raw, others)` normalises (NFC, trim, collapse inner whitespace runs to one space) and returns `{ ok: true, name }` or `{ ok: false, reason: 'empty' | 'too-long' | 'duplicate' }`. Valid: 1 to 40 code points (count with `Array.from`); not equal, compared case-insensitively on the normalised form, to the name of any **other Seed** (`others` is the list of other Seeds' names; sibling views of one Seed share a name and never collide). Existing duplicates are grandfathered: the rule is checked only when a name is changed. It also exports `uniqueDefaultName(base, others)` (returns `base`, else `base 2`, `base 3`, ... the first free) with tests; it is wired into creation by Stories 11 and 13, not here. `keystore.renameWallet(seedId, rawName)` re-runs the rule against the stored records, writes `{ ...current, label }` through `mutateStoredWallet` in one transaction, does NOT bump `rev`, asks for no lock, makes no ledger call, and returns `{ ok: true, metas }` (the `toMetas` projection of that one Seed built from the row it wrote) or `{ ok: false, reason }` with reasons `empty`, `too-long`, `duplicate` or `write-failed`; a failed write changes nothing. A concurrent `commitWalletEdit` keeps the new name (it rebuilds from the in-transaction row) and a rename does not make an in-flight edit abort. The caller replaces that Seed's entries in the store from `metas`; the UI never constructs or edits a `label`. Every card (locked and open) shows a **Rename** key, `Button variant="outline" size="sm"` with the shared card key style, visible legend `Rename`, accessible name `Rename {name}`; focus order on a locked card is Open then Rename; on an open card, after the network rows, Rename then Lock. The key opens a single-field `Dialog` (the shipped primitive; Back/Esc close it): title `Rename wallet`, label `Name`, always-visible help `Only on this device. Never sent to the ledger.`, keys `Cancel` and `Save name`, Enter submits, the field holds a name (never a secret). Errors are visible text tied to the field (`aria-invalid`, `aria-describedby`), shown on submit and on blur, never auto-dismissed: empty `Give this wallet a name.`, duplicate `Another wallet on this device already has that name.`, too long `Use 40 characters or fewer.`. Save is enabled only for a valid, changed name; an unchanged name closes the dialog silently with no write. On success: `Wallet renamed.` as a notice, the dialog closes, every network row under the card shows the new name, and focus returns to that card's Rename key. On `write-failed`: `Could not rename the wallet. Nothing was changed.` shows inside the dialog, which stays open with the typed name. No copy may say a passkey's authenticator name changes (a passkey registered before a rename keeps its old name). The card order does not change (it follows Seed `createdAt`). No `:focus` styling, no `outline-none`, no new colour token; the name is never in a URL.

**Never:** No lock proof for Rename. No `rev` bump. No direct store write of `label` outside the `metas` replacement. No Remove, Configure or Add keys here (Stories 10, 14, 11). Do not wire `uniqueDefaultName` into creation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid | `  Savings   account ` | stored as `Savings account`; all rows under the card show it; `Wallet renamed.` | n/a |
| Empty | `   ` | `Give this wallet a name.`; Save disabled | no write |
| Too long | 41 code points | `Use 40 characters or fewer.` | no write |
| Duplicate | another Seed named `savings` | `Another wallet on this device already has that name.` (case-insensitive) | no write |
| Sibling views | views of the same Seed | share the name, never collide | n/a |
| Unchanged | same normalised name | dialog closes, no write | n/a |
| Locked card | closed lock | Rename works with no lock | n/a |
| Concurrent edit | `commitWalletEdit` and rename interleaved | the new name survives; neither aborts | n/a |
| Write fails | `mutateStoredWallet` rejects | `Could not rename the wallet. Nothing was changed.`; dialog open, typed name kept; store unchanged | `{ ok: false, reason: 'write-failed' }` |
| Cross-tab duplicate | a duplicate appears in storage after the dialog validated | `renameWallet` refuses with `duplicate` | shown as the duplicate error |

## Code Map

- `src/lib/wallet-name.ts` -- new, pure.
- `src/lib/crypto/keystore.ts` -- `toMetas` (line ~79), `findSeedRecord`, `mutateStoredWallet` use sites (e.g. ~415, ~684), `removeWallet` (~708); add `renameWallet`. `src/lib/crypto/db.ts:261` -- `mutateStoredWallet` (one transaction; the record `id` is the `seedId`), `listStoredWallets`.
- `src/components/wallet/WalletCard.tsx` -- locked and open card action rows; add the Rename key. `src/pages/Chooser.tsx` -- owns the dialog state, focus return and the store replacement via `useAppStore` `setWallets`.
- `src/components/ui/dialog.tsx` -- the dialog primitive (routed Back closes it via `pushOverlay`); a confirm-sized dialog is used elsewhere (Settings reset). `src/lib/notify.tsx` -- `notify.success`/`toast`.
- Existing fake-indexeddb keystore tests (grep `fake-indexeddb` under `src/lib/crypto/__tests__`) for the interleaving test with `commitWalletEdit`.
- chooser `EXPERIENCE.md` (Exact strings: Rename dialog; State Patterns: Rename validation, Rename write fails) and `DESIGN.md`.

## Tasks & Acceptance

**Execution:**
- `src/lib/wallet-name.ts` -- `validateWalletName`, `uniqueDefaultName` -- AD-42
- `src/lib/crypto/keystore.ts` -- `renameWallet` -- AD-41
- `src/components/wallet/WalletCard.tsx`, `src/pages/Chooser.tsx` (and a `RenameDialog` component) -- key, dialog, validation, success and failure, focus -- FR-85, UX-DR7, UX-DR10
- Tests: `validateWalletName` table (normalisation, 1/40/41 code points incl. astral characters, case-insensitive duplicate, sibling names, empty); `uniqueDefaultName`; `renameWallet` on a fake IndexedDB (writes label only, `rev` unchanged, no lock call, returns projection, duplicate and write-failed results, no ledger call); an interleaved `commitWalletEdit` + rename test where the new name survives; dialog tests for each error string, `aria-invalid`/`aria-describedby`, Save enablement, unchanged closes silently, success updates every row and returns focus to Rename, failure keeps the dialog and the typed name; Rename on a locked card. A test fails if the dialog and `renameWallet` stop sharing the rule.

**Acceptance Criteria:**
- Given any card, then it has a Rename key; focus order is Open, Rename on a locked card.
- Given the dialog, when the user types, then the name is trimmed and collapsed, accepted at 1 to 40 characters and unique case-insensitively among other Seeds, with the exact error strings tied to the field, and Save is enabled only for a valid, changed name.
- Given a valid name and Save, then `renameWallet` writes the Seed record without bumping `rev`, asking a lock or calling the ledger; every network row shows the new name and focus returns to the card's Rename key.
- Given `commitWalletEdit` runs concurrently, then the new name survives.
- Given the write fails, then `Could not rename the wallet. Nothing was changed.` shows, the dialog stays open and the typed name is kept.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 11, edge-case hunter 18, verification gap 3 plus 3 notes, intent alignment descriptive; grouped by root cause into the rows below — medium 3 and low 5 (patched), medium 2 and low 2 deferred, rest false or rejected as low
- findings:
  - `[medium]` `patch` An unchanged grandfathered duplicate showed the duplicate error and could not close silently, contradicting AD-42 — an unchanged name is now never an error and closes with no write; test added.
  - `[medium]` `patch` Enter that confirmed an IME composition submitted a half-typed name — Enter is ignored while composing; test added.
  - `[medium]` `patch` A slow first save could close a second dialog the user opened on another card — only the dialog for that Seed closes.
  - `[low]` `patch` A rename could resurrect a Seed removed in another tab in the store — the store is replaced only while the Seed still exists.
  - `[low]` `patch` The "Could not rename" alert stayed beside an edited name — cleared on edit.
  - `[medium]` `patch` Zero-width, bidi and control characters let two names look identical on a locked card — they are removed in normalisation (a small addition to AD-42's NFC, trim, collapse); tests added.
  - `[low]` `patch` The open card with no Open Check had no test that it keeps its Rename key — assertion added.
  - `[medium]` `defer` Real interleaving test; cross-tab duplicate inside the transaction; shared accessible names, `uniqueDefaultName` cap, source-text guard; browser pass and Esc/Back — see deferred.
  - `[false]` `reject` Moving the unchanged check before validity is a spec change — AD-42 says an unchanged name closes the dialog with no write and existing duplicates are grandfathered, so the patch is the rule.
  - `[low]` `reject` NFKC and locale case-folding, label-less stored records, grapheme clusters counted as code points, layout shift on blur, Cancel while busy, an unknown seed reported as write-failed — beyond what AD-42 asks or intentional (the keystore test pins the unknown seed), and no demonstrated wrong outcome.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Browser pass of the Rename dialog and the card keys at 320, 390 and desktop in both themes, deferred to the final pass.

## Auto Run Result

Status: done

- Summary: A pure name rule (`lib/wallet-name.ts`), `keystore.renameWallet` (label only, no `rev` bump, no lock, no ledger call, returns the Seed's projection) and a Rename key and single-field dialog on every card. Valid names are 1 to 40 code points, unique case-insensitively among other Seeds; unchanged names close silently; a failed write keeps the dialog and the typed name.
- Files: `src/lib/wallet-name.ts`, `src/lib/crypto/keystore.ts`, `src/components/wallet/RenameDialog.tsx`, `src/components/wallet/rename-copy.ts`, `src/components/wallet/WalletCard.tsx`, `src/pages/Chooser.tsx`, and tests (`wallet-name`, `rename-wallet`, `chooser`).
- Review: 7 patches applied (3 medium, 4 low), 4 deferred, the rest rejected with reasons above.
- Follow-up review recommended: true. Three medium findings were patched in the dialog, the name rule and the Chooser save path; the keystore write itself is covered only by a mock transaction layer.
- Verification: `bun run lint`, `bun run build`, `bun run test` (1538 tests plus the new dialog cases), `bun run check:contrast` pass after patches.
- Residual risk: no real-browser pass; no true concurrent-transaction test.
