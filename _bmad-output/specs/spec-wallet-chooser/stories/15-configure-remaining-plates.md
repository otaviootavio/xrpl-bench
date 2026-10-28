---
title: 'Configure: remaining plates'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: 'dbe63833e43109f112072b92cbd3b901b6e7b16c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-19-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/DESIGN.md'
warnings: []
deferred:
  - summary: >-
      The Mainnet confirm and the network-view add logic exist twice (the Settings tab and `OtherNetworksPlate`), and `TwoDeviceSign` gained a Configure-specific `configureKey` prop.
    evidence: |-
      Story 19.4 deletes the Settings copy; until then the shipped confirm copy is pinned in two places with no test tying them together. A `launch` callback would keep Configure knowledge out of the shared component.
    location: >-
      src/pages/tabs/SettingsTab.tsx, src/components/wallet/OtherNetworksPlate.tsx, src/components/wallet/TwoDeviceSign.tsx
    severity: low
  - summary: >-
      Counterparts of the Settings tests for the master-key refusals that live in `lib/master-key.ts`, the two-device build, offline and busy-lock flows, and the Node save flow through Configure were not copied; Escape and outside-press dismissal of the Mainnet dialog has no focus test.
    evidence: |-
      The components are unchanged and their Settings tests still pass; Story 19.4 must not delete the Settings-side versions until these are mapped.
    location: >-
      src/pages/tabs/__tests__/
    severity: medium
  - summary: >-
      Configure's six plates, the Mainnet dialog and the focus fall-through to a `tabIndex={-1}` plate are unverified in a browser at 320, 390 and desktop in both themes.
    evidence: |-
      jsdom cannot observe layout or a visible focus indicator on a focused section; run the final browser pass.
    location: >-
      src/components/wallet/ConfigureScreen.tsx, src/components/wallet/OtherNetworksPlate.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** After Story 14 the Configure screen has only the Checks and Seed plates. The rest of a wallet's per-wallet settings (control of another account, other networks, Node, two-device signing) still live only in the Settings tab's wallet rows.

**Approach:** Add the four remaining plates to `ConfigureScreen`, in the fixed order after Seed: `Operating another account`, `Other networks`, `Node`, `Two-device signing`. Existing components are moved or reused, not restyled; every flow keeps its own confirm steps, checks and focus return; its Back returns to Configure. The Settings tab is NOT trimmed here (Story 19.4 deletes its per-wallet content): everything it does today keeps working, and its tests stay green unchanged.

## Boundaries & Constraints

**Always:** Plate order (h2s, after Checks and Seed from Story 14; extend the `PLATE_ORDER` list the Story 14 test pins): `Operating another account`, `Other networks`, `Node`, `Two-device signing`. **Operating another account** shows `ControlledNote` when it applies, the **Let another wallet sign** key when the wallet holds the Account Master Key (`holdsMasterKey(wallet)`, as Settings decides today; the key is launched with `launchFromConfigure(walletScreenPath('control', id), ...)` so the task screen's label is `Back to Configure` and focus returns to it), and `MasterKeyControl` (Account Master Key off and on with its shipped confirm, Signing Check and ledger-read rules, FR-77, FR-75). **Other networks** shows one `Use on {Network}` key per network the Seed has no view on (`NETWORK_IDS` minus the Seed's views, as Settings computes it from the store's `wallets`), or the one line `This key is already set up on every network.` when none remain (FR-61). `Use on Mainnet` keeps its shipped confirm dialog (title `Use {name} on Mainnet?`, body `Mainnet moves real funds. This adds the same key as a wallet on Mainnet; nothing is sent. Anything sent to this address there is real XRP.`, keys Cancel and `Use on Mainnet`) and its `returnFocusTo` target (the opener key, or the plate if the opener unmounted because its view now exists); Testnet and Devnet add directly; success `Wallet added on {Network}.`; failure shows the error message (shipped). Extract this from `SettingsTab.tsx` (`handleUseOnOtherNetwork`, the Mainnet dialog) into one component (e.g. `OtherNetworksPlate` content) used by Configure; leave the Settings tab's own copy as is unless a straight swap keeps its tests unchanged. After adding a view the store's `wallets` is refreshed from the keystore (`listWallets`) as Settings does; Configure stays on the same wallet (the new view is a sibling; no selection change). **Node** mounts `WalletNodeSection` unchanged (FR-61). **Two-device signing** mounts `TwoDeviceSign` unchanged (FR-78); its key to the `two-device` task screen goes through `launchFromConfigure` so the label is `Back to Configure`. **Plate presence:** a plate is omitted only when its feature cannot exist for this wallet at all (e.g. Operating another account when the wallet neither operates another account nor holds the Master Key, as Settings renders nothing there today); a control that is merely unavailable for now renders `aria-disabled` with its reason in visible text (UX-DR6, repo decisions 6.4). Keep `check:contrast` green; keys 44px on coarse pointers; plates and key rows wrap at 320px and 200% zoom; no `:focus` styling, no `outline-none`, no new colour token, no commit orange. No secret in state, URL or history state. **Tests mapping (test design R12):** each existing Settings-tab test for network views (`settings-network-views.test.tsx`), the master-key control (grep `MasterKeyControl`, `master-key` tests) and two-device signing (grep `TwoDevice`) gets a Configure counterpart in new `configure-*.test.tsx` files, driven through the Configure screen, before anything is deleted in 19.4.

**Never:** Do not trim or restyle the Settings tab or move auto-lock (Story 16). Do not change `MasterKeyControl`, `WalletNodeSection`, `TwoDeviceSign` or `ControlledNote` behaviour. No ledger read beyond what those components already make. No new plates beyond the four.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plate order | open wallet | h2s: Checks, Seed, then (those that apply) Operating another account, Other networks, Node, Two-device signing, in that order | n/a |
| Other networks | Seed has Testnet only | `Use on Mainnet`, `Use on Devnet` keys | n/a |
| Other networks, none left | Seed on all three | the line `This key is already set up on every network.`, no keys | n/a |
| Use on Testnet/Devnet | press | view added, `wallets` refreshed, `Wallet added on {Network}.` | error message shown |
| Use on Mainnet | press | confirm dialog; Cancel closes with focus back on the key; confirm adds the view | policy refusal shown (e.g. no Open Check) |
| Master key | wallet holds it | `MasterKeyControl` and the Let another wallet sign key | shipped refusals |
| No master key, own account | neither applies | Operating another account plate omitted | n/a |
| Two-device | any wallet | `TwoDeviceSign` as shipped; opened task screen says `Back to Configure` | n/a |
| Back | from a task screen | returns to Configure with focus on the opener key | n/a |
| Settings tab | unchanged | per-wallet rows still work, tests unchanged | n/a |

## Code Map

- `src/components/wallet/ConfigureScreen.tsx` -- the screen and `ChecksPlate`/`SeedPlate`; add the four plates in order; `src/components/wallet/ConfigPlate.tsx` -- the plate device; `src/lib/configure-launch.ts` -- `launchFromConfigure`.
- `src/pages/tabs/SettingsTab.tsx` -- the shipped wiring: `<ControlledNote>`, `<MasterKeyControl>`, `<TwoDeviceSign>`, `<WalletNodeSection>` (~178-186), `holdsMasterKey` Let-another-wallet-sign key (~220), `handleUseOnOtherNetwork` (~114), the network keys (~205-216), the Mainnet dialog (~330-355), `confirmNetworkFor`/`networkFallbackFor` state.
- `src/components/wallet/ControlledNote.tsx`, `MasterKeyControl.tsx`, `WalletNodeSection.tsx`, `TwoDeviceSign.tsx` (its key ~43 navigates to `two-device`) -- all take a `wallet` prop.
- `src/lib/control.ts` -- `holdsMasterKey`, `operatesAnotherAccount`; `src/lib/crypto/keystore.ts` -- `addNetworkView`, `listWallets`; `src/lib/xrpl/networks.ts` -- `NETWORKS`, `NETWORK_IDS`.
- Tests: `src/pages/tabs/__tests__/settings-network-views.test.tsx` and the Story 14 `configure-*.test.tsx` files (the harness pattern), `src/components/__tests__/configure-shell.test.tsx` (the plate-order list).
- chooser `EXPERIENCE.md` (Configuration screen plates and strings) and `DESIGN.md` (config-section); UX-DR6.

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/ConfigureScreen.tsx` -- the four plates in order -- FR-88
- `src/components/wallet/OtherNetworksPlate.tsx` (new, extracted from Settings) -- Use on {Network} with the Mainnet confirm -- FR-61
- `TwoDeviceSign.tsx` / the plate wiring -- launch through `launchFromConfigure` when mounted in Configure (keep the Settings behaviour)
- Tests: the matrix; Configure counterparts of every Settings test for network views, master key and two-device signing; the plate order list extended; omitted plates; the Mainnet dialog's focus return; a closed-lock or non-active wallet never renders Configure (Story 14's guard unchanged); every existing Settings test passes unchanged.

**Acceptance Criteria:**
- Given the Operating another account plate, it shows `ControlledNote` when it applies, the Let another wallet sign key when the wallet holds the Account Master Key, and `MasterKeyControl`, with the shipped confirm, Signing Check and ledger-read rules.
- Given the Other networks plate, it shows one `Use on {Network}` key per network the Seed has no view on, or one line saying none remain; `Use on Mainnet` keeps its confirm dialog and `returnFocusTo` target.
- Given the Node and Two-device signing plates, `WalletNodeSection` and `TwoDeviceSign` work unchanged.
- Given a control unavailable for now, it is `aria-disabled` with its reason in visible text; a plate is omitted only when the feature cannot exist for that wallet.
- Every flow keeps its confirm steps, checks and focus return, and its Back returns to Configure.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 7, edge-case hunter 9, verification gap 1 plus 2 notes, intent alignment descriptive; grouped by root cause into the rows below — medium 3 and low 2 (patched), medium 1 and low 1 deferred, rest false or rejected as low
- findings:
  - `[medium]` `patch` A second press on a Use-on key while an add was in flight sent a second `addNetworkView` — one add at a time, the keys `aria-disabled` meanwhile; test added.
  - `[medium]` `patch` The Mainnet dialog closed before the add settled, so focus went to the opener key, which then unmounted and dropped focus to the page — Confirm waits for the add, then closes, so focus is placed knowing whether the opener still exists.
  - `[medium]` `patch` The Node plate's Configure test could not fail if the section was not mounted — it now asserts the section's Custom Node field inside the plate.
  - `[low]` `patch` An add that succeeded but whose list refresh failed was reported as an add that failed — a separate message says it was added and the list could not be refreshed.
  - `[low]` `patch` The omission guard on the Operating another account plate was a tautology (a wallet always operates another account or holds the master key), so its "omitted" branch was dead — removed, with the comment saying the plate always renders.
  - `[medium]` `defer` Counterpart tests not copied, the Settings duplicate, and the browser pass — see deferred.
  - `[low]` `reject` The focus target is found by document-wide data attributes, store `wallets` may hold only some networks, the active network switching mid-add, the `Let another wallet sign` key never `aria-disabled` — the attribute lookups are scoped to one Configure screen, the store holds every wallet from `listWallets`, the keystore refuses a duplicate view, and the key's availability is decided by `holdsMasterKey` as in Settings.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Browser pass of Configure with all six plates at 320, 390 and desktop in both themes (Testnet). Deferred to the final pass.

## Auto Run Result

Status: done

- Summary: Configure shows all six plates in order: Checks, Seed, Operating another account (`ControlledNote`, the Let another wallet sign key, `MasterKeyControl`), Other networks (one `Use on {Network}` key per missing network with the shipped Mainnet confirm, or the line saying none remain), Node and Two-device signing. Task screens opened from Configure say `Back to Configure`. Settings is unchanged.
- Files: `ConfigureScreen.tsx`, `OtherNetworksPlate.tsx` (new), `ConfigPlate.tsx`, `TwoDeviceSign.tsx`, and tests (`configure-network-views`, `configure-master-key`, `configure-two-device` new, `configure-shell`).
- Review: 5 patches applied (3 medium, 2 low), 3 deferred, the rest rejected with reasons above.
- Follow-up review recommended: false.
- Verification: `bun run lint`, `bun run build`, `bun run test` (1731 tests), `bun run check:contrast` pass after patches.
- Residual risk: Story 19.4 must map the unmapped Settings-side tests before it deletes anything; no browser pass yet.
