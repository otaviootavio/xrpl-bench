---
title: 'Route module: chooser route and unwind'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '50e006fe93c6cab343733d8e207c0f2adfe55dea'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-17-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
warnings: []
deferred:
  - summary: >-
      `bypassNext` stays set if `history.go(-n)` does not move (depth larger than the real stack); the next genuine Back is swallowed.
    evidence: |-
      Same pattern as the shipped `leaveScreen`; the depth counter is now kept true, so it needs a stale state to occur. `leaveToChooser` has no caller until Story 6, whose tests should cover it.
    location: >-
      src/lib/route.ts leaveToChooser
    severity: low
  - summary: >-
      `leaveToChooser` unwinds with registered overlays still open without calling their `close`.
    evidence: |-
      The overlay registrations are orphaned until their components unmount. Story 6 (Wallets key, Lock key) is the first caller; verify there.
    location: >-
      src/lib/route.ts leaveToChooser
    severity: low
  - summary: >-
      `resetToHome` replaces an entry with null state, so a later `navigate` restarts depth at 1 over entries that remain beneath.
    evidence: |-
      It lands on `/` and only adds one extra `/` entry to the unwind; no wrong screen results. Worth a look when Story 3 or 6 add a caller on a wallet path.
    location: >-
      src/lib/route.ts resetToHome
    severity: low
---

<intent-contract>

## Intent

**Problem:** `src/lib/route.ts` knows only `home` and four task screens, has no notion of a chooser, a settings route, a wallet or configure route, no depth in history state, and no single unwind to the chooser. `leaveScreen()` pops one entry, so a Wallets key built on it would land users at the shell, and a bookmark or reload inside a wallet path could mount an in-wallet screen.

**Approach:** Extend the pure route module per AD-32 and AD-33: a `Route` of `chooser | settings | add-wallet | wallet | configure | edit-checks | two-device | control`, `home` retired in one change (not aliased), `isWalletScreen`, `rewriteBootLocation` run once at module scope before first render, a `depth` counter in history state, and `leaveToChooser()`. No UI is added; existing consumers move from `home` to `chooser` with no visible change.

## Boundaries & Constraints

**Always:** Paths: `/`, `/settings`, `/wallets/new`, `/wallets/:id`, `/wallets/:id/configure`, `/wallets/:id/checks`, `/wallets/:id/two-device`, `/wallets/:id/control`. `parseRoute` stays total (unknown path parses to `chooser`; malformed escape or empty id is not a route). A path carries a screen name and at most a wallet id; history state carries no secret and no form data, only `{ screen: true, depth: n }` (and `overlay: true`). `isWalletScreen` is the only split: `wallet`, `configure`, `edit-checks`, `two-device`, `control` are in-wallet; `chooser`, `settings`, `add-wallet` are not. Every entry the app pushes carries `depth` = (depth of the current entry, 0 when absent) + 1; an overlay entry copies its screen's depth. `leaveToChooser()` honours blockers (no-op while one is active), unwinds `depth` entries plus the overlay entry if open in one `history.go`, and `replaceState`s `/` when depth is absent (an entry created by a boot), then notifies. `leaveScreen()` is unchanged in behaviour (ignores blockers). `rewriteBootLocation()` `replaceState`s any pathname other than `/` to `/`, including `/settings`, and is idempotent.

**Never:** No router dependency. No `home` alias. No new screen, chooser UI, or store change (later stories). Do not change which screens `Main` renders: until the chooser screen exists, `chooser`, `settings`, `wallet` and `configure` all render today's shell, and only `add-wallet`, `edit-checks`, `two-device`, `control` reach `WalletScreens`. Do not call `history.*` outside `route.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Parse | `/`, `/settings`, `/wallets/new`, `/wallets/a`, `/wallets/a/configure`, `/wallets/a/checks`, `/wallets/a/two-device`, `/wallets/a/control` | chooser, settings, add-wallet, wallet, configure, edit-checks, two-device, control (with walletId) | unknown, `/wallets`, `/wallets/%E0%A4%A/checks`, `/wallets//checks`, extra segments -> chooser |
| Boot | location `/wallets/a/checks` | `rewriteBootLocation()` replaces with `/`, state null | already `/` -> no history write |
| Depth | boot at `/`, `navigate(A)`, `navigate(B)` | states carry depth 1 then 2 | n/a |
| Unwind | depth 2, no overlay | one `history.go(-2)` lands on `/`, listeners notified | n/a |
| Unwind with overlay | depth 2 plus overlay entry | one `history.go(-3)` | n/a |
| Boot entry | in-wallet path entered by boot (no depth) | `replaceState` `/`, listeners notified | n/a |
| Blocked | blocker active | `leaveToChooser()` does nothing | caller can show a reason |
| isWalletScreen | each route | per the split above | n/a |

</intent-contract>

## Code Map

- `src/lib/route.ts` -- the whole module: `Route`, `HOME_PATH`, `parseRoute`, `navigate` (pushes `{ screen: true }`), `pushOverlayEntry` (copies `screen`), `leaveScreen`, `resetToHome`, blockers, overlays, `onPopState` (re-pushes `{ screen: true }` for a blocked screen: it must carry depth too). Rework here. Rename the shell path constant to `CHOOSER_PATH` if `HOME_PATH` is referenced nowhere else; `resetToHome` may keep its name.
- `src/lib/__tests__/route.test.ts` -- existing history tests (jsdom); update `home` expectations to `chooser`, add the matrix cases.
- `src/hooks/useRoute.ts` -- reads `parseRoute`; no change expected.
- `src/pages/Main.tsx:58` -- `route.screen !== 'home'` renders `WalletScreens`; change to render it only for the four task screens.
- `src/pages/WalletScreens.tsx:21` -- prop type `Exclude<Route, { screen: 'home' }>`; narrow to the four task-screen routes.
- `src/pages/__tests__/create-entry-points.test.tsx:67`, `src/pages/__tests__/wallet-screens.test.tsx:21` -- reference `'home'`; update.
- `src/main.tsx` (or the first module the app loads) -- call `rewriteBootLocation()` at module scope before the React render.
- `src/pages/tabs/SettingsTab.tsx`, `src/components/wallet/TwoDeviceSign.tsx`, `src/App.tsx` -- use `navigate`, `walletScreenPath`, `ADD_WALLET_PATH`, `resetToHome`; keep working unchanged unless an export is renamed.
- AD-32, AD-33 in the chooser `ARCHITECTURE-SPINE.md` -- the binding rules.

## Tasks & Acceptance

**Execution:**
- `src/lib/route.ts` -- new `Route` union, paths, `parseRoute`, `isWalletScreen`, `rewriteBootLocation`, depth on every pushed state (including the blocked-screen re-push and overlay entry), `leaveToChooser` -- AD-32, AD-33
- `src/main.tsx` -- call `rewriteBootLocation()` before first render -- a bookmark or reload can never mount an in-wallet subtree
- `src/pages/Main.tsx`, `src/pages/WalletScreens.tsx` -- replace `home` handling; task screens only to `WalletScreens`; every other route renders the existing shell -- no visible change
- `src/lib/__tests__/route.test.ts` and the two page tests -- update and add every matrix row; a test that fails if `isWalletScreen` or the depth unwind is removed

**Acceptance Criteria:**
- Given any matrix row, when the module runs in jsdom, then the stated route, state and history position result and listeners fire once.
- Given a cold start at `/wallets/x/checks`, when `rewriteBootLocation()` runs before render, then the location is `/`.
- Given the app (with no chooser yet), when it runs, then it behaves as before: Settings tab, Add wallet, Edit checks, control and two-device screens open and close as they do today.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 6, edge-case hunter 9, verification gap 3 plus 2 notes, intent alignment descriptive; grouped by root cause into the rows below — medium 3 (patched), low 5 (2 patched, 3 deferred), false 3
- findings:
  - `[medium]` `patch` A screen pushed while an overlay is open writes `depth` one short, so `leaveToChooser` lands on an in-wallet entry — `navigate` now counts the overlay entry; test added.
  - `[medium]` `patch` The blocked-screen re-push derived its depth from the entry it landed on and was wrong after a multi-entry Back — `blockLeaving` now captures the screen's depth and the re-push restores it; depth-2 test added.
  - `[medium]` `patch` `main.tsx` boot rewrite is unverified (delete the call and nothing fails) — `src/__tests__/main-boot.test.tsx` asserts the path is `/` when render is requested.
  - `[low]` `patch` `isTaskRoute` has no test and `Main` routing split is only proxied by a copied Host — table test added for `isTaskRoute`.
  - `[low]` `patch` A reload at `/` keeps a stale `{ screen, depth, overlay }` state — `rewriteBootLocation` now also clears non-null state at `/`; test added.
  - `[low]` `defer` `bypassNext` left set if `go` does not move; overlays not closed on `leaveToChooser`; `resetToHome` null state — see deferred.
  - `[false]` `reject` `/wallets/` with an empty id reaches the wallet branch — a trailing slash is trimmed, so it has one part and parses to the chooser; `/wallets//checks` is tested.
  - `[false]` `reject` boot rewrite runs after imports so modules might read `location` — no module in `src` reads `location` at import time; the call is at module scope before `createRoot`.
  - `[low]` `reject` a wallet id literally `new` parses as add-wallet; `rewriteBootLocation` keeps query and hash at `/`; `SETTINGS_PATH` unused; `registerServiceWorker` runs before the rewrite; `isTaskRoute` re-lists screens — the path is fixed by the spec, ids are generated, none cause a wrong outcome, and `isTaskRoute` is a different split from `isWalletScreen`, not a second one.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- None: pure module, no visible change. A browser pass of Add wallet and Edit checks open/close is deferred to the chooser branch's single pass.

## Auto Run Result

Status: done

- Summary: The route module has the eight-screen `Route`, `isWalletScreen`, `rewriteBootLocation` (called in `main.tsx` before first render), depth in every pushed history state and `leaveToChooser`. `home` is gone; existing screens behave as before.
- Files: `src/lib/route.ts` (module), `src/main.tsx` (boot call), `src/pages/Main.tsx`, `src/pages/WalletScreens.tsx` (task routes only reach WalletScreens), `src/lib/__tests__/route.test.ts`, `src/__tests__/main-boot.test.tsx` (new) and four page tests updated for depth state.
- Review: 5 patches applied (3 medium, 2 low), 3 deferred, the rest rejected with reasons above.
- Follow-up review recommended: true. Two or more medium findings were patched in `route.ts`, and `leaveToChooser` has no production caller yet, so the unwind is verified only against jsdom `history.go` spies; Story 6 should check it against a real history stack.
- Verification: `bun run lint`, `bun run build`, `bun run test` (101 files, 1410 tests), `bun run check:contrast` pass after patches.
- Residual risk: no browser pass yet (deferred to the chooser branch's single pass).
