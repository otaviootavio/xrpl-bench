---
title: 'Mobile dialogs S5 (CAP-5): master-key-off reads and behaves as the destructive act it is'
type: 'feature'
created: '2026-10-17'
status: 'in-review'
baseline_revision: 'f3fcc2edc4ce3924bb6d905f02b005a83ce9fca7'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/specs/spec-mobile-dialogs/SPEC.md'
  - '{project-root}/DESIGN.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The master-key-off sheet opens from an outline button, its confirm key uses the `danger` (plate) style, the Regular Key address is buried in prose, and Mainnet needs no more than one click to commit (issue 14, P1).

**Approach:** In `MasterKeyControl`, the opener uses `danger`, the confirm key uses `destructive` (the fill belongs to the confirm key), an `Alert` plate shows the Regular Key address, and on Mainnet the confirm stays aria-disabled until a typed phrase matches.

## Boundaries & Constraints

**Always:** only the turn-off direction changes; the typed phrase is not a secret and stays out of storage, URL and history; aria-disabled (not `disabled`) for the held confirm; the phrase resets whenever the sheet opens; Testnet/Devnet commit with no typing.

**Never:** CAP-6, CAP-7 or CAP-8 work (no status-legend rewrite, no Settings row regrouping, no `focus:` changes); change `lib/master-key.ts`, signing or key logic; style `:focus`; use `outline-none`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mainnet, nothing typed | turning off, mainnet | confirm key aria-disabled; click signs nothing | field hint names the phrase |
| Mainnet, phrase typed | "turn off" (case/space-insensitive) | confirm enabled, commits with `confirmed: true` | none |
| Mainnet, wrong text | "turn" | confirm stays held | none |
| Testnet | turning off | confirm enabled at once, no field | none |
| Reopen | typed then Cancel, reopen | field empty, confirm held again | none |
| Turning on | any network | unchanged: default style, no plate, no phrase | none |

</intent-contract>

## Code Map

- `src/components/wallet/MasterKeyControl.tsx` -- opener `Button` (line ~134, `outline`), confirm sheet, `confirm()`; `regularKey` already read from account state
- `src/components/ui/alert.tsx` -- `Alert variant="destructive"` + `AlertTitle` (lit legend) + `AlertDescription`; reuse for the plate
- `src/components/ui/button.tsx` -- `destructive` (fill, confirm only) vs `danger` (opener); DESIGN.md Reservation Rule
- `src/components/ui/input.tsx`, `label.tsx` -- primitives for the phrase field
- `src/components/wallet/__tests__/master-key-control.test.tsx` -- existing tests click the last "Turn master key off" button; Mainnet cases must type the phrase first

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/MasterKeyControl.tsx` -- opener `danger` when turning off; confirm `destructive`; destructive `Alert` (title "Master key off", Regular Key address in mono, break-all) replacing the inline address; Mainnet phrase `Input` with `Label`, `autoComplete="off"`, reset on open; confirm guarded in `confirm()` and aria-disabled -- CAP-5
- `src/components/wallet/__tests__/master-key-control.test.tsx` -- Mainnet held/enabled/wrong text/reset; Testnet unchanged; alert plate shows the address; turn-on unchanged
- `DESIGN.md` or `docs/decisions.md` -- only if a rule is introduced (none expected)

**Acceptance Criteria:**
- Given the master key is on and this wallet signs as the Regular Key's holder, when the sheet opens, then an alert plate shows the Regular Key address and the confirm key has the destructive style.
- Given Mainnet, when the phrase is not typed, then the confirm key is aria-disabled and clicking it does not call `setMasterKey`.
- Given Mainnet and the phrase typed, when confirm is clicked, then `setMasterKey` is called with `confirmed: true`.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bun run lint` · `bun run build` · `bun run test` · `bun run check:contrast` -- expected: all pass

**Manual checks (if no CLI):**
- Real-browser pass at 320x568 and 375x667, both finishes, Mainnet-labelled wallet if one can be created without funds at risk; screenshots opened, recorded under Verification.

### 2026-10-17 — Review pass
- verdicts: 14 rows after merging duplicates across layers — high 0, medium 3, low 7, false 4
- findings:
  - `[low]` `[patch]` `WORDS:Record` lost its space (blind, edge) — restored.
  - `[medium]` `[patch]` Held confirm key not tied to the phrase field for assistive tech (blind, edge) — `aria-describedby={held ? phraseId : undefined}` added.
  - `[medium]` `[patch]` Mainnet turn-on path untested (gap) — test added: no plate, no field, enabled, commits with confirmed: true.
  - `[low]` `[patch]` Phrase boundary beyond "turn" untested (edge) — "turn off now" stays held, in the Mainnet test.
  - `[low]` `[reject]` Alert `role="alert"` may double-announce inside the dialog (blind, edge) — maybe-false, unverified without a screen reader; changing the primitive adds complexity and the Alert is the spec's named plate.
  - `[medium]` `[defer]` No assertion of opener `danger` / confirm `destructive` variants (gap, intent) — visual rule, brittle as a class test; covered by the browser pass.
  - `[false]` `[reject]` `turningOff` flips live while the sheet is open (edge) — on to off on Mainnet only adds the hold; off to on drops it for a legitimate turn-on; both fail closed.
  - `[false]` `[reject]` `held` rechecked only at click (edge) — prompt runs inside `setMasterKey` after the check; nothing re-enters between them.
  - `[false]` `[reject]` Phrase not cleared on send, error or Cancel (edge) — the sheet opens only through `open()`, which clears it.
  - `[low]` `[reject]` No Enter-to-submit in the phrase field (edge) — no form, so Enter does nothing, which fails closed; adding a form is more complexity than the gain.
  - `[low]` `[reject]` Phrase field editable while busy (blind) — `held` is read only at click; no effect.
  - `[low]` `[reject]` Gate is UI-only (blind, intent) — the spec's Never list forbids changing `lib/master-key.ts`; `MasterKeyControl` is the only caller.
  - `[low]` `[reject]` Initial focus target unspecified (blind) — unchanged by this slice.
  - `[false]` `[reject]` Stale spec says blocked (blind, edge, gap) — about this artifact, and the finalize step rewrites it.

### Batched browser pass (2026-10-18)

**Tree and commit:** worktree `mobile-dialogs-s2-s5`, HEAD c5bcd54 (`bun run dev -- --port 5190 --strictPort`, fresh origin, stopped afterwards by PID).
**Driven by:** Playwright MCP Chromium with a CDP virtual authenticator (ctap2, internal, UV, PRF, presence simulation); two throwaway Testnet wallets (Alpha funded from the in-app faucet, Beta unfunded; Beta also given a Mainnet *view* only, never funded); `emulateMedia` for light/dark; coarse pointer by CDP `Emulation.setTouchEmulationEnabled` (`pointer: coarse` true) with measurements and DOM clicks only; 200% text zoom emulated as `html { font-size: 200% }` at a 320 px viewport (not browser zoom). Widths 320, 375, 1280. Screenshots in `.playwright-mcp/` (uncommitted), each opened before being cited.
**Not run for any spec:** real touch input (pointer events were DOM-dispatched), real browser zoom, a real device.

Criteria for this spec:

- Master-key-off sheet on Testnet with a real Regular Key (set from Beta via Let another wallet sign): destructive styling, Regular Key shown in an alert plate, no typed phrase on Testnet, 320 px no overflow, both buttons in view. MET.
- Typed phrase on Mainnet: NOT RUN (would need a Mainnet wallet with a Regular Key; refused to touch Mainnet).


## Auto Run Result

Status: in-review (done pending the browser pass)

Summary: master-key-off opener uses `danger`, confirm uses `destructive`, a destructive Alert shows the Regular Key address, and on Mainnet the confirm key is aria-disabled until "turn off" is typed (case and spacing ignored, cleared on each open). Turning on is unchanged.

Files: `src/components/wallet/MasterKeyControl.tsx` (the change), `src/components/wallet/__tests__/master-key-control.test.tsx` (four new tests).

Review: 4 patches applied, 1 deferred (variant assertions), 9 rejected with reasons above.

Verification: `bun run lint`, `bun run build`, `bun run test` (1365 passed), `bun run check:contrast` all pass. The real-browser pass at 320x568 and 375x667 is NOT yet run; it is batched with S5b and S5c.

Residual risks: Alert live-region announcement and initial focus unverified with a screen reader.
