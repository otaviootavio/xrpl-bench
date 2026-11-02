---
title: 'One card per Wallet with name, address and Network'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_revision: '125ab6457e478aae382e218c4f28280ceffa960c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/_bmad-output/specs/spec-one-network-per-wallet/SPEC.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The chooser draws one card per Seed. A locked card shows a name only, and an open card lists one row per Network. Under FR-93 a Wallet is one address on one Network, and the user must see which before opening it.

**Approach:** Replace `groupWalletsBySeed` with `listWalletCards`: one card per Wallet (`walletId`), locked or open, showing name, address and Network. The locked variant is typed to hold only `walletId`, `lockId`, `label`, `address`, `network`. Delete the network rows.

## Boundaries & Constraints

**Always:** Every card shows its name, its address through `AddressLink` with the card's own `network`, and its Network label. Mainnet adds the word "Real funds" and Devnet the word "Not stable" (badge, plus the existing Devnet notice on Devnet cards). A locked card carries no Node, check kind or balance, by type. Order stays Seed `createdAt` ascending, then `seedId`, then the view's own `createdAt` then id; `listWalletCards` and `walletIdsInChooserOrder` use one shared ordering helper so they cannot differ. `walletIdsInChooserOrder` and `nextActiveWalletId` keep their rules. The chooser makes no ledger read (AD-36). Keep the polished card rules: accessible names, 44px coarse targets (`KEY`), `aria-current`, no new token, no `outline-none`, no `:focus`. Card keys: `Open <label> on <Network label>` and, while open and the Open Check is not `none`, `Lock <label> on <Network label>`. A card is "Active" when its `walletId` equals `activeWalletId`. Lock state is per card from its own `lockId`; a controlled Wallet shares its key-holder's lock, so locking one flips both and the existing "they share one lock" note names the other card.

**Never:** Do not change Unlock, `enterWallet`, `leaveToChooser` or the entry-view logic outside the selector (story 22.4). Do not touch the Import sentence (22.5), keystore, lock model, Configure, or Rename and Remove (cards still show only Open and Lock). No Configure, Rename or Remove key on a card. No new ledger hook or `useActive*` hook in the chooser. No migration code (AD-48).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Locked Testnet card | Wallet, lock closed | Name, "Locked", address link to Testnet explorer, "Testnet", one key Open | n/a |
| Locked Mainnet card | Wallet on Mainnet, lock closed | Same plus "Real funds" | n/a |
| Devnet card | Wallet on Devnet | "Devnet", "Not stable", Devnet notice | n/a |
| Seed with a controlled view | Two Wallets on one Seed record, one lock | Two cards, no network rows, each with its own address and Network | n/a |
| Open card, no Open Check | `openCheck: 'none'` | Open key only, plus the existing "nothing to lock" text | n/a |
| Locked card given extra data | Wallet with `node`, `openCheck`, a balance | Card object holds exactly the five keys plus `state` | Type error if a field is added |
| Add wallet announced | `announceAdded(walletId)` | That card's h2 takes focus once | Unknown id: h1 takes focus |

</intent-contract>

## Code Map

- `src/store/wallet-groups.ts` -- `groupWalletsBySeed`, `WalletGroup`, `LockedGroup` (seedId, entryWalletId), `OpenGroup` (views[]), `WalletRow`. Replace with `listWalletCards`, `LockedCard` (`state`, `walletId`, `lockId`, `label`, `address`, `network`) and `OpenCard` (same plus `allowsLock`, `hasNode`). Build the locked object with explicit fields, not a spread. Keep `byCreated`; extract the Seed-then-view ordering used by `walletIdsInChooserOrder` and reuse it in the selector. `nextActiveWalletId` unchanged.
- `src/components/wallet/WalletCard.tsx` -- `NetworkRow` (address, Network word, badges, Open key, Devnet notice) becomes the body of every card; `LockedCard`/`OpenCard` merge into one card with an open/locked head (`CardHead`, `StatusLegend`, `ActiveLegend`). `<li data-seed-id>` becomes `data-wallet-id`. Reuse `KEY`, `CardName`, `NETWORKS[...].label`, `DEVNET_NOTICE`, `NO_OPEN_CHECK_ANSWER`. The open-only extras (Lock key, no-Lock text, `lockFailed` alert) render only when `state === 'open'`.
- `src/pages/Chooser.tsx` -- uses `groupWalletsBySeed`; key by `walletId`. Announcement map, `failedSeedId` and the shared-lock `others` filter become per `walletId` (`g.lockId === lockId && g.walletId !== walletId`). Focus lookup `[data-seed-id=...]` becomes `[data-wallet-id=...]`. Header comment: "one card per Wallet".
- `src/lib/chooser-signals.ts` and `src/components/wallet/AddWalletScreen.tsx` (line ~193) -- announce `meta.id` (the Wallet), not `meta.seedId`; rename the parameter and comment. At creation the Wallet id equals its Seed id, so focus lands on the same card.
- `src/components/AppShell.tsx` (lines ~92, ~98) -- `closest('[data-seed-id]')` becomes `data-wallet-id`.
- `src/lib/remove-wallet.ts` -- uses `nextActiveWalletId` and `walletIdsInChooserOrder` only; read-only.
- `src/components/wallet/AddressLink.tsx` -- takes `network`; already a store read only, no ledger read.
- Tests to rewrite: `src/store/__tests__/wallet-groups.test.ts` (selector, five-key type test, order, `nextActiveWalletId`, `walletIdsInChooserOrder` cases kept); `src/pages/__tests__/chooser.test.tsx` (its fixture has one Seed with three Networks: becomes three cards; locked-card "no address, network" assertions invert; "locked Mainnet renders like Testnet" is deleted; row tests become card tests; `data-seed-id` and `announceAdded` use); `src/components/__tests__/AppShell.test.tsx` (~207 to 224, `data-seed-id`); `add-wallet-import.test.tsx` (~153) and `create-entry-points.test.tsx` (~217) expect the announced id (`'seed-new'`, `'seed-9'`): re-point to the Wallet id the fixture returns.
- Read-only: `src/lib/crypto/keystore.ts` `WalletMeta` (`id`, `seedId`, `lockId`, `label`, `address`, `keyAddress`, `network`, `openCheck`, `node`); `src/store/app-store.ts` `enterWallet`.

## Tasks & Acceptance

**Execution:**
- `src/store/wallet-groups.ts` -- add `listWalletCards`, the two card types and one shared ordering helper; delete `groupWalletsBySeed`, `WalletGroup`, `LockedGroup`, `OpenGroup`, `WalletRow` -- AD-43.
- `src/components/wallet/WalletCard.tsx` -- one card per Wallet: name, state word, Active, address, Network word, badges, Open key (and Lock key when open) -- FR-81.
- `src/pages/Chooser.tsx` -- list cards, key and announce by `walletId`, shared-lock note across cards of one lock.
- `src/lib/chooser-signals.ts`, `src/components/wallet/AddWalletScreen.tsx`, `src/components/AppShell.tsx` -- walletId in place of seedId for focus -- the card is now a Wallet.
- `src/store/__tests__/wallet-groups.test.ts` -- test the I/O matrix: one card per Wallet; a Seed with a controlled view gives two cards; locked cards hold exactly the five keys plus `state` (runtime and `expectTypeOf`); open cards add `allowsLock` and `hasNode`; order equals `walletIdsInChooserOrder`; inputs not mutated; a shared lock opens both cards.
- `src/pages/__tests__/chooser.test.tsx` -- keep the zero-read test (empty cache, no client, no `NetworkPlate`, no active hooks) and add: every address link goes to its own card's explorer for locked and open cards; locked cards show name, address, Network, and "Real funds" or "Not stable" as text; no network rows; keys named as in Boundaries; a source check that `WalletCard.tsx` and `Chooser.tsx` mention no `node`, `openCheck` or balance on the locked path.
- `src/components/__tests__/AppShell.test.tsx`, `add-wallet-import.test.tsx`, `create-entry-points.test.tsx` -- re-point to `data-wallet-id` and the announced Wallet id.

**Acceptance Criteria:**
- Given any Wallet, locked or open, when the chooser renders, then its card shows the name, the address as an `AddressLink` to that Wallet's own Network explorer, and its Network label; a Mainnet card also says "Real funds" and a Devnet card "Not stable".
- Given one Seed record with a Mainnet key-holder and a controlled view, when the chooser lists it, then there are two cards and no network rows.
- Given a locked card, when its object type is read, then it holds only `walletId`, `lockId`, `label`, `address`, `network` (and `state`), and the test fails if a Node, check kind or balance is added.
- Given the chooser mounted with several open locks, when it renders, then the query cache is empty and `getXrplClient` is never called.
- Given Add wallet announced a new Wallet, when the chooser mounts, then that card's h2 takes focus once.
- Given the four gates, when run, then lint, build, test and check:contrast pass, and `groupWalletsBySeed` appears nowhere in `src`.

## Design Notes

A Wallet's lock may be shared only with a controlled Wallet of the same Seed (AD-47), so per-card `lockId` is enough: two cards that share a lock open and close together, as the existing shared-lock test shows. Opening still goes through `enterWallet(walletId)`; what Open does after unlock is story 22.4, so no change here. A locked card now shows the address and Network because AD-36 budgets ledger reads, not device reads.

```ts
type LockedCard = { state: 'locked'; walletId: string; lockId: string; label: string; address: string; network: NetworkId }
type OpenCard = Omit<LockedCard, 'state'> & { state: 'open'; allowsLock: boolean; hasNode: boolean }
```

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite succeed
- `bun run test` -- expected: all green, nothing skipped
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- In a Playwright browser on Testnet and Devnet only (never Mainnet, no real funds): create two Wallets, check name, address and Network on locked and open cards at 320, 390 and desktop widths, light and dark, at 200% zoom: no horizontal scroll, keys at least 44px on coarse pointers, one `aria-current` on the active card. Seed a Mainnet fixture through the store in a test, not the app, to check "Real funds".

## Spec Change Log

## Review Triage Log

### 2026-11-02 — Review pass
- verdicts: 18 findings — high 0, medium 1, low 6, false 11, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: duplicate labels on cards of one Seed — the device already refuses duplicate names (rename-copy.ts "Another wallet on this device already has that name."), so two cards with the same h2 or accessible name is not reachable.
  - `[low]` `[reject]` Blind: Lock gives no hint before the click that it also locks sibling cards — real, but the spec chose an after-the-fact "they share one lock" note; the fix would edit the spec.
  - `[low]` `[reject]` Blind: locked card shows address and Network, comments still cite AD-26 — the intent says so on purpose (Design Notes: AD-36 budgets ledger reads, not device reads); only a stale comment citation remains, cosmetic, and a docs fix is not this story's patch.
  - `[false]` `[reject]` Blind: `allowsLock` is per Wallet so cards on one lock can disagree — `openCheck` is stored per lock (keystore.ts, from `getLockInfo(lockId)`), so Wallets sharing a `lockId` share one `openCheck`; they cannot disagree.
  - `[false]` `[reject]` Blind: Active highlight only partly tested — chooser.test.tsx has "on a Seed's cards only the active Wallet's card is current" (c2 active, Delta current, Epsilon not).
  - `[low]` `[reject]` Blind: `data-wallet-id` stringly typed in four places — a developer nicety with no failing case; a shared constant is added surface for an unlikely defect.
  - `[false]` `[reject]` Blind: source-grep test is brittle, path-relative, `readFileSync` maybe not imported — the spec asks for this exact source check; `readFileSync` is imported (test line 26) and vitest runs from the project root.
  - `[low]` `[reject]` Blind: `hasNode` unused by the card, Devnet notice on open cards untested — the spec's Code Map and Tasks require `hasNode` on `OpenCard`, so the fix edits the spec; the notice is rendered for all Devnet cards regardless of state.
  - `[false]` `[reject]` Edge: Lock on a checked card also locks a no-check card on the same lock — both share one lock and so one `openCheck`; the case cannot arise.
  - `[false]` `[reject]` Edge: same label twice in the polite status line — labels are unique per device (see row 1).
  - `[false]` `[reject]` Edge: two cards with identical Open or Lock accessible names — labels are unique per device (see row 1), so names differ even on one Network.
  - `[low]` `[reject]` Edge: Lock failure alert shows only on the clicked card, not the sibling on the same lock — the sibling is truly still open, so nothing is misstated; the fix adds state and branches.
  - `[false]` `[reject]` Edge: `onLock` reads a stale `cards` closure — `onLock` is a `useCallback` with `cards` in its deps, so the click handler always holds the latest render's cards.
  - `[medium]` `[patch (fixed)]` Gap: no test clicks Lock on a card whose Seed has sibling cards on the same lock — the case this epic creates; the "also locked" note and polite status string are unpinned. Fix: in `src/pages/__tests__/chooser.test.tsx`, "the Lock key" block, open `LC`, click `Lock Gamma on Testnet`, assert the note `Locking Gamma also locked Delta, Epsilon: they share one lock.` and the status `Gamma: Locked. Delta: Locked. Epsilon: Locked.` (pre-verified gap finding). Fixed: added the test "locking a card whose Seed has sibling cards on the same lock names them and announces each" to the Lock key block; chooser.test.tsx passes (32 tests).
  - `[false]` `[reject]` Gap other: source-text test is not a behavioral check — the spec requires this source check; the behavioral guard (`Object.keys` / `expectTypeOf`) exists beside it in wallet-groups.test.ts.
  - `[low]` `[reject]` Gap other: deleted Mainnet-equals-Testnet test, positive text match could miss a stray badge — reviewer calls it acceptable; the test it replaced no longer holds because Network is shown.
  - `[false]` `[reject]` Auditor: "no ledger read for several open locks" not seen in the diff — chooser.test.tsx opens LA, LB, LC and asserts an empty query cache and no `getXrplClient` call (lines 74-84).
  - `[false]` `[reject]` Auditor: Unlock, header and Settings untouched (reading C), browser pass not in the diff — the intent excludes those surfaces (22.4 owns Unlock; the Never list); the browser pass is a manual process step, not a code defect.

## Auto Run Result

### Summary

The chooser now draws one card per Wallet instead of one per Seed. `groupWalletsBySeed` is replaced by `listWalletCards`. Each card, locked or open, shows its name, a state word (Open or Locked), its Network label and its address as an explorer link for that card's own Network. The per-Network rows are gone. A locked card is typed to hold only `walletId`, `lockId`, `label`, `address` and `network`. Mainnet cards add "Real funds". Devnet cards add "Not stable" and the Devnet notice. Card keys read `Open <name> on <Network>` and, while open with an Open Check, `Lock <name> on <Network>`. A card is Active when its `walletId` equals `activeWalletId`. Cards on one lock flip together, and the shared-lock note names the others. The chooser still makes no ledger read.

### Files changed

- `src/store/wallet-groups.ts`: `listWalletCards` and a shared ordering helper used by `walletIdsInChooserOrder`.
- `src/store/__tests__/wallet-groups.test.ts`: tests for card shape, ordering and the locked-card type guard.
- `src/pages/Chooser.tsx`: renders one card per Wallet; per-card lock state, status line and shared-lock note.
- `src/pages/__tests__/chooser.test.tsx`: card, key, Active marker, Lock-with-siblings and no-ledger-read tests.
- `src/pages/__tests__/create-entry-points.test.tsx`: updated for the new card layout.
- `src/components/wallet/WalletCard.tsx`: the card itself (name, state, Network, address link, badges, keys).
- `src/components/wallet/AddWalletScreen.tsx`: focus goes to the new card's heading after adding.
- `src/components/wallet/__tests__/add-wallet-import.test.tsx`: updated for the above.
- `src/components/AppShell.tsx`: updated for the card-per-Wallet chooser.
- `src/components/__tests__/AppShell.test.tsx`: matching test updates.
- `src/lib/chooser-signals.ts`: card focus signal now keyed by Wallet.

### Review findings

Patched: 1 (medium: no test locked a card with sibling cards on the same lock; test added).
Deferred: none.
Rejected: the rest, each with its reason in the review log above. Counts: high 0, medium 1, low 6, false 11, maybe-false 0.
followup_review_recommended is false: no high was patched and fewer than two mediums were.

### Verification

- Gates: 1828 passed in 126 files, 0 failed, 0 skipped. Lint, build and check:contrast also exit 0.
- Browser pass: I ran a dev server on port 5223 with a fresh Playwright profile. I created three local wallets: Alpha (Testnet, App PIN), Beta (Testnet, App PIN) and Gamma (Devnet, no authentication). Nothing touched Mainnet, and I funded and signed nothing. Opening Gamma made ordinary Devnet reads, nothing more.
  - Each Wallet gets its own card (three cards, no network rows), locked or open.
  - Each card shows its name, a state word, its Network label and its address as a link.
  - Links go to the card's own explorer: testnet.xrpl.org for Alpha and Beta, devnet.xrpl.org for Gamma.
  - Devnet shows both the "Not stable" badge and the Devnet notice.
  - Keys are `Open <name> on <Network>` and, while open with a check, `Lock <name> on <Network>`. A card with no Open Check shows only Open plus the "nothing to lock" text.
  - The Active marker and `aria-current` sit on exactly one card and moved from Alpha to Gamma after Gamma was opened.
  - After adding a wallet, the new card's h2 took focus. After Lock, the status line read "Beta: Locked." and focus went to the h1 Wallets. Returning from the in-wallet header landed on h1.
  - At 320, 390 and 1280 wide in dark and light, and at 640 wide with 200% zoom, there was no horizontal scroll, nothing clipped or overlapping. The sticky footer and Add wallet were reachable because the page scrolls inside its own container.
  - State is shown as text, not only by the colour dot.
  - Screenshots: /tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/c4ce42c4-8ea1-4e40-a6c7-c1d935b46f31/scratchpad/e22/shots-3/. The dev server is stopped and the browser is closed.
- Not checked: Mainnet "Real funds" (the spec says use a store fixture in a test), the shared-lock note across sibling cards in the browser, a coarse-pointer 44px measurement (CSS read only), a very long label, and the Configure screen (untouched by this story).
- Audit: 17/20 (Good). The Impeccable skill was not invoked; I applied the audit rubric by hand to the 11 changed files under src after reading PRODUCT.md and DESIGN.md. No browser was opened for the audit, so there are no audit screenshots. No P0 or P1.

### Non-blocking audit issues (P2/P3)

- P2, `Chooser.tsx` (status live region, shared-lock note) and `WalletCard.tsx` (card h2): the card is now one Wallet but spoken surfaces name it by label only. Two Wallets can share a label on different Networks. "<label>: Locked." and "Locking X also locked X" are ambiguous, and the two h2 headings are identical. Only the Open and Lock aria-labels include the Network. Add the Network label to those strings.
- P2, `WalletCard.tsx` lines 86-97: the Devnet notice sits outside the readout well, after the Open key row, and stacks with lock notes and the separate shared-lock note. Several Devnet cards repeat the notice word for word. This is a copy and grouping question; the story requires the notice.
- P3, address link: 20px tall, no coarse-pointer minimum, so under 44px on touch (inline secondary link; CSS read only).
- P3, chooser at 320px: Open and Lock sit on a row under the address, so the open card is taller than single-key cards.
- P3, "Wallet added." notice: it and its empty dashed slot stay at the foot of the page and the slot takes space when empty. Not part of 22.3.
- P3, `WalletCard.tsx` lines 43 and 68: the Network word and the Active legend use hand-written legend styling (`text-[0.6875rem]`, `tracking-[0.1em]`) instead of the DESIGN.md legend token (0.14em). The Active legend was already like this.
- P3, `WalletCard.tsx` lines 66-92: on a narrow screen the long address link and keys wrap onto separate lines inside the well. The layout holds; not measured at 320px.
- P3, housekeeping: `wallet-groups.ts` keeps its name after the group concept was removed, `Chooser.tsx` still uses `g` as the loop variable, and `OpenCard.hasNode` is exposed but no card reads it.
- P3, Mainnet ("Real funds") and Devnet ("Not stable") use the same warning badge variant. Meaning is carried by the words, so the colour-alone rule passes, but a Mainnet card looks no more serious than a Devnet card.

### Residual risks

- Spoken surfaces name a Wallet by label only (the P2 above); a screen-reader user may not tell which of two same-label Wallets changed state.
- The shared-lock note across sibling cards is pinned by a unit test but was not seen in a real browser.
- Mainnet "Real funds" and the coarse-pointer 44px targets were verified by test or CSS reading only.
