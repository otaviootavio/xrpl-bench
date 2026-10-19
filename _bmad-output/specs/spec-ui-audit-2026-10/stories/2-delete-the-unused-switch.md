---
title: 'Delete the unused switch'
type: 'chore'
created: '2026-10-18'
status: 'done'
baseline_commit: '50d850bc84e2755c39291118a6dce70b2c05ea85'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-ui-audit-2026-10/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/components/ui/switch.tsx` (20×36px, audit issue 3, P2; CAP-3) has no caller in `src`. It has been dead since the "Lock now" switch was replaced by a Button (`docs/sprints/interface-sprints.md`, "delete opportunistically"), and any future caller would inherit its sub-44px size.

**Approach:** Delete the file after confirming nothing in `src` imports it. The owner decided removal; a future on/off setting adds a correctly sized one. The `@radix-ui/react-switch` entry in `package.json` and `bun.lock` is not touched in this story.

</frozen-after-approval>

## Implementation Notes

- The unused dependency `@radix-ui/react-switch` (`package.json:34`, `bun.lock:13,368`) is left for a separate, deliberate change; removing it touches the lockfile and was not in the owner's decision. Logged in `deferred-work.md`.
- Changed: `src/components/ui/switch.tsx` deleted. Nothing in `src`, tests or config imported it (`grep` for `ui/switch`, `react-switch`: 0 hits outside the file).
- Surprise: the built bundle is not byte-identical without the file. Tailwind emits CSS for classes it finds in source text even when the component never renders, so the CSS drops from 49,009 to 47,628 bytes (nine rules only the switch used, including two `rgb()` shadow literals). The JavaScript is the same size (1,203,544 bytes). Compared at the same HEAD (`50d850b`), with and without the file.

## Review Triage Log

| # | Finding | Verdict | Evidence |
|---|---|---|---|
| 1 | `@radix-ui/react-switch` remains in `package.json` and `bun.lock` with no importer | medium | Real: an unused package in a wallet's dependency tree. It was deliberately left out of this story, so it is deferred, not patched. |
| 2 | Sprint, PRD addendum and triage docs still describe the switch as present or pending | low | `interface-sprints.md:384` ("still present, as planned") and the others are point-in-time records of what was true then; editing them rewrites history. Rejected. |
| 3 | The story file is untracked, `in-progress`, and has no Verification section | false | The reviewer read it mid-build; this section and the status are written at the end of the run. |
| 4 | The switch's "panel rocker" styling is documented nowhere | low | Recoverable from git history; the DESIGN.md touch-rule gap is already deferred from story 1. Rejected. |

## Verification

**Commands (run on the tree after the deletion, HEAD `50d850b`):**
- `bun run lint`, `bun run build` (includes `tsc -b`), `bun run test` (94 files, 1,330 tests), `bun run check:contrast` -- all exit 0.

**Browser check, 2026-10-18** (Playwright Chromium against `bun run dev` on port 5178; fresh context per configuration; CDP virtual authenticator; a throwaway unfunded Testnet wallet):
- 390px touch light, 1280px mouse light, 390px touch dark: all six tabs render, no console errors, no page errors, no failed requests; "Lock now" is a `<Button>` (97.7×44px on touch, 36px tall with a mouse) and locks the app to the PIN unlock screen.
- Screenshots opened: Settings at 390 light, 1280 light and 390 dark; the 390 dark locked screen; Send, Receive and History at 390 light; Tokens at 1280 light.
- Not checked: 320px; unlocking again after the lock; a second wallet; a screenshot showing "Lock now" itself (full-page captures clipped at the scroll container, so it was confirmed by role, tag, size and result); opened screenshots for the 1280-light and 390-dark tab renders (tab navigation and the console were checked, not every capture).
- `/impeccable audit` was not run: the change touches no rendered surface, since the deleted file had no importer.
