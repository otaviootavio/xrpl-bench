---
id: SPEC-ui-audit-2026-10
companions: []
sources:
  - ../../../docs/sprints/ui-audit-2026-10-findings.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# UI audit 2026-10: touch targets

## Why

A pain to solve. The shared primitives in `src/components/ui` were sized for a dense desktop panel, so every screen inherits controls under 44px, which are hard to hit on a phone. The audit scored the app 14/20 (Responsive 2) at `e07fd9a`, by code reading only. CAP numbers match the audit's issue numbers and severities. CAP-1 to CAP-3 are delivered (commits `50d850b`, `70d50d1`); CAP-4 was declined and retired.

## Capabilities

- **CAP-1** (issue 1, P1, delivered)
  - **intent:** A user on a touch screen can hit every button and tab trigger without mis-tapping a neighbour.
  - **success:** With touch emulation at 390px, every `<Button>`, tab trigger, and the Annunciator's dismiss, "+N more" and "Show less" buttons measure at least 44px tall (icon buttons 44×44), while the dismiss chip stays 20px. With a mouse, sizes are unchanged (default 36, `sm` 32, icon 36×36, tab about 30). The 44px sizing applies only under the Tailwind `pointer-coarse` variant. Sites: `src/components/ui/button.tsx`, `src/components/ui/tabs.tsx`, `src/components/Annunciator.tsx`.
- **CAP-2** (issue 2, P1, delivered)
  - **intent:** A user can toggle the backup checkbox by touch without aiming at a 16px box.
  - **success:** On touch, the wrapping label of each backup checkbox is at least 44px tall and a tap 20px beside the box toggles it; the 16px box itself is unchanged. Sites: `src/components/wallet/CreateWalletFlow.tsx:451` and `:475`.
- **CAP-3** (issue 3, P2, delivered)
  - **intent:** No dead sub-44px switch remains in the primitives for a future caller to inherit. A future on/off setting adds a correctly sized one.
  - **success:** `src/components/ui/switch.tsx` is deleted and nothing in `src` imports it.
- **CAP-4** (issue 4, P3, declined and retired; the ID is never reused)
  - **why declined:** `DESIGN.md`'s Shadow Vocabulary (lines 325-336) names `rgb(0 0 0 / x)` and `rgb(255 255 255 / x)` as the deliberate shadow recipes — field recess, key at rest, key pressed, swung-out module — lit from above in both themes, and `src/index.css` uses the same literals in the well recess. The audit's "outside the token set" was mistaken. Do not propose it again.

## Constraints

- Nothing styles `:focus` and `outline-none` stays banned; touch sizing must add neither.
- `bun run check:contrast` must still pass after every change.
- Gates do not prove a visual change. A browser pass at phone and desktop width is required before a story counts as done (`docs/agents/verifying-your-work.md`).
- Touch sizing is added only under `pointer-coarse`, so the desktop instrument-panel density is untouched (`DESIGN.md`).

## Non-goals

- No new controls and no redesign of the existing ones beyond size and hit area.
- No dialog or sheet work; `spec-mobile-dialogs` owns it.
- No audit of passkey flows, the camera, or installed-PWA behaviour.
- Selects, inputs and links stay at their present size on touch (deferred, `deferred-work.md`).

## Success signal

With touch emulation at 390px, every `<Button>`, tab trigger, backup-checkbox label and Annunciator control is hittable at 44px; with a mouse, sizes are as before; and the four gates plus a browser pass at phone and desktop width were green for each delivered story.

## Assumptions

- Acceptance is measured at 390px wide; the audit named no other width.
- The 16px checkbox and 36px button sizes are accidents of the dense desktop look, not a recorded decision (docs searched, none found).
- The non-goals other than the selects/inputs/links line are inferred from the findings file's scope; the owner did not state them.
- The owner confirmed 44px as the touch-target bar, and delegated the CAP-3 call, which was made as "remove".
- Not exercised in the browser: the Passkey-Derived Seed backup label, TwoDeviceSign, TrustLineRow, a funded account, and the wallet selector.
