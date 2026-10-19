---
title: 'Signing Check and Open Check copy'
type: 'chore'
created: '2026-10-19'
status: 'in-review'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: 'cd7d455b6681ff37424872247ca1cbf9ce8c7842'
context:
  - '{project-root}/_bmad-output/specs/spec-signing-check-copy/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-signing-check-copy/copy-decisions.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Signing Check options describe an absence ("no further check") and are not worded in parallel, so Standard reads as though nothing is checked; Open Check passkey wording and "No Open Check" are inconsistent with them (issues 8a-8i).

**Approach:** Replace the seven wordings in `copy-decisions.md` (SPEC CAP-1 to CAP-4) and update only the tests that name the old text. The No Open Check detail is passed only when `state.available`. No logic, layout or token change.

</frozen-after-approval>

## Implementation Notes

Files changed: `CreateWalletFlow.tsx` (8a, 8b, 8c, 8g, 8h), `EditChecksDialog.tsx` (8a, 8c, 8d, 8f, 8g, 8h, 8i), `SettingsTab.tsx` (8e). The No Open Check detail is passed as `options.openCheck.none.available ? '…' : undefined`, so the unavailable (Mainnet) state shows only its policy reason. Tests: `settings-reveal.test.tsx` (the `/no further check/` regex), `edit-checks-dialog.test.tsx` (the `/A new passkey/` lookup, now `/^Passkey only: a new passkey/`; one new test for the Edit checks wording and the Mainnet absence of the 8g detail), `create-wallet-flow.test.tsx` (one new test, same two assertions for the create flow). No logic, layout or token change. `Choice` puts `detail` in `aria-describedby`, so the `No Open Check` radio lookups pass unchanged, as the spec expected.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route / evidence |
|---|---|---|
| Create flow has no test of the new wording (blind) | medium | patch: new test in `create-wallet-flow.test.tsx` |
| Passkey-Derived test lookup went case-loose (`/a new passkey/`) and does not pin the new label (blind) | low | patch: lookup is now `/^Passkey only: a new passkey/` |
| "Testnet and Devnet only" and the repeated sentences are hard-coded in two files (blind) | low | rejected: every option string in these two files is already duplicated, a shared constant adds an export for a rule that changes rarely |
| No Open Check copy omits who gains access; "without asking" / "no further prompt" vary (blind) | maybe-false | defer: the wording is the owner-approved verdict (8g, 8e); changing it is a spec change. Entry in `deferred-work.md` |
| "Passkey: a new passkey" reads awkwardly; suggests "Replace with a new passkey" (blind) | false | the label is the decided verdict of 8i, matching 8f; the replace meaning is a separate wording decision |
| Edit-dialog test gaps: Open Check label unasserted, no case with no Open Check, unchanged non-passkey label unasserted (blind) | low | rejected: the labels sit behind the same `label` expressions covered by the Passkey-Derived test; adding cases tests React conditionals, not copy |
| "Seed" capitalised against neighbouring sentences; no docs trail (blind) | false | glossary (PRD §3) capitalises Seed; the trail is this spec and `copy-decisions.md` |

## Verification

**Commands** (tree: HEAD cd7d455 plus this change, 2026-10-19): `bun run lint`, `bun run build`, `bun run test` (94 files, 1331 tests before the create-flow test, all passing after), `bun run check:contrast` all passed.

**Browser pass** (Playwright Chromium by a delegated verifier, isolated context, CDP virtual authenticator, dev server on port 5173, Testnet only, `emulate_media` light and dark; wallets: A App PIN / App PIN only, B No Open Check / Standard, C Passkey / Passkey only). Widths 320×568, 375×667, 1280×800. Screenshots opened by the main session: create flow Open Check 320 light, create flow Signing Check 320 dark, Edit checks (wallet C) Signing Check 320 dark, seed-reveal confirm 320 light.

| Criterion | Result |
|---|---|
| CAP-1: Standard, App PIN only and passkey details read as specified, in create-wallet and Edit checks | Met: exact text rendered; "Passkey only: a new passkey" shown for a passkey wallet (C) |
| CAP-2: seed-reveal sentence for a no-Open-Check wallet | Met: "After you confirm, the Seed is shown with no further prompt." |
| CAP-3: No Open Check detail only where available | Met: shown on Testnet in both surfaces; on Mainnet (create flow) only the policy reason; absent as a detail on the kept row of wallet B |
| CAP-4: Open Check passkey wording | Met: "The passkey is named after this wallet."; "Passkey: a new passkey" shown for wallet C |
| No clipping, no horizontal overflow of the dialog or its body | Met: element scrollWidth equals clientWidth at all widths (document too); details wrap to two lines at 320 |

**Not run:** a real Mainnet wallet (no Mainnet action taken); the Mainnet Edit checks view (only the create flow was checked on Mainnet); 390px.

**Open on a touched surface:** ledger issue 5 (P1): the radio `Choice` label in `check-controls.tsx` has no 44px touch row. It predates this change and is not part of it, but the build workflow does not call a UI story done while a P1 on a touched surface is open, and the Impeccable re-audit was not run. Status therefore stays `in-review`.

