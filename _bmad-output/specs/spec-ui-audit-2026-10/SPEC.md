---
id: SPEC-ui-audit-2026-10
companions: []
sources:
  - ../../../docs/sprints/ui-audit-2026-10-findings.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# UI audit 2026-10: touch targets and shadow tokens

## Why

A pain to solve. The shared primitives in `src/components/ui` were sized for a dense desktop panel, so every screen inherits controls under 44px, which are hard to hit on a phone. The same primitives carry raw `rgb()` shadow values that sit outside the token set. The audit scored the app 14/20 (Responsive 2) at `e07fd9a`, by code reading only. CAP numbers match the audit's issue numbers and severities.

## Capabilities

- **CAP-1** (issue 1, P1)
  - **intent:** A user on a phone can hit every button and tab trigger without mis-tapping a neighbour.
  - **success:** At a 390px-wide viewport every button and tab trigger measures at least 44×44px. Sites: `src/components/ui/button.tsx:76-79`, `src/components/ui/tabs.tsx:51`.
- **CAP-2** (issue 2, P1)
  - **intent:** A user can toggle the backup checkbox by touch without aiming at a 16px box.
  - **success:** At 390px a tap within 22px of the checkbox centre toggles it, and the tap area is at least 44px tall. Sites: `src/components/ui/checkbox.tsx:11`, `src/components/wallet/CreateWalletFlow.tsx:451` and `:475`.
- **CAP-3** (issue 3, P2)
  - **intent:** No dead sub-44px switch remains in the primitives for a future caller to inherit. Decided: remove it, since nothing imports it; a future on/off setting adds a correctly sized one.
  - **success:** `src/components/ui/switch.tsx` is deleted and nothing in `src` imports it.
- **CAP-4** (issue 4, P3)
  - **intent:** Shadow colours come from the token set, not from literals inside primitives.
  - **success:** No `rgb(` literal remains in `src/components/ui` or `src/components/wallet/QrScanner.tsx:140`.

## Constraints

- Nothing styles `:focus` and `outline-none` stays banned; touch sizing must add neither.
- `bun run check:contrast` must still pass after every change, including the token moves in CAP-4.
- Gates do not prove a visual change. A browser pass at phone and desktop width is required before a slice counts as done (`docs/agents/verifying-your-work.md`).
- Raising heights is checked against `DESIGN.md` and the instrument-panel density on desktop.
- Slice order: S1 (CAP-1, CAP-2), S2 (CAP-3), S3 (CAP-4). S3 follows S1 because both edit the same files.

## Non-goals

- No new controls and no redesign of the existing ones beyond size and hit area.
- No dialog or sheet work; `spec-mobile-dialogs` owns it.
- No audit of passkey flows, the camera, or installed-PWA behaviour.

## Success signal

On a 390px viewport, every button, tab trigger and checkbox on every screen is hittable at 44px, `grep "rgb(" src/components/ui` returns nothing, and the four gates plus a browser pass at phone and desktop width are green.

## Assumptions

- Acceptance is measured at 390px wide; the audit named no other width.
- The 16px checkbox and 36px button sizes are accidents of the dense desktop look, not a recorded decision (docs searched, none found).
- The non-goals are inferred from the findings file's scope; the owner did not state them.
- The owner confirmed 44px as the touch-target bar, and delegated the CAP-3 call, which was made as "remove".
