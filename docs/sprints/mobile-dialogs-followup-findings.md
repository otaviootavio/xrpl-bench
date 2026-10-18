# Mobile dialogs follow-up — findings

Source: pasted text of this session's Impeccable audit of branch `worktree-mobile-dialogs-s2-s5` at `1fe011e`, plus the measurements recorded in `_bmad-output/implementation-artifacts/deferred-work.md`.
Baseline Audit Health Score: 15/20 (previous audit: 12/20). Verified by this run: no, pasted.

Issue IDs and severities are the audit's own and are canonical. These four numbers belong to this audit and are unrelated to issues 1–19 in `_bmad-output/specs/spec-mobile-dialogs/issue-map.md`.

## Root cause

All four were measured at a 320px viewport with text emulated at 200% (`html{font-size:200%}`), where the layouts built for normal text scale run out of room. This is inferred from the measurements, not separately verified. Issue 4 is a different kind: the checked-state dot is drawn as a background gradient, and a forced-colors mode may remove it; nobody has run that mode.

## Issues

| # | Sev | Issue | file:line | Verdict |
|---|---|---|---|---|
| 1 | P2 | Add wallet's sticky Create footer starts below the fold (top 745 in a 568 viewport) at 320px / 200% text, and only sticks into view after about 500px of scrolling | `src/components/wallet/TaskScreen.tsx:52`, `src/components/wallet/CreateWalletFlow.tsx:776`, `src/components/wallet/AddWalletScreen.tsx:165` | |
| 2 | P2 | Header wallet selector collapses to a 56px blank box at 320px / 200% text | `src/components/AppHeader.tsx:40` | |
| 3 | P2 | Let another wallet sign: the alert legend chip overflows its plate by 10px (184 vs 174) at 320px / 200% text. The audit text does not say which element the chip is; the status legend at the cited line is the likeliest | `src/components/wallet/ControlWalletScreen.tsx:218` | |
| 4 | P2 | Radio checked dot is a `radial-gradient` background that may not render under forced-colors. Unverified | `src/components/ui/radio.tsx:22` | |

Verdicts are blank: the audit gives none, and none of these is a dialog-versus-screen question. Listed for the user.

## Fix order

| Slice | Issues | What ships |
|---|---|---|
| S1 | 1, 3 | The routed Add wallet and Control wallet screens fit at 320px / 200% text: Create reachable on arrival, no overflow |
| S2 | 2 | The header wallet selector keeps a readable label at 320px / 200% text (shared by every screen) |
| S3 | 4 | Check the radio dot in forced-colors first, then fix only if it fails |

Each slice is one build. No slice depends on another. S2 touches every screen's header, so it should not run alongside S1.

## Not verified by the audit — manual checks

- Real browser zoom (200% was emulated as a font-size change) and real touch input.
- Windows High Contrast / forced-colors, for issue 4.
- iOS Safari keyboard against sheets, Android hardware Back.
- Edit trust line limit and import-warning sheets (never opened in a browser); the Mainnet typed phrase.

## Constraints

- Nothing styles `:focus` or `:focus-visible`; `outline-none` is banned (documented skip-link exception only).
- Colour never carries meaning alone; `bun run check:contrast` is the gate.
- Mobile floor: 320px wide, 200% zoom, 44px touch targets and 16px input text on coarse pointers, primary action reachable without scrolling.
- Viewport zoom is never disabled; coarse-pointer sizing stays inside the primitives.
- `bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast` stay green; a UI story is done only after a real-browser pass recorded in its Verification section.
- No secrets in state, storage, URL or history state.

## S1 — built and verified (issues 1, 3)

Fixes:
- Issue 1: `ScreenFooter` sat inside the form's own container, and a sticky element cannot leave its parent's box, so it stayed below the fold until the form scrolled into view. `CreateWalletFlow` now takes `actionHost` and portals the footer into a `contents` host that is a direct child of the `TaskScreen` section (`AddWalletScreen.tsx`); `stickyAction` is gone.
- Issue 3: the legend word is wrapped in `min-w-0 [overflow-wrap:anywhere]` in `ControlWalletScreen.tsx`, and `StatusLegend` gains `max-w-full` (`ui/lamp.tsx`).

Verification (real Chrome, 320x568 same-origin iframe, `html{font-size:200%}`, Testnet, one throwaway wallet with No Open Check):

| Check | Result |
|---|---|
| Add wallet, Create footer on arrival | Footer at top 281, bottom 450 inside a 333px scroll area; visible without scrolling |
| Let another wallet sign, legend chip | "Unknown", "Controlled", "Not controlled": scrollWidth equals clientWidth (174) for all three; the long one wraps to two lines |
| `bun run lint`, `build`, `test` (1386), `check:contrast` | All green |

Not covered: the window could not be resized to 320px, so the iframe stands in for the viewport; real zoom and touch are still unchecked. The sticky footer takes about half of the 333px scroll area at this extreme (the shell's header and tab bar take the rest); that is the shell's doing and is not changed here. Uncommitted.

## S2 — built and verified (issue 2)

Fix: the header's right-hand row (`AppHeader.tsx`) now wraps below `sm`, and the wallet picker has `min-w-[min(9rem,100%)] basis-36`. It had `flex-1` with no basis, so the network plate and lock key squeezed it to 56px; now it takes its own row when it cannot have 9rem.

Verification (real Chrome, 320x568 same-origin iframe, two Testnet wallets, No Open Check):

| Check | Result |
|---|---|
| Picker at 200% text | 254px wide, label "Second · Testnet" fully shown; header and page scrollWidth equal clientWidth (318) |
| Picker at 100% text | 230px, one row beside the title row as before; no overflow |
| Gates | `lint`, `build`, `test` (1386), `check:contrast` all green |

Seen, not fixed (outside this slice): at 200% text the tab labels BALANCES / SEND / RECEIVE visibly overlap in the tab bar, and the header takes 204px of the 566px viewport. Not measured beyond a screenshot.
