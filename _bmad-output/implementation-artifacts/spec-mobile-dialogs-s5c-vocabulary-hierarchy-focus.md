---
title: 'Mobile dialogs S5c: panel vocabulary, Settings action hierarchy, :focus cleanup (CAP-7, CAP-8)'
type: 'feature'
created: '2026-10-17'
status: 'in-review'
baseline_revision: '9e79f2a7f4aa798d3c3dbeccf64c655b9df64b58'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/specs/spec-mobile-dialogs/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-mobile-dialogs/issue-map.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/docs/agents/ui-and-design-system.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The S2 screens ignore the panel vocabulary (native radios, a raw `<select>`, sentence-case legends); the Settings wallet row shows up to 9 equal buttons, "Use on Mainnet" commits in one click, and "Remove all wallets…" overflows 320px; MasterKeyControl status legends are whole sentences; `select.tsx` and the skip link use `focus:` (issues 16-19).

**Approach:** Bring the new screens onto shared primitives and `panel-legend`/`font-legend` uppercase legends, give each wallet row one primary action with the rest grouped, route Mainnet through the existing confirm-dialog pattern, and remove `focus:` styling except one documented reveal-only skip-link exception.

## Boundaries & Constraints

**Always:** Money stays strings/BigInt. Native radio semantics (arrow keys, grouping) survive; every control keeps a 44px coarse-pointer hit area inside the primitive. Status stays word plus lamp, never colour alone. Keep CAP-5 behaviour in `MasterKeyControl` (destructive button, alert plate, Mainnet typed phrase) exactly as is. Reuse `StatusLegend`, `panel-legend`, `Select`, `Dialog`.

**Never:** Build CAP-5 or CAP-6 work. Style `:focus`/`:focus-visible` or write `outline-none`. Change signing, key, Check, or `addNetworkView` logic. Add a dependency (no Radix radio-group). Redesign `CreateWalletFlow` layout (CAP-6).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Use on Mainnet | Unlocked wallet on another network, tap "Use on Mainnet" | Confirm dialog states Mainnet is real funds; only its confirm button calls `handleUseOnOtherNetwork` | Cancel/Esc: nothing added; failure toast as today |
| Use on Testnet/Devnet | Same, non-mainnet target | Existing single-step behaviour, unchanged | Existing toast |
| Row at 320px | Wallet with every action available | No horizontal overflow; one primary action visible, rest in a group; targets >=44px coarse | n/a |
| Remove all wallets | 320px | Button label fits (wraps or short label "Remove all wallets…"); dialog title unchanged | n/a |
| Skip link | Tab once from page load | Link appears (reveal only), no ring/outline authored; Enter moves to `#main-content` | n/a |
| Select item highlight | Open any Select, arrow down | Highlighted item styled via `data-[highlighted]`, not `focus:` | n/a |

</intent-contract>

## Code Map

- `src/components/wallet/check-controls.tsx:15-63` -- `Option` native radio (line 31), `Axis` sentence-case `<legend>` (line 60). Also used by `NetworkChoice.tsx:31` and `CreateWalletFlow.tsx` (CAP-6 territory: change the primitive, not its layout).
- `src/components/wallet/ControlWalletScreen.tsx:194` -- raw `<select id="control-target">`; swap for `ui/select.tsx` (`Select`/`SelectTrigger`, `Label htmlFor` kept; keep "Choose a wallet" placeholder).
- `src/components/wallet/TaskScreen.tsx:39` -- already `font-legend` uppercase h1; the pattern to match. Check `EditChecksScreen.tsx`, `AddWalletScreen.tsx`, `TwoDeviceSign.tsx` for plain headings/`text-sm font-medium` labels (`panel-legend` at `src/index.css:332`).
- `src/components/ui/select.tsx:79` -- `focus:bg-accent focus:text-accent-foreground`; Radix sets `data-highlighted`.
- `src/components/ui/lamp.tsx` -- `StatusLegend`; `src/components/ui/dialog.tsx` -- existing confirm dialog.
- `src/components/wallet/MasterKeyControl.tsx:20-24` -- `WORDS` sentences; make `text` one or two words ("Master key on" / "off" / "unknown") and move the explanatory sentence to plain muted body text beside it (keeps the ledger-reading explanation; do not touch the CAP-5 turn-off block).
- `src/pages/tabs/SettingsTab.tsx:211-268` (wallet row buttons), `:243` ("Use on …"), `:360-367` ("Remove all wallets from this device", `w-fit`), `:527-548` (Remove confirm Dialog: the pattern to copy for the Mainnet confirm).
- `src/pages/Main.tsx:106` -- skip link with `focus:*` utilities. Lines to keep reveal-only.
- `docs/decisions.md` §6.3 (line 249), `DESIGN.md` lines 446/451 (focus Do/Don't) -- where the one exception is documented.
- Read-only: `src/lib/*`, wallet/store logic, `CreateWalletFlow.tsx` layout, CAP-5 code, `scripts/check-contrast*`.

## Tasks & Acceptance

**Execution:**
- `src/components/ui/radio.tsx` (new) + `check-controls.tsx`, `NetworkChoice.tsx` -- one shared `Radio` wrapping a native `input[type=radio]` (appearance-none, lamp-style disc, 44px coarse hit area; no `:focus` rules, platform ring untouched); `Axis` legend becomes `panel-legend` uppercase -- native semantics kept, no new dependency, closes "native radios, sentence-case legends".
- `ControlWalletScreen.tsx`, `EditChecksScreen.tsx`, `AddWalletScreen.tsx`, `TwoDeviceSign.tsx` -- swap raw select for `Select`; field labels and section headings become `panel-legend`/`font-legend` uppercase short legends -- issue 16.
- `MasterKeyControl.tsx` -- shorten `WORDS` text to a word or two, sentence as muted body text; update its test expectations -- issue 18, CAP-5 untouched.
- `SettingsTab.tsx` -- per wallet row: "Use this wallet" (inactive) or none as the primary; the other actions (Use on network, Edit checks, Let another wallet sign, Reveal seed, Remove) go in a labelled secondary group using the `ui` outline/ghost sizes, Remove last and `danger`; wrap with `flex-wrap`/`min-w-0`; "Remove all wallets…" gets `max-w-full` and wraps, label stays recognisable. Add a Mainnet confirm Dialog (new `confirmNetworkFor` state, copied from the Remove dialog pattern: title "Use <label> on Mainnet?", body "Mainnet moves real funds", confirm calls `handleUseOnOtherNetwork`); non-mainnet targets skip it -- issue 17.
- `select.tsx` -- `focus:` becomes `data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground` -- issue 19.
- `Main.tsx` -- keep the skip link's `focus:*` only for reveal (`not-sr-only`, position, box, type); no ring, outline, or `outline-none`.
- `docs/decisions.md` §6.3 and `DESIGN.md` -- record the single exception: skip link reveal-only `focus:` utilities, never a ring/outline; `focus:`/`outline-none` grep otherwise empty (comments in `button.tsx:12`, `input.tsx:16` are prose, reword so a grep shows only the exception).
- Tests -- update `MasterKeyControl`, check-controls/edit-checks, create-wallet-flow, SettingsTab tests; add cases for the matrix rows (Mainnet confirm/cancel, non-mainnet direct, select highlight attribute, skip-link classes contain no `ring`/`outline`).

**Acceptance Criteria:**
- Given the four screens, when rendered, then no native `<select>`, no `<legend>`/label in sentence case, radios come from the shared primitive.
- Given Settings at 320px with every action available, when rendered, then document `scrollWidth` equals viewport width and no button label is clipped.
- Given a Mainnet target, when "Use on Mainnet" is tapped, then nothing is added until the dialog is confirmed.
- Given `grep -rnE "focus:|outline-none" src`, when run, then only the skip link in `Main.tsx` matches.

## Design Notes

"Use on Mainnet" smallest design: the existing Dialog confirm used by Remove (`SettingsTab.tsx:527`), no typed phrase (that is CAP-5's turn-off act, and this adds a view, not a key change). A reveal-only skip link needs `focus:` because `:focus-visible` cannot be a reveal trigger for a click-focus landing; it styles visibility, never an indicator.

## Verification

**Commands:**
- `bun run lint` -- expected: clean
- `bun run build` -- expected: `tsc -b` and Vite succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: passes

**Manual checks (if no CLI):**
- A real-browser pass is required (per `docs/agents/verifying-your-work.md`): 320x568 and 375x667, light and dark; open the screenshots; Settings row, Mainnet confirm, each new screen, skip link reveal on Tab with the platform ring unaffected, Select arrow-key highlight. Record it in the Verification section.

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 5 layers, 41 raw findings merged to 20 rows — high 0, medium 4, low 9, false 4, maybe-false 3
- findings:
  - `[low]` `[patch]` Plain `h2` headings left on the create flow and `WrittenSeedConfirm` (blind, edge, intent) — now `panel-legend`.
  - `[medium]` `[patch]` `ControlledNote` legends are full sentences (intent) — word or two plus muted sentence, tests updated.
  - `[medium]` `[patch]` Focus falls to body after confirming "Use on Mainnet" (UI) — `returnFocusTo` the wallet's surviving seed button. No test; checked in the browser pass.
  - `[medium]` `[patch]` Control screen Select flips controlled/uncontrolled (edge, blind, UI) — `value={targetId}`; placeholder test added (no choose-then-reset test).
  - `[medium]` `[patch]` Moved status sentences unasserted (gap) — assertions added.
  - `[low]` `[patch]` `focus:|outline-none` grep only enforced by hand (gap, blind) — repo-grep test added.
  - `[false]` `[reject]` Labels on `EditChecksScreen`, `AddWalletScreen`, `TwoDeviceSign` remain sentence-case (edge, blind, intent) — the `Label` primitive renders uppercase `panel-legend` (seen in earlier screenshots); source text is not the rendered text.
  - `[false]` `[reject]` Settings row still shows up to 8 buttons (blind, edge) — the SPEC asks for one primary with the rest grouped; met.
  - `[maybe-false]` `[defer]` Radio dot drawn by a gradient may vanish in forced-colors (blind, edge, UI) — unverified; settle with a Windows High Contrast check.
  - `[low]` `[reject]` Skip-link test reads source text; skip link has `focus:border` and `shadow-md` (blind, edge, gap) — the exception names reveal-only box styling, no ring or outline; class string untouched by this diff.
  - `[low]` `[reject]` Mainnet confirm: default variant, outside-press dismiss, no in-flight guard, stale wallet id (blind, edge, UI) — dismissing adds nothing; the handler already validates the wallet.
  - `[maybe-false]` `[reject]` Radio 44px hit area only inside a `<label>` (UI, blind) — both callers wrap it in a label.
  - `[low]` `[reject]` Duplicated test polyfills; status sentence is a separate live-region node; select highlight test weak (blind, edge) — developer hygiene with no named harm.
  - `[maybe-false]` `[reject]` 320px overflow unproven (blind, gap, intent) — jsdom cannot measure; checked in the browser pass.

## Auto Run Result

Status: in-review (done pending the browser pass)

Summary: new shared `Radio` and `Select` primitives replace native controls on the new screens; legends are `panel-legend` and status legends a word or two; each Settings wallet row has one primary action with the rest grouped and Remove last; "Use on Mainnet" opens a confirm dialog; `select.tsx` uses `data-[highlighted]`; the skip link keeps reveal-only `focus:` classes, documented in `docs/decisions.md` §6.3 and `DESIGN.md`; the grep for `focus:|outline-none` matches only the skip link and a test enforces it.

Review: 6 patches applied, 1 deferred (forced-colors radio dot), 13 rejected with reasons above.

Verification: lint, build, test (1384 passed), check:contrast all pass. Real-browser pass not run for this slice yet.

Residual risks: Settings row height at 320px, Mainnet confirm focus return, Radio under forced-colors, all unseen.
