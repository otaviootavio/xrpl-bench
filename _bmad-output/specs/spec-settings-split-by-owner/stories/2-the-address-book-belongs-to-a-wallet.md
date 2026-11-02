---
title: 'The Address Book belongs to a Wallet'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_revision: '7d747b003f8dc3ffe33393e4d001582baa2cb9ec'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The per-wallet Address Book list has no storage cap; only the display is capped at 10.
    evidence: |-
      addAddressBookEntry appends without limit and the list lives in the persisted app-state blob. The old global book was equally unbounded, so this predates the story.
    location: >-
      src/store/app-store.ts addAddressBookEntry
    severity: low
---

<intent-contract>

## Intent

**Problem:** One global Address Book lets a payment from one wallet silence another wallet's first-time-destination warning, and a removed wallet leaves its recipients behind. The book is also shown on `/settings`, an app-level screen.

**Approach:** Store the book as `Record<walletId, entries>` in the same persisted slice (AD-50). Send reads and writes only the sending wallet's list. The book becomes a plate in the Wallet tab after Name; `/settings` loses it. Removing a wallet deletes its list (CAP-2).

## Boundaries & Constraints

**Always:** Entry identity stays `(network, address, tag)` and the helpers in `src/store/address-book.ts` stay unchanged. A wallet reads only its own list through one selector keyed by the entered `walletId`; a write takes the `walletId`. The selector returns one shared frozen empty array for a wallet with no list (a fresh `[]` per call loops zustand). No list, or an unhydrated store, means the warning shows. An old array-shaped book, or any non-object, merges to `{}`; each stored list is cleaned with `migrateAddressBook`; the merge never throws. The `addressBook` field stays in `partialize` and `PERSISTED_DEFAULTS` (`{}`), so Remove all still clears it with the slice. `removeWalletData` deletes the wallet's key and never throws. Plate wording follows ASD-STE100, sentences under 21 words. 320px, 200% text, 44px coarse targets, no new colour token, nothing styles `:focus`, no `outline-none`.

**Never:** No migration of the old array and no error for it (AD-48). No new persistence owner. No chooser or `/settings` read of any book (AD-36). No change to the Remove confirm dialog bodies, the keystore, the lock model, Remove all, Version, or the update marker (story 3). No label editing, no add/edit/delete controls, no per-network split. Do not touch `docs/sprints/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Validated send | Wallet A pays a new pair | Entry saved under A's id only | Write ignored if A is no longer in `wallets` (a removal mid-send must not resurrect a key) |
| Other wallet paid it | B holds `(net, X, tag)`; A sends there | A sees the "haven't sent here before" step | n/a |
| No list / unhydrated | No key for A, or store on defaults | Warning shows | Hydration failure stays Gate's error state |
| Old array on disk | Persisted `addressBook: [..]` | Reads as `{}`; app starts; next write replaces the array | Never throws |
| Malformed map | Value for a key not an array, or an entry with no address | That list reads empty / entry dropped; other lists kept | Never throws |
| Plate with 11+ entries | Wallet holds 14 | First 10 in stored order and "Show all 14"; pressing it lists all 14 and offers "Show first 10" | `aria-expanded` set |
| Plate empty | No entries | "No saved addresses yet" and the existing explanatory sentence | n/a |
| Remove a wallet | Confirm Remove for A | A's key is gone; B's list untouched; plate text named the wallet and its Address Book beforehand | Runs in `finally`; a throw is swallowed like the rest of the scope |
| Remove all | Chooser Remove all | Whole slice cleared (unchanged) | n/a |
| Controlled Wallet | Wallet that operates another account | Has its own list under its own id | n/a |

</intent-contract>

## Code Map

Earlier story (23.1, done): `WalletTab` exists at `src/pages/tabs/WalletTab.tsx`, plates in order identity, Name, Checks, Seed, Operating another account, Node, Two-device, Remove last. `AppSettings` still holds the global book and is served at `/settings` only. The Wallet tab reads only the store and `lockInfo`; the h1 and Network sit above the plates; `ConfigPlate` is the plate shell; `data-configure-*` hooks and focus-return module state are untouched. Story 1's hand-back: the Address Book is reached only from `/settings` until this story.

- `src/store/app-store.ts` -- `AppState.addressBook` (line 23), `addAddressBookEntry` (54, 245), `PersistedAppState`/`PERSISTED_DEFAULTS` (119, 129), `mergePersistedAppState` (191-199, currently `migrateAddressBook(state.addressBook)`), `partialize` (297), `clearPersistedAppState` (resets to defaults). Change type to `Record<string, AddressBookEntry[]>`, action to `(walletId, entry)`, add the selector and the empty-array constant, add `removeAddressBook(walletId)` for teardown. Version stays 0 (normalise on read, as the existing comment explains).
- `src/store/address-book.ts` -- pure helpers; `migrateAddressBook` (cleans one list, total) is reused per list. Leave the helpers unchanged. Its header says nothing about per-wallet storage; add one line.
- `src/pages/tabs/SendTab.tsx` -- reads `s.addressBook` (69) and decides the warning at 177 and 179; writes at 449 after `validated`. `wallet` (from `useActiveWallet`) is already in scope; use its id, read at send time from the same closure that submits.
- `src/pages/AppSettings.tsx` -- Address book card (lines 24-83) and its imports (`AddressLink`, `counterpartyKey`, `tagNotRecorded`, `NETWORKS`, `useAppStore`). Move the row markup out; delete the card; fix the doc comment (lists Address book).
- `src/pages/tabs/WalletTab.tsx` -- add the new plate after `NamePlate` in `WalletTab` (line ~337); `RemovePlate` (255-296) copy "Remove this wallet on {network} from this device." becomes one that also names the wallet and its Address Book; key text and aria-label stay.
- `src/components/wallet/AddressBookPlate.tsx` (new) -- plate built on `ConfigPlate title="Address Book"` holding the moved `<dl>` rows (keyed by `counterpartyKey`), the empty text, and the 10-entry cap with the Show all toggle.
- `src/lib/teardown.ts` -- `removeWalletData` (173-181); call the store's `removeAddressBook(removed.id)` first, inside the existing non-throwing scope. Line 60's `holds` text stays true. Read-only: `removeAccountScoped`, `tearDownAllLocalState`.
- `src/lib/remove-wallet.ts` -- calls `removeWalletData` from `finally` (line 73); no change expected. `src/lib/remove-copy.ts` (dialog bodies) is read-only.
- `src/components/wallet/RemoveAllPlate.tsx`, `src/pages/Unlock.tsx` -- copy mentions "the address book"; still true; read-only.
- Tests that touch `addressBook` (all must be re-pointed, not deleted): `src/store/__tests__/address-book.test.ts`, `app-store-migration.test.ts`, `active-network.test.ts`; `src/lib/__tests__/teardown.test.ts`; `src/pages/tabs/__tests__/send-address-book.test.tsx`, `send-pin-dialog.test.tsx`, `send-destination-error.test.tsx`, `settings-address-book.test.tsx` (becomes the Wallet tab plate test); `src/pages/__tests__/app-settings.test.tsx` (line ~60 asserts the Address book: invert), `seed-import-screens.test.tsx`; `src/__tests__/gate-migration.test.tsx`; `src/components/__tests__/configure-shell.test.tsx` (plate order gains Address Book after Name) and `chooser-settings.test.tsx`.
- Docs: `docs/decisions.md` line 26 (Address book row says Settings lists the entries; line 474 and 1184 name `AppSettings` as holding it). Update live wording; leave sprint and story records.

## Tasks & Acceptance

**Execution:**
- `src/store/app-store.ts` -- per-wallet map, `addAddressBookEntry(walletId, entry)` that ignores an id not in `wallets`, `removeAddressBook`, selector `selectAddressBook(walletId)` / hook returning the stable empty array, merge reads non-object or array as `{}` and cleans each list with `migrateAddressBook`, skipping `__proto__` (build with `Object.fromEntries`; read with own-property check) -- AD-50 by shape
- `src/pages/tabs/SendTab.tsx` -- read the sending wallet's list, pass `wallet.id` on write -- only that wallet's entries decide the warning
- `src/components/wallet/AddressBookPlate.tsx` and `src/pages/tabs/WalletTab.tsx` -- new plate after Name for the entered wallet, cap of 10, "Show all N"; Remove plate names the wallet and its Address Book -- UX-DR4, FR-13
- `src/pages/AppSettings.tsx` -- remove the Address book card and dead imports; update comment -- `/settings` shows none (AD-36)
- `src/lib/teardown.ts` -- delete the wallet's list in `removeWalletData` -- no label outlives a wallet
- Tests -- fail-first cases: another wallet's entries are not read; another wallet's entry does not silence the warning (same pair, two wallets, same network); a wallet with no list and an unhydrated store show the warning; old array merges to `{}` and a non-array list value does not throw; write is saved under the sender only and ignored for a removed wallet; removal deletes only that key and does not throw; Remove all clears the slice; plate cap and toggle with 10, 11 and 0 entries, and a controlled wallet's own list; `/settings` has no "Address book"; chooser tree reads no book (source or render check); Wallet tab plate order. Re-point the listed existing tests. -- keeps coverage
- `docs/decisions.md` -- reword the Address book row and the two `AppSettings` mentions -- docs match code

**Acceptance Criteria:**
- Given a payment validated from wallet A, when it is recorded, then the recipient is in A's list only.
- Given an address wallet B has paid, when A sends to it and has not, then the first-time step shows.
- Given no list, or a store not yet read, when a send starts, then the first-time warning shows.
- Given a device with the old array-shaped book, when the app starts, then the book reads as empty and startup does not fail.
- Given the Wallet tab, when it renders, then the Address Book plate follows Name, lists only this wallet's entries, shows the first 10 and "Show all N" beyond that; `/settings` shows no Address Book.
- Given a wallet is removed, when removal finishes, then its entries are gone, the plate named the wallet and its Address Book beforehand, and Remove all clears every entry.
- Given a controlled Wallet, when its tab renders, then it shows its own book. The chooser reads no Address Book.

## Spec Change Log

## Review Triage Log

### 2026-11-02 — Review pass
- verdicts: 30 findings — high 0, medium 5, low 15, false 10, maybe-false 0
- findings:
  - `low` `reject` Blind: plate shows the oldest ten, newest hidden behind Show all — The spec's Design Notes fix the reading: first 10 in stored order. The code does that; only the doc comment wording differs. The fix would edit the spec.
  - `low` `reject` Blind: orphaned lists never pruned on hydrate — Real only if the app dies between removeWalletData and the setWallets that follows it in the same synchronous step; no await sits between them. Fix adds a guard in the merge. Unlikely, so not worth it.
  - `medium` `patch (fixed)` Blind: no SendTab test that the warning reads the sending wallet's own list — send-address-book.test.tsx:62 mocks useAddressBook as () => addressBook and ignores the id; the spec asks for a fail-first same-pair-two-wallets case. Store-level tests exist but a wrong id at SendTab.tsx:70 would pass. Fix: key the mock on the id and add the two-wallet test. Fixed: the useAddressBook mock in send-address-book.test.tsx returns a per-wallet record keyed by the id it is called with; a new test saves the same pair only under another wallet, still sees the first-send warning, and asserts the hook is called with 'w1'.
  - `low` `patch (fixed)` Blind: test mocks still carry the old array shape — send-address-book.test.tsx:61 puts an array under the useAppStore selector's addressBook. Harmless today because SendTab no longer reads it. Direct correction, done with the SendTab test patch. Fixed: the useAppStore mock in send-address-book.test.tsx now holds {} under addressBook.
  - `low` `patch (fixed)` Blind: test title says 'including a view of the same Seed' but no wallet shares a seed — remove-wallet-data.test.ts:96 uses two unrelated wallets. Fix: give the second wallet seedId 'a' (or drop the phrase). Fixed: the second wallet in remove-wallet-data.test.ts is now a view of the removed wallet's Seed (seedId 'a'); the assertion that only a's list is gone is kept.
  - `low` `reject` Blind: chooser-reads-no-book test is a source grep — The spec allows 'source or render check'. It protects the stated rule; an ENOENT on rename would be loud, not silent. Not worth a rewrite.
  - `false` `reject` Blind: expanded state leaks across wallets — Main.tsx:21 renders WalletTab with key={wallet.id}, so the plate remounts per wallet and showAll resets.
  - `false` `reject` Blind: Remove dialog does not say the list is deleted; long label — The spec's Never list forbids changing the dialog bodies. ConfigPlate has overflow-wrap:anywhere, so a long label wraps.
  - `false` `reject` Blind: old book discarded silently, no notice — AD-48 and the spec say no migration and no error. Fix would add a notice the spec excludes; it would edit the spec.
  - `low` `defer` Blind: Address Book list has no storage cap — The old global book was equally unbounded, so this is not new. Recorded as deferred.
  - `low` `reject` Blind: hasOwnProperty repeated three times; heading casing — No named harm; three one-line checks. The spec fixes the title as 'Address Book'. Refactor not worth it.
  - `false` `reject` Blind: test hygiene (empty-state copy untested, legacyBlob name, duplicate test, file name) — The empty-state test exists at settings-address-book.test.tsx:228. The rest is naming only, with no harm named.
  - `false` `reject` Edge: send write after removeWalletData recreates the list — removeWalletData and setWallets run in one synchronous step after the last await, so no send write fits between them; a write before it is deleted, a write after it is ignored by the wallets check.
  - `low` `reject` Edge: orphan lists persist when removal skipped — Same as the Blind orphan row. Unlikely; the fix adds a guard.
  - `false` `reject` Edge: showAll leaks across wallets — Same as Blind: WalletTab is keyed by wallet.id in Main.tsx.
  - `false` `reject` Edge: long label overflows the Remove plate — ConfigPlate sets [overflow-wrap:anywhere] on the section, so the text wraps.
  - `medium` `patch (fixed)` Edge: SendTab mock ignores the walletId argument — Same root cause as the SendTab test gap above (one patch). Fixed: the useAddressBook mock in send-address-book.test.tsx returns a per-wallet record keyed by the id it is called with; a new test saves the same pair only under another wallet, still sees the first-send warning, and asserts the hook is called with 'w1'.
  - `false` `reject` Edge: wallet may be null at the write in SendTab — Line 297 returns when !wallet, and wallet is a const, so it is narrowed at line 450; tsc passes.
  - `false` `reject` Edge: duplicate import in app-store-migration.test.ts may fail lint — bun run lint passes; oxlint raised nothing.
  - `false` `reject` Edge: no docs/decisions.md hunk for the spec's docs task — decisions.md is modified (3 lines): the Address book row and the AppSettings mentions are reworded.
  - `medium` `patch (fixed)` Edge: no SendTab two-wallet warning test, controlled-wallet plate test or Remove-all test — The SendTab part is real and is the same patch. A controlled wallet uses the same id-keyed path as any wallet and Remove all is covered by the whole-slice reset test; neither adds a distinct behaviour, so only the SendTab test is patched. Fixed: the useAddressBook mock in send-address-book.test.tsx returns a per-wallet record keyed by the id it is called with; a new test saves the same pair only under another wallet, still sees the first-send warning, and asserts the hook is called with 'w1'.
  - `medium` `patch (fixed)` Verification gap: SendTab first-send warning not tested against the sending wallet's own list — Filed pre-verified; accepted. Same patch. Fixed: the useAddressBook mock in send-address-book.test.tsx returns a per-wallet record keyed by the id it is called with; a new test saves the same pair only under another wallet, still sees the first-send warning, and asserts the hook is called with 'w1'.
  - `low` `reject` Verification gap other: source-text regex does not protect behaviour — Same as the Blind source-grep row.
  - `medium` `patch (fixed)` Intent: SendTab cross-wallet warning only tested at store level — Same SendTab test patch. Fixed: the useAddressBook mock in send-address-book.test.tsx returns a per-wallet record keyed by the id it is called with; a new test saves the same pair only under another wallet, still sees the first-send warning, and asserts the hook is called with 'w1'.
  - `low` `reject` Intent: Wallet tab plate has no test of passing its own wallet id — WalletTab passes wallet.id directly (line 344) and Main keys by id; plate isolation is tested. Low risk.
  - `low` `reject` Intent: Remove all has no new populated multi-wallet assertion — Remove all is unchanged; the slice reset to {} is asserted in teardown.test.ts.
  - `low` `reject` Intent: leaveWallet path not tested against a real populated book — removeWalletData is tested with a populated book; the call site is unchanged.
  - `low` `reject` Intent: chooser check is a source regex — Same as the Blind source-grep row.
  - `low` `reject` Intent: no controlled-wallet specific test — Same per-id code path as every wallet; no distinct behaviour.
  - `low` `reject` Intent: no browser pass in the diff — A process item, not a code defect. The Verification section assigns the browser pass to the orchestrator.
  - groups: one patch group (SendTab-level two-wallet test, mock shape, test title), medium; one defer (storage cap).

## Design Notes

Resolved readings, none observably different: (1) "first 10" means the first 10 in stored order, which is send order. (2) "Show all N" expands in place; a "Show first 10" key collapses it. (3) The plate sentence is the only change to the Remove plate: for example "Remove {name} on {network} and its Address Book from this device." The key's text, aria-label and dialog bodies stay. (4) The `walletId` is the view's id (`WalletMeta.id`), so removing one view of a Seed removes only that view's book and a controlled Wallet has its own.

Selector shape: `const EMPTY: readonly AddressBookEntry[] = Object.freeze([])`; `s.addressBook[walletId] ?? EMPTY`, with `walletId` undefined giving `EMPTY`. A selector that returns a new `[]` each render makes zustand 5 re-render forever.

Removal with a failed keystore step still deletes the book; the scope already closes the session and data in that case, and fewer saved addresses only means more warnings, never fewer.

## Verification

**Commands:**
- `bun run lint` -- expected: clean
- `bun run build` -- expected: `tsc -b` and Vite pass
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Playwright MCP only, Devnet or Testnet only, nothing on Mainnet, nothing funded or signed: Wallet tab shows the Address Book plate after Name; with seeded entries (11+) the cap and "Show all N" work; `/settings` has none; removing a wallet shows the new plate wording. At 320, 390 and desktop widths, both themes, 200% zoom; no horizontal scroll; 44px keys on coarse pointers.

## Auto Run Result

### Summary

The Address Book now belongs to a Wallet. It is stored as `Record<walletId, entries>` in the same persisted slice. Send reads and writes only the sending wallet's list, so a payment from one wallet no longer silences another wallet's first-time-destination warning. The book is a plate in the Wallet tab after Name, with the first 10 entries and a "Show all N" key. `/settings` no longer shows it. Removing a wallet deletes its list, and the Remove plate says "Remove {name} on {network} and its Address Book from this device." An old array-shaped book on disk reads as empty and never throws.

### Files changed

- `src/store/app-store.ts` -- per-wallet map, `addAddressBookEntry(walletId, entry)` (ignores ids not in `wallets`), `removeAddressBook`, shared frozen empty array selector, safe merge of old or malformed data.
- `src/store/address-book.ts` -- header line about per-wallet storage; helpers unchanged.
- `src/pages/tabs/SendTab.tsx` -- reads and writes the sending wallet's own list.
- `src/components/wallet/AddressBookPlate.tsx` (new) -- the plate with rows, empty text, 10-entry cap and Show all toggle.
- `src/pages/tabs/WalletTab.tsx` -- plate added after Name; Remove plate wording names the wallet and its Address Book.
- `src/pages/AppSettings.tsx` -- Address book card and dead imports removed.
- `src/lib/teardown.ts` -- `removeWalletData` deletes the wallet's list, never throwing.
- `docs/decisions.md` -- live wording updated for the Address book row and the AppSettings mentions.
- Tests re-pointed or added: `src/__tests__/gate-migration.test.tsx`, `src/components/__tests__/chooser-settings.test.tsx`, `src/components/__tests__/configure-shell.test.tsx`, `src/lib/__tests__/remove-wallet-data.test.ts`, `src/lib/__tests__/teardown.test.ts`, `src/pages/__tests__/app-settings.test.tsx`, `src/pages/__tests__/seed-import-screens.test.tsx`, `src/pages/__tests__/unlock-hard-lock-reset.test.tsx`, `src/pages/tabs/__tests__/configure-remove.test.tsx`, `src/pages/tabs/__tests__/send-address-book.test.tsx`, `src/pages/tabs/__tests__/send-destination-error.test.tsx`, `src/pages/tabs/__tests__/send-pin-dialog.test.tsx`, `src/pages/tabs/__tests__/settings-address-book.test.tsx`, `src/pages/tabs/__tests__/settings-full-reset.test.tsx`, `src/store/__tests__/active-network.test.ts`, `src/store/__tests__/app-store-migration.test.ts`.

### Review findings

30 findings: high 0, medium 5, low 15, false 10, maybe-false 0. The 5 mediums were one root cause (no SendTab-level two-wallet test, mock ignoring the id) and were patched together, along with two low test-hygiene items. One low finding is deferred (no storage cap on the list; predates the story). All other findings were rejected with reasons recorded in the Review Triage Log. Because two or more mediums were patched, `followup_review_recommended` is true.

### Verification

- Gates passed: lint, build (`tsc -b` and Vite), test (1853 passed in 127 files, 0 skipped), check:contrast.
- Browser pass: a dev server on port 5232, stopped afterwards, with a fresh Playwright profile. Two local Testnet wallets were created with an App PIN, the second locked and the first opened. No Mainnet wallet was made, and nothing was funded or signed. The Address Book was seeded through the app-state store in IndexedDB: 14 entries for My Wallet (tags, a very long label, one entry with no network or tag recorded) and 2 for Second Wallet, one sharing an address with My Wallet's list.
- All story 23.2 criteria visible in the browser passed. Wallet tab plate order: This wallet, Account, Name, Address Book, Checks, Seed, Operating another account, Node, Two-device signing, Remove. Empty book shows "No saved addresses yet" and the explanatory sentence. With 14 entries: 10 rows and "Show all 14" (aria-expanded false); pressing it shows 14 rows and "Show first 10" (aria-expanded true), and focus stays on the key. Second Wallet showed only its own 2 entries, with no Show all key. Entries with no recorded network or tag read "Not recorded". The Settings screen has no Address Book and the chooser shows no book. The Remove plate reads "Remove My Wallet on Testnet and its Address Book from this device." and the confirm dialog text is unchanged. After removing Second Wallet, the store held only My Wallet's list (14 entries) and the other key was gone.
- Widths 320, 390, 1280 and 640 at 200% zoom, in dark and light finish: no horizontal scroll (scrollWidth equalled clientWidth), no clipping, long label and addresses wrapped. The plate has no sticky-footer primary action; no step flow or Back/Next exists on this screen, so the focus and lost-answer checks apply only to the Show all toggle, which was fine.
- Screenshots: `/tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/c4ce42c4-8ea1-4e40-a6c7-c1d935b46f31/scratchpad/e23/shots-2/` (relied on: 320-dark-collapsed, 320-dark-expanded, 320-light-expanded, 1280-light, 640-zoom2-dark, 390-dark, 390-settings-dark, 390-unlock). Leftover copies are in `/home/otavio/xxx/xrpl-wallet/.playwright-mcp/`.
- Audit: 17/20 (Good). It was a static read of the diff against PRODUCT.md and DESIGN.md; the Impeccable skill was not run. No P0 or P1.

### Residual risks (non-blocking P2/P3)

- P2 `AddressBookPlate` rows (`truncate={false}`): full 34-character addresses rely on ConfigPlate's `overflow-wrap:anywhere`. The plate is uncapped in height (up to 10 rows of about 5 lines), pushing Checks, Seed and Remove far down. The browser pass at 320px and 200% zoom found no overflow.
- P2 `AddressBookPlate` "Show all N" button: `h-auto min-h-8` with its own `pointer-coarse:min-h-11` override works around the Button primitive, where DESIGN.md puts responsive behaviour. Expanding gives no announcement of the new row count.
- P2 `src/components/wallet/RemoveAllPlate.tsx` (line 56) and `src/pages/Unlock.tsx` (line 226): reset warnings still describe one shared address book; they should say "each wallet's Address Book". Minor copy mismatch on irreversible-action text.
- P3 AddressLink explorer link is 20px tall with no coarse-pointer minimum (shared component, same as before the move).
- P3 "Show all N" key is 32px at a fine pointer; 44px only through the pointer-coarse rule, confirmed in compiled CSS but not on a touch device.
- P3 Every row shows a Network line even though the plate belongs to one wallet on one network; consider showing it only when it differs.
- P3 Empty-state copy does not say the list belongs to this wallet alone.
- P3 Rows use `panel-plate` nested inside the ConfigPlate (also a panel-plate); the old Settings card did the same.
- Deferred: the per-wallet list has no storage cap, only the display is capped.
