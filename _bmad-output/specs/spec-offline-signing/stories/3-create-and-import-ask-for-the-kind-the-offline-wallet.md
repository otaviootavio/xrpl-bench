---
title: 'Create and import ask for the kind; the Offline Wallet'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: '420a70ae4cd970b91a76072745f16edc0c38ef4e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/consequence-texts.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1 gave every Wallet a kind, but nothing can make an Offline Wallet: the create and import quiz never asks for the kind, and import always reads the ledger (CAP-2, CAP-16, OS-FR-2, OS-FR-7, OS-FR-8, OS-FR-23).

**Approach:** Quiz step 1 (Add wallet and both Onboarding flows) asks "Online wallet or offline wallet?" right after Create or Import, with no default, and shows Text A or Text B in place; Import + Offline also shows Text E above the Seed field. Each WARNING needs its own P-6 tick before Next. An Offline walk has no Node and no Seed Method step (always a Stored Seed). The Review shows the OS-FR-23 warning for every kind that holds a Seed. The keystore writes the view with `kind: 'offline'` and no Node; an Offline import skips the master-key ledger read.

## Boundaries & Constraints

**Always:** Texts A, B, E, the OS-FR-23 warning, the question, P-6, P-7 and P-60 come from one strings module, tested character for character against `consequence-texts.md` and `EXPERIENCE.md`. The policy (`describeOptions`, `checkWalletRequest`) is the same call for both kinds, with `seedMethod: 'stored'` for Offline, so FR-63/FR-65/FR-72 apply unchanged. An Offline create or import makes no ledger connection: no `verifyNode`, no `checkBeforeImport`. The local duplicate probe (FR-93, same address on the same Network) stays for both kinds. Each acknowledgement checkbox is named by P-6 plus its warning's bold sentence and described by the warning.

**Never:** No unapproved words (no "Caution" legend, no "(always, for an offline wallet)" note, no reason text for "no kind chosen"). No Passkey-Derived Seed for an Offline Wallet, at any layer. No Node stored on an Offline view. No change to the Online walk's questions. No Transmitter creation (story 4), no Signs-for step (story 10), no change of kind (story 5), no P-8 (story 4: nothing on this device can carry a Transmitter address yet).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Step 1 arrival | Add wallet or Onboarding | Kind radios, neither checked; Next `aria-disabled`, described by the question | — |
| Online chosen | kind Online | Text A in place, no tick; walk as today (Node, Seed Method, …) | — |
| Offline chosen | kind Offline | Text B lines, WARNING as caution Alert, P-6 box; Next `aria-disabled` with P-7 until ticked | — |
| Import + Offline | import, kind Offline | Text B and Text E (above the Seed field), two P-6 boxes, both needed | — |
| Kind switched after a tick | Offline ticked → Online → Offline | ticks cleared; P-60 in a status | — |
| Offline walk | create / import | Create: Signature type, Open Check, Signing Check, Review. Import: Open Check, Signing Check, Review. No Node, no Seed Method | — |
| Kind change after Online-only answers | Online + Passkey-Derived or custom Node, then Offline | Stored Seed, built-in Node; next forward move walks, never jumps to the Review | — |
| Review | any kind | kind row (question as term, kind word as value); OS-FR-23 caution Alert, every kind | — |
| Offline Mainnet | Mainnet, Offline | same refusals as Online (Open Check none, auto-lock floor), FR-72 written-Seed confirm | policy reasons as today |
| Offline write | create / import | view `{ walletId, network, kind: 'offline' }`, no `node`, record `seedMethod: 'stored'` | Offline + node → typed developer error, nothing written |
| Offline import, no ledger | import, kind Offline | duplicate probe runs; no account read, no master-key dialog | duplicate refused as today |
| Let another wallet sign | targets list | only Online Wallets offered | — |

</frozen-after-approval>

## Code Map

- New `src/lib/offline-wallet-words.ts` + `src/lib/__tests__/offline-wallet-words.test.ts` -- the question, Texts A/B/E, OS-FR-23, P-6, P-7, P-60.
- `src/components/wallet/KindChoice.tsx` (new) -- kind radios, consequence blocks, acknowledgement boxes.
- `src/components/wallet/CreateWalletFlow.tsx` -- kind state, step 1 blocking, kind-change reset, Offline create/import arguments, OS-FR-23 on the Review.
- `src/components/wallet/walk-questions.ts` -- `walkQuestions(imported, kind)`, `offlineApplies`; kind row in `answerRows`.
- `src/components/wallet/QuizShell.tsx` -- `QuizStep.blockedReasonId` for Next's `aria-describedby`.
- `src/components/wallet/useSeedImport.tsx` -- `acquire({ …, offline })` skips `checkBeforeImport`.
- `src/lib/crypto/keystore.ts` -- `kind?: 'offline'` on create/import inputs; `writeNewStoredWallet` stores it, refuses a Node with it.
- `src/lib/control.ts` -- `eligibleTargets` offers Online Wallets only.
- Tests: `create-wallet-flow.test.tsx`, `add-wallet-import.test.tsx`, `seed-import-screens.test.tsx`, `walk-questions.test.tsx`, keystore and control tests.

## Tasks & Acceptance

**Execution:**
- [x] words module + test -- approved words, one place
- [x] keystore kind on create/import -- Offline view, no Node (OS-FR-2)
- [x] walk per kind, kind row -- no Node, no Seed Method (OS-FR-2, OS-FR-8)
- [x] step 1 kind choice, texts, acknowledgements -- OS-FR-2, OS-FR-7, OS-FR-12
- [x] Review OS-FR-23 warning -- CAP-16
- [x] Offline import skips the ledger read -- no ledger read
- [x] `eligibleTargets` kind filter -- deferred entry
- [x] test helpers pick Online; new tests for every matrix row

**Acceptance Criteria:**
- Given an Offline create or import on any Network, when it completes, then the page made no ledger connection and the chooser shows an `[Offline]` card.
- Given Online chosen, when the walk runs, then its steps and writes are today's.

## Implementation Notes

- The kind question sits in `CreateWalletFlow` step 1, so Add wallet and both Onboarding flows (create, import) ask it. A fresh offline phone has no wallets, so Onboarding is Flow 1's real entry. Step 1 order: Create or import, the kind radios with Text A or B, Text E (import + Offline), the Seed field, Label, Network, then P-7 when a box is unticked. The Seed field stays above Label as before. Text E is directly above it either way.
- Radio labels are the kind words `Online` / `Offline` (approved in story 1), under the approved question as a visible legend. The mock's "Online wallet" / "Offline wallet" labels are in no approved list.
- Next before a kind is chosen: no approved reason text exists. Next is `aria-disabled` and its `aria-describedby` points at the visible question. P-7 is used only for unticked warnings.
- Kind change: the ticks clear, P-60 goes in the kind block's `role="status"`, `returnToReview` clears (so a walk that gained Node and Seed Method asks them), and for Offline the Seed Method goes back to Stored (the Signing Check to its Network default if it had been forced by Passkey-Derived) and the Node to built-in. Other answers are kept, and no note shows: nothing else changed meaning. `handleCreate` checks again: no derived branch, no Node and no untested-Node refusal for Offline.
- Walk: `walkQuestions(imported, kind)` with `offlineApplies` (false on Node and Seed Method). Offline create has 5 steps (Signature type, Open Check, Signing Check, Review, after step 1), Offline import has 4. The mock's 6 includes the Signs-for step (story 10).
- Review: a kind row (term = the approved question, value = the kind word, Change goes to step 1). For an Offline create, a "Seed Method: Stored Seed" row with no Change (both existing words). OS-FR-23 is a caution Alert, the last line of the answers plate after the consequence line. Its first sentence is the lit legend and the second is the body, words unchanged. It shows for both kinds and for create and import. The App PIN plate stays the last plate above the footer.
- Each WARNING: a caution Alert (bold sentence as the lit legend, `role="none"`, so it is not re-announced on every render) and its P-6 box, labelled by P-6 plus the title, described by the body.
- Keystore: `kind?: 'offline'` on `CreateStoredWalletInput` and `ImportStoredWalletInput`. `writeNewStoredWallet` throws `OfflineWalletNodeError` (developer text, never shown) for Offline plus a Node, after the policy and before any credential, lock or write. `createDerivedWallet` takes no kind. The policy call is the same, with `seedMethod: 'stored'`, so the Mainnet refusals are identical (a test compares the two results).
- Offline import: `acquire({ …, offline: true })` skips `checkBeforeImport`, so no account read and no master-key dialog. The local duplicate probe still runs. The master-key state of an imported Offline Seed is therefore not checked here. The Transmitter shows key state in later stories.
- Deferred entries settled: "Let another wallet sign" offers Online Wallets only (`eligibleTargets` filters on kind). Mixed-kind Seeds cannot arise after story 3 (one view per new record, Online-only controlled views); a change of kind inside a record is story 5's. Recorded in `deferred-work.md`, with two new entries: P-8 for story 4, and the pre-existing Review Change-button overflow at 320px with 200% text.
- Test setup changes (no assertion relaxed): the shared mount helpers in `create-wallet-flow`, `add-wallet-import` and `seed-import-screens` now pick Online, because the question has no default. The control screen fixture gained `kind: 'online'`. Assertions changed only where the screen changed: step 1's legends and radio count, the Review rows (kind row) and the plate's last line (OS-FR-23), and a status query scoped to the Network line now that step 1 holds two status regions.
- Switching Create/Import remounts the flow (as before), which clears the kind and its ticks without P-60. No stale text is left, so this was accepted.
- Browser fix: at 320px with 200% text, the warning legends ran out of their Alert (a tracked uppercase word is wider than the plate). They now wrap inside it (`max-w-full`, `overflow-wrap: break-word`). At that size a word like "WARNING:" still breaks mid-word, but nothing overflows.

## Spec Change Log

## Review Triage Log

Pass 1 (coordinator review, 2026-11-08).

| # | Finding | Verdict | Fix |
|---|---|---|---|
| 1 | `handleCreate` guards `kind === null` but not unread warnings; the acknowledgement rests on step 1's Next only | real (defence in depth: the Review is reachable only through step 1's Next, so no UI path reaches Create unticked) | `|| warningsUnread` in the guard; the create key is `aria-disabled` for no kind or unread warnings |
| 2 | P-60 shows after switching to Online, where no box exists, and stays | real | P-60 is remembered when ticks are cleared and shown only while the kind is Offline; test |
| 3 | Import + Offline: P-60 clears after the first tick while Text E is still unticked | real | cleared only when every box the step needs is ticked; test in `add-wallet-import` |
| 4 | The create catch shows `err.message`, so `OfflineWalletNodeError`'s developer text could reach the user | real | every throw on create shows the existing "Could not create the wallet. Nothing was created.", as import already did; two throw tests now assert the generic words and not the thrown text |
| 5 | No test drives Onboarding Import + Offline; the Offline create test's `verifyNode` assertion is vacuous | real | `seed-import-screens` test: both boxes, no `checkBeforeImport` (real function, watched), no `fetchQuery`, `kind: 'offline'`; the create test asserts `getXrplClient` and `holdXrplClient` are never called |

## Design Notes

## Verification

**Commands (2026-11-08):** `bun run lint` · `bun run build` · `bun run test` (138 files, 2078 tests; baseline 2051 before the new tests) · `bun run check:contrast`. All four are green.

**Browser pass (2026-11-08).** The flow pass ran on the working tree over `420a70a`. The width/theme matrix was re-run on commit `b423b77` (the committed CSS), with the same results recorded below. Ran `bun run dev -- --port 5191 --strictPort` and drove Playwright Chromium in fresh browser contexts (`browser.newContext()`), with a CDP virtual authenticator (ctap2, internal, UV, PRF) in the flow context. All wallets were throwaway Testnet wallets and the import Seed was generated locally. Nothing was funded: no screen in this story reads the ledger. WebSockets were counted with `page.on('websocket')`. Screenshots are in the session scratchpad `s3/`.

| Criterion | Result |
|---|---|
| No default; Next blocked until a kind is chosen | Met. On arrival, neither radio is checked and Next has `aria-disabled="true"` (`onb-step1-arrival-390-light`). |
| Offline: Text B, WARNING, P-6, P-7 | Met. Six lines, then the caution Alert and the box; Next stays blocked until it is ticked; "Step 1 of 5" (`onb-step1-offline-unticked-390-light`). |
| Offline create end to end (Onboarding) | Met. Review lists the kind, Stored Seed with no Change, no Node, and the OS-FR-23 caution (`onb-review-offline-390-light`). After Create and the backup, the chooser card shows `[OFFLINE] TESTNET`. |
| Import + Offline (Add wallet): Text E above the Seed field, two boxes | Met. There are 2 boxes and the import completes. The chooser shows two `[OFFLINE]` cards (`chooser-two-offline-390-light`). Opening one shows New transaction · Sign · Receive · Signed · Local settings. |
| No ledger connection during an Offline create and import | Met. The only WebSocket in the whole flow was Vite's HMR socket (`ws://localhost:5191/?token=…`). In 8 more Mainnet Offline import rounds, 0 non-local sockets opened. |
| Mainnet safeguards on an Offline Wallet | Met. "No authentication required to open the wallet" has `aria-disabled` in every round. Review shows Real funds, the Mainnet fact and OS-FR-23 (`review-import-offline-mainnet-1280-dark`). Create was not pressed on Mainnet. |
| 320 / 390 / 1280, light and dark, step 1 and Review | Met. No page side-scroll, and no kind block, Alert, list item or legend wider than its box (measured each round; `step1-import-offline-320-dark` opened). |
| 320px with 200% text | Met after the fix. The warning legends and the OS-FR-23 legend had run out of their Alert; fixed and re-measured on `b423b77`, nothing in step 1 or the Alerts overflows (`zoom200-textB-warning-320-light`). Not met: every Review Change key runs past the answers plate, on an Online import too, including the Label row, whose row and button story 3 did not change (`ReviewStep` untouched). Very likely pre-existing, but not measured on `420a70a`. Deferred. |

Screenshots opened: `onb-step1-arrival-390-light`, `onb-step1-offline-unticked-390-light`, `import-offline-step1-390-light`, `onb-review-offline-390-light`, `chooser-two-offline-390-light`, `step1-import-offline-320-dark`, `review-import-offline-mainnet-1280-dark`, `zoom200-textB-warning-320-light` (twice: before and after the fix), `step1-import-offline-320-light-zoom200`. The dev server was stopped after the pass.

Not checked in the browser: the P-60 status after a kind switch, and the kind change after a Review Change. Both are covered by `create-wallet-flow.test.tsx`.
