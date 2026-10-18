---
title: 'Mobile dialogs S5b: create-wallet opens with Network and Seed Method, Recommended summary, rest under Customise (CAP-6)'
type: 'feature'
created: '2026-10-17'
status: 'in-review'
baseline_revision: 'd53d6db83c8c5babff1230670098ad50e7123317'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/specs/spec-mobile-dialogs/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-mobile-dialogs/issue-map.md'
  - '{project-root}/_bmad-output/specs/spec-passkey-signing/check-rules.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-mobile-dialogs-s2-routed-screens.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Create-wallet (issue 15) shows eight questions and about 20 radios at once, with no summary of what the person is about to get.

**Approach:** The questions step opens with Network and Seed Method, then a Recommended summary of the pre-selected answers. Node, Signature type, Open Check, Auto-lock and Signing Check move under a Customise disclosure and keep their pre-selected answers. CAP-6 only; CAP-5, CAP-7 and CAP-8 are out.

## Boundaries & Constraints

**Always:** Recommended = `check-rules.md` pre-selected answers: Testnet, first built-in Node, Stored Seed, Ed25519, Open Check passkey if PRF else App PIN, 5 min auto-lock, Signing Check Standard (Testnet/Devnet) or passkey-if-PRF-else-PIN (Mainnet). Policy still comes from `describeOptions`; the screen decides nothing. Every answer stays in the same state, so collapsing Customise never resets one. A blocked combination, the App PIN fields, the PIN-read failure and the node-test result stay visible outside Customise. Onboarding and Add wallet keep identical outcomes; only layout changes.

**Never:** No change to `handleCreate`, steps after `questions`, secret handling (refs, uncontrolled PIN inputs), policy, or the `CreateWalletFlowProps` contract. No new Mainnet or floor logic. Customise is not a new step or route. No `focus:` or `outline-none`. No CAP-5/7/8 work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh open, no PRF | Defaults | Network and Seed Method radios, then Recommended: Testnet, built-in Nodes, Stored Seed, Ed25519, App PIN, 5 min, Standard; Customise collapsed | No error expected |
| Fresh open, PRF yes | Defaults | Recommended reads passkey as Open Check | No error expected |
| Mainnet, no PRF | Network = Mainnet | Summary shows Signing Check App PIN; Open Check and auto-lock floors still apply | Blocked answers keep reasons; blocked Alert shown outside Customise |
| Mainnet, PRF yes | Network = Mainnet | Summary shows Signing passkey | Same |
| Customise keeps answers | Open Customise, pick secp256k1 and 10 min, close | Summary reflects them; reopening shows them selected | No error expected |
| Network switch | Change network with Customise open | Policy defaults re-apply exactly as before | Proven Node dropped as before |
| Passkey-Derived Seed | Pick it in Seed Method | Passkey new/existing choice and domain warning visible without opening Customise | Unavailable reason stays visible as text |
| PIN needed | Open/Signing check uses PIN | PIN fields show outside Customise | PIN-read failure Alert and Retry visible |
| Both callers | Onboarding and `/wallets/new` | Create then backup then commit as before; exits unchanged | Unchanged |

</intent-contract>

## Code Map

- `src/components/wallet/CreateWalletFlow.tsx` -- `CreateWalletForm` questions render (from ~L494): Label, `NetworkChoice`, then `Axis`/`Choice` groups Node, Seed Method (+ Passkey), Signature type, Open Check, Auto-lock, Signing Check, PIN block, blocked Alert, `createButton`. Local helpers `Axis`, `Choice`; `defaultSigning` (L84); state L108-130; `options = describeOptions(...)` L192 and `verdict` L495.
- `src/components/wallet/NetworkChoice.tsx` -- shared Network radios; keep as is.
- `src/pages/Onboarding.tsx`, `src/components/wallet/AddWalletScreen.tsx` -- the two callers (`stickyAction` on Add wallet); read-only.
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx` -- asserts the FR-60 order (L104), defaults (L117-150), unavailable reasons (L153-241), PIN, Node and Passkey-Derived tests; most hit radios now under Customise.
- `src/pages/__tests__/create-entry-points.test.tsx`, `src/pages/tabs/__tests__/pin-dialog.test.tsx` -- other CreateWalletFlow consumers.
- `src/components/ui/` -- no disclosure primitive today; use a native `details`-style or a Button with `aria-expanded` and the panel vocabulary from DESIGN.md (`font-legend` uppercase legends).
- `_bmad-output/specs/spec-passkey-signing/check-rules.md` -- policy tables; read-only.

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/CreateWalletFlow.tsx` -- restructure the questions step: Label, Network, Seed Method (with its Passkey sub-choice), a Recommended summary built from current state/`options`, then a Customise disclosure (closed by default, `aria-expanded`, wired to its panel) holding Node, Signature type, Open Check, Auto-lock, Signing Check; PIN block, blocked Alert, error and Create stay outside -- one question set, no state moved or reset.
- `src/components/wallet/__tests__/create-wallet-flow.test.tsx` -- update order, default and policy tests to open Customise where needed; add cases for the matrix rows (PRF vs PIN summary, Mainnet summary, Customise keeps answers, Passkey-Derived and PIN visible while collapsed).
- `src/pages/__tests__/create-entry-points.test.tsx` -- adjust only if it queries a now-collapsed radio; assert onboarding and Add wallet outcomes unchanged.

**Acceptance Criteria:**
- Given the flow opens, when the questions step renders, then only Network and Seed Method radios are visible above the Recommended summary and Customise is collapsed, so no more than a handful of radios are shown.
- Given Customise is opened, when Node, Signature type, Open Check, Auto-lock or Signing Check is changed and Customise is closed, then the summary shows the change and Create wallet sends it.
- Given Mainnet, when the answers violate a floor, then the blocked Alert is visible with Customise closed and creation is refused as before.
- Given either caller, when a wallet is created, then the result, backup step and exit path match the pre-change behaviour.

## Verification

**Commands:**
- `bun run lint` -- expected: clean
- `bun run build` -- expected: `tsc -b` and build succeed
- `bun run test` -- expected: all pass, including updated create-wallet-flow tests
- `bun run check:contrast` -- expected: pass

**Manual checks:**
- A real-browser pass is required (see `docs/agents/verifying-your-work.md`): onboarding and `/wallets/new` at 320px and desktop, light and dark, keyboard-only through Customise, Mainnet floors, passkey-capable and PIN-fallback cases. Gates alone do not prove the layout.

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 34 findings over 4 layers, merged to 14 rows — high 0, medium 3, low 8, false 2, maybe-false 1
- findings:
  - `[medium]` `[patch]` Summary headed "Recommended" prints live state (blind, edge, gap, intent) — heading is "Recommended" only while every answer equals the policy default, else "Your choices".
  - `[medium]` `[patch]` Blocked Alert or failed Node test while the fixing control is hidden in collapsed Customise (blind, edge) — panel renders open while blocked or a Node failure shows.
  - `[low]` `[patch]` Node summary URL can overflow at 320px (blind) — `min-w-0 break-all`.
  - `[medium]` `[patch]` Custom-Node summary rows and Open Check "none" / Signing Check changes unasserted (gap) — tests added, plus a blocked-opens-Customise test.
  - `[maybe-false]` `[reject]` `hidden` plus `flex` utility might leave the panel visible (edge, gap) — Tailwind v4 preflight sets `[hidden]` with `!important`; unverified in jsdom, checked in the browser pass.
  - `[low]` `[reject]` Open Check and Signing Check also sit under Customise, beyond the SPEC's named three (intent) — SPEC says "the rest on request"; Reading A of the intent, recorded as a judgement.
  - `[low]` `[reject]` One screen, not separate steps (intent) — SPEC says "sit under Customise"; a disclosure, not a new step or route.
  - `[low]` `[reject]` Summary mirrors state, not a fixed Recommended set (intent) — handled by the heading patch.
  - `[low]` `[reject]` h2 heading level, region landmark noise, duplicated label strings, success text hidden while collapsed, blocked values unmarked in the summary, stale line numbers in the spec, FR-60 comment (blind, edge) — no named user harm; fixes add complexity or edit this spec.
  - `[false]` `[reject]` Collapsed radios break `create-entry-points` and `pin-dialog` tests (edge) — both pass unchanged in the full run.
  - `[low]` `[reject]` Network switch with Customise open untested (edge, gap) — `changeNetwork` untouched; coverage note only.

## Auto Run Result

Status: in-review (done pending the browser pass)

Summary: create-wallet opens with Label, Network and Seed Method, then a summary (headed "Recommended" while every answer is the policy default, "Your choices" otherwise), then a Customise button. Node, Signature type, Open Check, Auto-lock and Signing Check sit in the panel, which opens itself when the combination is blocked or a Node test fails. PIN fields, blocked Alert, errors and Create stay visible.

Files: `src/components/wallet/CreateWalletFlow.tsx` (questions step only), `src/components/wallet/__tests__/create-wallet-flow.test.tsx`.

Review: 4 patches applied, 0 deferred, 10 rejected with reasons above.

Verification: lint, build, test (1373 passed), check:contrast all pass. Real-browser pass not run; batched after S5c.

Residual risks: layout of the summary grid and the `hidden` panel at 320px unseen; keyboard-only pass through Customise unrun.
