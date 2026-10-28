---
title: 'Configure screen: shell, Checks and Seed plates'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_revision: '50e797c4bd9b15aed88684a42c4ea20593c041ff'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-19-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/DESIGN.md'
warnings: ['oversized']
deferred:
  - summary: >-
      `Back to Configure` is wired through the Let another wallet sign and Sign with two devices screens, but only Edit checks has a Configure key and a test until Story 15 adds the other launches; no test renders the real `TwoDeviceScreen` or `ControlWalletScreen` with the label.
    evidence: |-
      The props are dead until Story 15; add the render checks with their launch keys there.
    location: >-
      src/components/wallet/TwoDeviceSign.tsx, src/components/wallet/ControlWalletScreen.tsx
    severity: low
  - summary: >-
      The launch marker is read once at mount, so browser Forward into a task screen, or a remount, shows `Settings`; and the Settings tab still carries its own Reveal seed flow beside `RevealSeedControl`, so a Seed-lifetime fix in one does not reach the other.
    evidence: |-
      Story 19.4 deletes the Settings copy and the Settings launches; until then keep the two in step. Forward navigation shows the older label, not a wrong destination.
    location: >-
      src/lib/configure-launch.ts, src/pages/tabs/SettingsTab.tsx
    severity: low
  - summary: >-
      Because Configure renders in place of `Main`, the wallet shell's selected tab resets on return, and a Chooser-card entry pushes only the Configure entry, so browser Back goes to the Chooser rather than the shell; the Configure key, plates and Back are unverified in a browser at 320, 390 and desktop in both themes.
    evidence: |-
      The UX spine assumed the tab is kept; rendering Configure inside `Main` is a larger change. jsdom cannot observe layout; run the final browser pass.
    location: >-
      src/components/AppShell.tsx, src/components/wallet/ConfigureScreen.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Everything specific to one wallet (its checks, Reveal seed, control key, other networks, Node, two-device signing) lives in the app-level Settings tab beside address book and updates, reached only from inside a wallet. `/wallets/:id/configure` parses but renders the wallet shell.

**Approach:** A routed Configure screen per wallet (`/wallets/:id/configure`, h1 `Configure wallet`) with plates as h2s in a fixed order. This story builds the shell and the first two plates, **Checks** and **Seed**; Story 15 adds the other four. A Configure key on open Chooser cards and in the wallet header reaches it. Task screens opened from Configure say `Back to Configure`. Existing components are moved or reused, not restyled. The Settings tab is NOT trimmed here (Story 19.4 deletes its per-wallet content): everything it does today keeps working.

## Boundaries & Constraints

**Always:** **Route.** `AppShell` renders `ConfigureScreen` for `route.screen === 'configure'` (a wallet-side route; the wallet header shows) only when `route.walletId === activeWalletId`, that wallet exists, and its lock is open; otherwise `resetToHome()` and the Chooser (the shipped reachability rule, AD-32). `walletInView` already counts it as in-wallet. **Screen.** A `TaskScreen`-width plate column (`max-w-lg`), h1 `Configure wallet`, then plates in this fixed order, each an h2: `Checks`, `Seed`, `Operating another account`, `Other networks`, `Node`, `Two-device signing`. THIS story renders only `Checks` and `Seed` (no placeholder plates for the other four: Story 15 adds them in this order). Plates use the `config-section` / `card-plate` devices; no new colour token, no commit orange. **Checks plate:** the wallet's Open Check and Signing Check summarised in the words the Edit checks screen already uses (extract the wording helper from `EditChecksScreen.tsx`/`check-controls.tsx` rather than re-typing; include the standard-word wording from the recent copy fixes), and an **Edit checks** key (outline) that opens the shipped `edit-checks` task screen (`navigate(walletScreenPath('edit-checks', id))`) with its dialogs and focus return unchanged. (Auto-lock joins this plate in Story 16.) **Seed plate:** one sentence and a **Reveal seed** key (outline, not `danger`). Reuse the shipped Reveal seed flow from `SettingsTab.tsx` (confirm dialog titled `Reveal this wallet's seed?` with the per-check sentence from `revealCheckSentence`, confirm key `Show my seed` as the `destructive` fill, the wallet's own check through `keystore.revealSeed` with the wallet's own lock key and `usePrompts`, the Seed held in a ref and never in React state, `SeedReveal` dialog, cleared when it closes and on unmount) by extracting it into one component (e.g. `RevealSeedControl`) that Configure uses; leave the Settings tab's own per-wallet Reveal seed as it is (Story 19.4 deletes it) unless sharing the extracted component there is a straight swap with its tests unchanged. After the `SeedReveal` dialog closes, focus returns to the Reveal seed key. Cancelled and failed checks show the shipped strings. **Configure keys.** An open Chooser card has a **Configure** key (`Button variant="outline" size="sm"`, visible `Configure`, accessible name `Configure {name}`), placed before Rename in the action row; locked cards have none. It acts on the card's entry view: add `configureWallet(walletId)` beside `enterWallet` in the store (sets `activeWalletId` to that view and `navigate`s to its configure path) and call it with `group.entryWalletId`. The wallet header (Story 6's `AppHeader`) shows a Configure icon key, accessible name `Configure wallet`, only for an open lock (not on the Unlock view's Wallets-key-only header) and not on the configure screen itself; it navigates to the configure path. **Back.** Edit checks, Let another wallet sign and Sign with two devices opened from Configure show the back label `Back to Configure` and Back returns to Configure (a pushed entry: `leaveScreen`). When the same screens are opened from the Settings tab (still possible until 19.4) the label stays `Settings` and Back returns to the tab: decide which by a small one-shot launch marker set by the Configure keys and read once by `WalletScreens` at mount (not in the URL or history state), and say so in a comment; the label never contains a wallet name. **Tests mapping (test design R12):** each existing Settings-tab test for Edit checks (`settings-edit-checks.test.tsx`) and Reveal seed (`settings-reveal.test.tsx`) gets a Configure counterpart in new `configure-*.test.tsx` files before anything is deleted in 19.4 (copy the scenarios, drive them through the Configure screen). Keys 44px on coarse pointers; plates and key rows wrap at 320px and 200% zoom; no `:focus` styling, no `outline-none`.

**Never:** Do not trim or restyle the Settings tab. No auto-lock control here (Story 16). Do not add the four other plates (Story 15). No secret in state, URL or history state. Do not select a wallet except through `configureWallet` (the card key) and the existing `enterWallet`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Configure, open lock | `/wallets/a/configure`, `a` active, lock open | h1 `Configure wallet`, h2 `Checks`, h2 `Seed` | n/a |
| Lock closed or wallet missing or not active | same route | `resetToHome()`, Chooser | nothing wallet-scoped renders |
| Card Configure | open multi-view card | acts on the entry view (`activeWalletId` view else first) | n/a |
| Locked card | closed lock | no Configure key | n/a |
| Header | open wallet | Configure icon key `Configure wallet`; absent on Unlock header and on configure | n/a |
| Edit checks | press Edit checks | the shipped screen; label `Back to Configure`; Back returns to Configure | n/a |
| Edit checks from Settings tab | press the Settings tab's key | label `Settings`; Back returns to the tab | n/a |
| Reveal seed | press Reveal seed | confirm dialog, wallet's own check, `SeedReveal`; focus returns to the key | cancelled/failed strings as shipped |
| Seed lifetime | dialog closed, or unmount mid-reveal | Seed ref cleared | n/a |
| Back | Back from Configure | the wallet shell | n/a |

## Code Map

- `src/components/AppShell.tsx` -- route switch (`configure` currently falls to `Main`/shell guard `shellRoute`), `walletSide` header choice; render `ConfigureScreen`.
- `src/pages/Main.tsx`, `src/pages/WalletScreens.tsx` -- wallet content and task screens (`TaskScreen` back label comes from its `backLabel` prop, default `Settings`, `src/components/wallet/TaskScreen.tsx:19`); `WalletScreens` renders `EditChecksScreen`, `TwoDeviceScreen`, `ControlWalletScreen`.
- `src/pages/tabs/SettingsTab.tsx` -- shipped Reveal seed flow (`revealCheckSentence` ~33, `handleConfirmReveal` ~107, dialogs ~300-330), Edit checks launch (~241).
- `src/components/wallet/EditChecksScreen.tsx`, `check-controls.tsx` -- Open Check / Signing Check wording.
- `src/components/wallet/SeedReveal.tsx` -- the Seed display dialog; `src/lib/crypto/keystore.ts` -- `revealSeed`, `describeCheckFailure`; `src/hooks/usePrompts.ts`.
- `src/store/app-store.ts` -- `enterWallet` (add `configureWallet` beside it); `src/lib/route.ts` -- `walletScreenPath('configure', id)`.
- `src/components/AppHeader.tsx` -- wallet header (Story 6); `src/components/wallet/WalletCard.tsx`, `src/pages/Chooser.tsx` -- card keys.
- Tests: `src/pages/tabs/__tests__/settings-edit-checks.test.tsx`, `settings-reveal.test.tsx` (to map), `src/components/__tests__/AppShell.test.tsx`, chooser and header tests.
- chooser `EXPERIENCE.md` (Surfaces, Component Patterns: Configuration screen, Header Configure key; Exact strings: Configuration) and `DESIGN.md` (config-section); AD-32, AD-44 in the spine.

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/ConfigureScreen.tsx` (new), `RevealSeedControl` (new), wording helper extraction -- the screen, Checks and Seed plates -- FR-88, UX-DR6
- `src/components/AppShell.tsx` -- render Configure with the reachability guard -- AD-32
- `src/store/app-store.ts`, `WalletCard.tsx`, `Chooser.tsx`, `AppHeader.tsx` -- `configureWallet` and the two Configure keys
- `src/pages/WalletScreens.tsx`, `TaskScreen` callers, launch marker -- `Back to Configure`
- Tests: the matrix; Configure counterparts for every Settings Edit checks and Reveal seed test; the card key acts on the entry view and not on locked cards; the header key only for an open lock; the guard resets for a closed lock, missing or non-active wallet; the two plates and h1/h2 order (a test asserts the order list so Story 15 extends it); the Reveal Seed ref is cleared on close and unmount; the Seed never in rendered text outside the reveal dialog; every existing Settings-tab test still passes unchanged.

**Acceptance Criteria:**
- Given the wallet's lock is open, `/wallets/:id/configure` shows h1 `Configure wallet` and the plates Checks and Seed as h2s in the fixed order; given it is not open, the user returns to the Chooser.
- Given an open card or the wallet header, a Configure key reaches the screen (entry view on a multi-view card); locked cards have none.
- Given the Checks plate, it shows the Open Check and Signing Check in the words Edit checks uses and an Edit checks key that opens the shipped flow.
- Given the Seed plate, Reveal seed runs the shipped confirm, the wallet's own check, the Seed in a ref and `SeedReveal`, and focus returns to the key.
- Given a task screen opened from Configure, Back returns to Configure and the label says `Back to Configure`.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 9, edge-case hunter 12, verification gap 2, intent alignment descriptive; grouped by root cause into the rows below — high 1 and medium 2 and low 3 (patched), medium 1 and low 2 deferred, rest false or rejected as low
- findings:
  - `[high]` `patch` A reveal that resolved after the screen was left (a lock closing during a PIN or passkey prompt) wrote the plaintext Seed to the ref after the unmount cleanup had run — the control tracks whether it is mounted and drops the result; test added.
  - `[medium]` `patch` Pressing Show my seed twice while the check was open asked for the credential twice and counted twice against a lockout — one check at a time; test added.
  - `[medium]` `patch` The header Configure key also showed over the three task screens and pushed a Configure entry on top of them — it shows only on the wallet's own screen.
  - `[low]` `patch` `configureWallet` navigated for a wallet whose lock was closed (the shell then reset, leaving a stray entry) — it requires an open lock.
  - `[low]` `patch` The focus-return selector was not escaped, and the launch marker's blocked-navigation reset was unasserted — `CSS.escape`; `configure-launch.test.ts` covers launch, blocked launch and the reset.
  - `[medium]` `defer` Task-screen label wiring for two screens, the marker on Forward, duplicated Reveal flow, tab reset and the browser pass — see deferred.
  - `[false]` `reject` Configure reachability uses a different "open" rule from the header — every caller uses `lockId in openLocks` (the header's `useWalletIsOpen` included); an expired but unswept lock is closed by the auto-lock sweep the same way everywhere.
  - `[false]` `reject` The Checks plate shows stale checks after an edit — `WalletScreens.handleEdited` invalidates `queryKeys.lockInfo` after every committed edit.
  - `[low]` `reject` `openCheckWords` and `signingWords` fall back to a default for an unknown value — their parameters come from the typed check unions, so an unknown cannot arrive; the extraction kept the shipped wording.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Browser pass of Configure at 320, 390 and desktop in both themes (reveal a Seed on Testnet). Deferred to the final pass.

## Auto Run Result

Status: done

- Summary: `/wallets/:id/configure` renders a Configure screen (h1 `Configure wallet`; h2 plates Checks and Seed in a fixed order a test pins for Story 15 to extend) only for the active, existing, open wallet, otherwise returning to the Chooser. The Checks plate shows the Open Check and Signing Check in Edit checks' words with an Edit checks key; the Seed plate runs the shipped Reveal seed flow through an extracted control. Open Chooser cards and the wallet header have Configure keys; a task screen opened from Configure says `Back to Configure`.
- Files: `ConfigureScreen.tsx`, `ConfigPlate.tsx`, `RevealSeedControl.tsx`, `check-words.ts`, `reveal-copy.ts`, `src/lib/configure-launch.ts` (new), `AppShell.tsx`, `AppHeader.tsx`, `WalletCard.tsx`, `src/store/app-store.ts`, `WalletScreens.tsx`, the three task screens, `SettingsTab.tsx` (imports only), and tests (`configure-shell`, `configure-edit-checks`, `configure-reveal`, `configure-launch`, header and chooser).
- Review: 7 patches applied (1 high, 2 medium, 4 low), 3 deferred, the rest rejected with reasons above.
- Follow-up review recommended: true. A high finding (a Seed written after unmount) was patched in the reveal control; the Settings copy of the same flow is a second implementation until Story 19.4.
- Verification: `bun run lint`, `bun run build`, `bun run test` (1710 tests), `bun run check:contrast` pass after patches.
- Residual risk: no browser pass; the shell tab resets when Configure is left.
