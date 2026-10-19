# UI audit 2026-10 — findings

Source: Impeccable audit of `fix/dialogs-mobile` at `e07fd9a` (plus the uncommitted working tree on that branch).
Baseline Audit Health Score: 14/20 (Accessibility 3, Performance 4, Responsive 2, Theming 3, Implementation Integrity 2). Verified by this run: yes, by code reading only. The detector ran degraded (HTML parser modules missing), so its empty result is an undercount. No browser pass was made, and nothing was measured at any viewport.

Issue IDs and severities are the audit's own and are canonical.

## Root cause

The shared primitives in `src/components/ui` were sized for a dense, instrument-panel look on desktop. Their dimensions and hit areas were never raised for touch, so every screen inherits sub-44px targets. The raw `rgb()` shadow literals are the same pattern: values written inside primitives rather than drawn from tokens.

## Issues

| # | Sev | Issue | file:line | Verdict |
|---|---|---|---|---|
| 1 | P1 | Buttons are under 44px tall (default `h-9` = 36px, `sm` `h-8` = 32px, `icon` `h-9 w-9`); tab triggers measure about 30px | `src/components/ui/button.tsx:76-79`, `src/components/ui/tabs.tsx:51` | |
| 2 | P1 | Checkbox is 16px with no enlarged hit area; its only larger target is the wrapping label | `src/components/ui/checkbox.tsx:11`, used at `src/components/wallet/CreateWalletFlow.tsx:451` and `:475` | |
| 3 | P2 | Switch is 20×36px; it has no caller outside `ui/` | `src/components/ui/switch.tsx:16` | remove |
| 4 | P3 | Raw `rgb(...)` shadow literals in 7 files of `src/components/ui` (also one in `QrScanner.tsx:140`), outside the token set | `src/components/ui/button.tsx:40` (example) | declined |

Line references were re-checked against the current code. Two moved from the audit text: the tab trigger is at `tabs.tsx:51` (not 50), and the checkbox is used at two sites, not one.

## Acceptance (testable)

- **1.** At a 390px-wide viewport, every button and tab trigger measures at least 44×44px.
- **2.** At 390px, a tap within 22px of the checkbox centre toggles it, and the tap area is at least 44px tall.
- **3.** `switch.tsx` is deleted and nothing in `src` imports it (decided: remove).
- **4.** Declined, not built: `DESIGN.md`'s Shadow Vocabulary (lines 325-336) names these `rgb(0 0 0 / x)` and `rgb(255 255 255 / x)` values as the intended shadows, and `index.css` uses them too. The audit's "outside the token set" was mistaken.

## Fix order

| Slice | Issues | What ships |
|---|---|---|
| S1 | 1, 2 | Touch-sized buttons, tab triggers and checkbox hit area; one build, since all three live in the primitives |
| S2 | 3 | Delete the unused switch. Depends on nothing |
| S3 | 4 | Declined; not built |

## Not verified by the audit — manual checks

- Any measurement at real phone or desktop widths. The audit read code only.
- Real iOS and Android touch behaviour, and the installed-PWA presentation.
- Passkey flows and the camera (QR scanner).
- Whether raising control heights breaks the instrument-panel density on desktop. A visual pass is needed after S1.
- The detector's full result, once its HTML parser modules are installed.

## Constraints

- Nothing styles `:focus`; `outline-none` is banned.
- Colour never carries meaning alone, and `bun run check:contrast` is the gate.
- Gates: `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast`. Green gates do not prove a visual change works; see `docs/agents/verifying-your-work.md`.
- Anything visual follows `DESIGN.md` and its named rules.
