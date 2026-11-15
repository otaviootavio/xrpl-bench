---
title: 'Retire Operating another account and Two-device signing'
type: 'refactor'
created: '2026-11-15'
status: 'done'
baseline_commit: 'c70e07f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-offline-signing/product-prd-changes.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-offline-signing-2026-11-07/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Local settings still carries the FR-75 "Operating another account" plate (with "Let another wallet sign" and its screen) and the FR-78 "Two-device signing" plate (with its screen), which the Wallet kinds, the two routes, Signs for and the key plate replace; the keystore still resolves today's controlled views (`accountAddress`), and the product PRD still says "Planned change" where the feature has shipped (CAP-12, OS-FR-19).

**Approach:** Delete both plates, both task screens and their routes, the libraries only they use (`control.ts`, `master-key.ts`, `two-device.ts`, the two-device write helpers and the legacy QR forms), and the controlled-view machinery (`addControlledView`, the resolver's `accountAddress` fallback, the shared-record refusals). A stored controlled view is dropped, not converted (FR-95, OS-FR-19 "dropped, not migrated"). Old route segments land on the wallet shell. The product PRD's pointers read "Replaced by".

## Boundaries & Constraints

**Always:** No new user-visible words (removal only). Signs for (`WalletView.signsFor`, story 10) stays and is the one way a key signs for another Account. A record that holds a controlled view keeps its own Wallet working, listed and openable. Words still used by live screens stay pinned, as literals when their only source file is deleted. Every rule outside the removal (money, failed reads, fee cap, never-resubmit, the Transmit step) is unchanged.

**Never:** No migration or conversion of a controlled view into a Signs-for Wallet (it would sign for another Account without the user asking). No read-only listing of a controlled view (it needs words nobody approved). No dead screen at an old path. No change to the offline routes' payloads (`u`, `s`, `r`, `d` UR kinds).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Local settings, Online | any Online Wallet | no "Operating another account", no "Two-device signing" plate; Key state plate stays | — |
| Local settings, Offline / Transmitter | any | neither plate (as before) | — |
| Old segment `two-device` / `control` | `/wallets/:id/two-device` or `/control`, lock open, any kind | location replaced by `/wallets/:id`; the shell renders, nothing of the old screen | no such Wallet or lock closed: chooser (`/`) |
| Record with a controlled view (forced) | Seed record K: own view + `{accountAddress: X}` view | only K's own Wallet listed; the controlled view is not listed, not openable, signs nothing | — |
| FR-93 after the drop | import K with Signs for X on the same Network, or set K's Signs for to X | allowed (the dropped view is not counted) | other duplicates: today's refusals |
| Kind change / Signs for on that record | K's own Wallet | no shared-record refusal; works as for any Wallet | — |
| Remove K's own Wallet | record with a dropped view | record, lock (and App PIN when last) removed; Remove dialog says the Seed goes | — |
| A write that remaps views | Signs for, kind change, setting, ledger seen, on that record | the dropped view is not written back (gone from storage) | — |
| Older build's QR code | `xrplbench:1:u:…` / `xrplbench:1:s:…` (FR-78's single-code form) | shipped "That code is from a version of XRPL Bench this one does not understand." | — |
| Unsigned code with no `ledger_index` | two-device's UR envelope | malformed, as before (story 9) | — |
| Regression | Offline-builds Payment on Testnet | validates end to end (two contexts) | — |

</frozen-after-approval>

## Code Map

- `src/pages/tabs/WalletTab.tsx` -- `ControlPlate`, Two-device plate, the shared branch of `SignsForPlate`.
- `src/pages/WalletScreens.tsx`, `src/lib/route.ts`, `src/components/AppShell.tsx` -- task screens and segments; retired segments canonicalised to the shell.
- `src/components/wallet/{TwoDeviceSign,ControlWalletScreen,ControlledNote}.tsx`, `src/lib/{two-device,control,master-key}.ts` -- deleted; `BalancesTab.tsx` drops `ControlledNote`.
- `src/lib/crypto/keystore.ts`, `db.ts` -- `viewsOf` drops `accountAddress` views; `addControlledView` and the shared-record refusals go.
- `src/lib/xrpl/writes.ts` -- `prepareUnsigned`, `submitSignedBlob`, `TWO_DEVICE_LEDGER_WINDOW` go.
- `src/lib/qr-codec.ts` -- legacy single-code form and `decodeUnsigned` go; `encodeUnsigned` needs `ledgerIndex`.
- `src/lib/remove-copy.ts`, `kind-change-words.ts`, `ChangeKindScreens.tsx` -- sibling and shared-record words go.
- `src/lib/__tests__/offline-round-words.test.ts` -- four shipped words re-pinned as literals.
- PRD, `docs/decisions.md` §15.1–15.3, `docs/agents/keys-and-secrets.md`, `docs/glossary.md`, `PRODUCT.md`, `CLAUDE.md`, `deferred-work.md`.

## Tasks & Acceptance

**Execution:**
- [x] screens, plates, routes, libraries removed; old segments land on the shell
- [x] keystore drops controlled views; refusals and words that only they reached removed
- [x] codec legacy form removed; older build's code answered as unknown version
- [x] tests for every matrix row; removed suites deleted; words re-pinned
- [x] PRD pointers, docs, CLAUDE.md, deferred entries
- [x] gates; browser pass

**Acceptance Criteria:**
- Given an Online, an Offline and a Transmitter Wallet, when Local settings opens, then neither removed plate shows.
- Given a record with a controlled view, when the app lists Wallets, then only the own Wallet shows and it works as any Wallet.
- Given the gates, all four are green.

## Implementation Notes

- Commits: `2527507` (removal, tests, docs), then a fix found by the browser pass (below) with this record.
- **Deleted:** `lib/control.ts`, `lib/master-key.ts`, `lib/two-device.ts`, `TwoDeviceSign.tsx`, `ControlWalletScreen.tsx`, `ControlledNote.tsx` (also off Balances) and their six test files; `WalletTab`'s FR-75 plate and Two-device plate; `writes.ts` `prepareUnsigned`, `submitSignedBlob`, `TWO_DEVICE_LEDGER_WINDOW`, `validatedLedgerIndex` (only two-device used them; `signPrepared` stays, its test kept); `keystore.addControlledView`; the `shared-record` refusals of the kind changes and `setSignsFor`; `SignsForPlate`'s read-only branch; `KindPlate`'s shared-seed reason (`SHARED_SEED_NO_CHANGE`); `remove-copy`'s `sibling` body (`REMOVE_SIBLING`).
- **FR-95 decision (controlled views):** dropped, not converted. `keystore.viewsOf` leaves out a view with `accountAddress`, and every reader goes through it: not listed, not opened (`findSeedRecord` cannot find it), signs nothing, not counted by FR-93 (`hasView`, `hasOtherView`), and a write that rewrites the views (`views: viewsOf(current).map(...)`: Signs for, kind change, node, setting, ledger seen) does not write it back. A write that does not rewrite views (rename) leaves it stored, invisible. Removing the record's own Wallet deletes the record and its lock: the dropped view keeps no Seed on the device. A record holding only dropped views (an older build's sibling Remove could leave one) lists no Wallet and is **never deleted automatically** (review round one): its Seed may be the only key of an Account whose master key is off. It stays, with its lock and the App PIN, until Remove all. Removing the last listed Wallet then returns today's not-emptied / PIN-kept outcome, and the dialog says the Seed sentence (`sole`), not "last wallet" (`holdsUnlistedSeedRecords`, read when the plate mounts and again at confirm, which refuses with today's "changed" words if it moved). Such a record is residue (`appPinResidue`), so first run offers Remove all even with no App PIN. Its name does not count against new names or renames, the passkey re-derive rule does not count it (a re-derived Wallet is a new record beside it), and `setLockAutoLock` skips it. `accountOfView` is now `signsFor ?? record.address`. `WalletView.accountAddress` stays as a type field only so the drop can tell it apart; `db.assertOneOwnView` still ignores it, so a legacy record stays writable.
- **Old routes:** `parseRoute` reads `two-device` and `control` as the Wallet itself; `AppShell` replaces any shell path that is not `/wallets/:id` with it (`resetToWalletShell`); an absent Wallet or closed lock goes to `/` as before. The effect depends on `route`, so an in-app move to such a path while the shell already shows is caught (the browser pass found the first version missed it: the URL stayed while the shell showed; fixed and tested).
- **QR codec:** `decodeUnsigned`, `UnsignedPayload`, the base64url reader and the legacy branch of `payloadKindOf` go; `encodeUnsigned` needs `ledgerIndex`. The UR kinds `u`, `s`, `r`, `d` are unchanged. A text starting `xrplbench:` (every build before story 13, so every shipped build's two-device codes) is answered `unknown-version`, the shipped "That code is from a version of XRPL Bench this one does not understand.", at the Transmit step (it used to be read, or P-36 for an unsigned one); on the Offline Sign and Data screens it reads P-17's malformed reason, as two-device's code already did there. The scan session still hands such a text up, so the screen says why instead of ignoring it. `qr-transport.test.ts`'s plan sizes re-measured with the `ledger_index` every Unsigned Transaction carries (four still codes one QR version larger).
- **Words:** none added. Four shipped strings whose only source file was deleted are pinned as literals (`belowReserve`, `noKeysToChange`, `noMasterKeySetting`, "Regular Key address").
- **Docs:** product PRD pointers "Replaced by" for every row of `product-prd-changes.md` (also FR-91, FR-93 same-address, FR-94, FR-95, FR-86's sibling note), glossary "Controlling Wallet" and §6.2 to the feature PRD, `updated` bumped; `decisions.md` §15.1–15.3 a retired line each; `keys-and-secrets.md` three bullets; `docs/glossary.md`; `PRODUCT.md`; CLAUDE.md row. Deferred entries settled (story 8, 10, 11 removal lists) and two added.

## Review Triage Log

Round one (coordinator review, 2026-11-15). Smallest change each; only the edited files' tests run.

| # | Finding | Verdict | Fix |
|---|---|---|---|
| 1 | A record of dropped views only was deleted when the last listed Wallet went: its Seed may be an Account's only key | real | `deleteUnlistedSeedRecords` removed; `deviceHoldsWallets` counts every stored record again (not emptied, PIN kept); `removeBodyFor(…, holdsUnlisted)` says `sole`, not `last`; Design Notes corrected. Tests (`create-stored-wallet`, `remove-copy`, `configure-remove`) |
| 2 | A device whose only Seed records are unlisted, with no App PIN, never offered Remove all | real | `appPinResidue` counts such a record. Test |
| 3 | A failed record delete during Remove still reported success and discarded locks and PIN | moot | the automatic delete is gone (finding 1); the own-record delete still throws, so `confirmRemoveWallet` reports `REMOVE_FAILED` and nothing is discarded, as before |
| 4 | Unlisted records' names blocked a rename and changed a new Wallet's name | real | `allRecordLabels` counts listed records only. Test |
| 5 | Re-deriving a passkey Seed whose only record is unlisted was refused | real | the `taken` rule counts listed records only; the old record stays beside the new one until Remove all |
| 6 | `setLockAutoLock` could pick an unlisted record (`viewsOf(first)[0]` undefined) | real | records filtered to listed ones. Test |
| 7 | decisions §15.3 named only the Transmit answer | real | now says the offline screens answer P-17's malformed reason |
| 8 | The scan session and the codec tested the old form differently | real | one `isOlderBuildCode` (any case, whitespace stripped), used by both |
| 9 | Address book entries of dropped view ids stay stored | deferred | not secret; `deferred-work.md` |

## Design Notes

- **Why drop and not list read-only:** a read-only listing needs a state line nobody approved, and EXPERIENCE says "A Wallet that operates another account today loses the plate, and nothing replaces it in place"; the feature PRD says "dropped, not migrated". Converting it to a Signs-for Wallet would make a key sign for another Account without the user asking. When a listed Wallet holds the key, the user re-creates it with Signs for (the plate on that Wallet, or an import with the optional step), which FR-93 now allows. When no listed Wallet holds it (a record of dropped views only), the Seed stays stored, unreachable from the screens, until Remove all; the owner may want a recovery path later (deferred: needs words).
- **Owner's eye:** an Online Signs-for Wallet's Balances no longer show FR-75's "Controlled / Not controlled" note (the Key state plate shows the Regular Key); deferred entry added. Other Controlling Wallet mentions in the product PRD (glossary "Account Master Key", FR-71, §6.2 rotation, §10) have no pointer; deferred entry added.
- **Unapproved words needed:** none.

## Verification

**Gates (2026-11-15, after both fixes):** `bun run lint` · `bun run build` · `bun run test` (175 files, 2752 tests) · `bun run check:contrast`: all green.

**Browser pass (2026-11-15).** `bun run dev -- --port 5312 --strictPort`; `.playwright-mcp/s12-run.js` (code at `2527507`) and `.playwright-mcp/s12-routes.js` (with the AppShell fix) through the Playwright MCP: headless Chromium, fresh contexts O (offline device) and T (online device), CDP virtual authenticators, Testnet only; payloads moved by decoding plate QR pixels (jsQR) and pasting. Throwaway accounts from `.playwright-mcp/s12-fund.mjs`: X `raHYdkQSrCpvqmwM4t1hRC8Bn66xeZmnLo` (funded, Offline "Cold" on O), C `r9zQwfVYWU4oZiYeHrm4PpUp3VV53sMU6G` (funded), K `rLXKBdfV7F2QY1deYmSmskhtWCTFJ1yXaP` (Online "Hot" on T, unfunded). **Forced state (named):** a view `{walletId: 'legacy-controlled', network: 'testnet', accountAddress: X}` appended to Hot's IndexedDB record, as a build before story 12 wrote it.

| Criterion | Result |
|---|---|
| Local settings per kind shows neither removed plate | Met. Offline: This wallet, Wallet kind, Name, Address Book, Checks, Seed, Signs for, Remove. Transmitter: … Sync to an address, …, Node, Before sending, Remove. Online: … Signs for, Key state, Node, Before sending, Remove. No "Operating another account", "Two-device signing" or "Let another wallet sign" on any. |
| Old routes reset | Met on the second run: `/wallets/:id/two-device` and `/control`, reached in-app (pushState + popstate; a boot rewrites any path to `/`), become `/wallets/:id` with the shell for Online, Transmitter and Offline; `/wallets/nobody/two-device` becomes `/`; no Back to Wallet screen. The first run showed the shell but kept the old path: fixed (`route` in the AppShell effect), unit-tested, re-run. |
| Forced controlled view | Met: after reload the chooser shows two cards (Carrier, Hot), no third; `/wallets/legacy-controlled` goes to `/`; Hot opens, its Signs for plate has the field and Set it; Set it to X succeeds (FR-93 does not count the dropped view, no shared-record refusal) and the record then holds only Hot's view (`signsFor: X`). Removed again; dropped view put back; Remove says "This app will no longer hold the encrypted seed for this wallet." and the record and its lock record are gone. |
| Record holding only a controlled view (forced: Keyholder's record views replaced by one `accountAddress` view; Listed is the one listed Wallet) | Met on `e44d328` (`.playwright-mcp/s12-unlisted.js`, fresh context, 390 light and dark): chooser lists Listed only; Remove shows the Seed sentence ("This app will no longer hold the encrypted seed for this wallet." + backup line), not "last wallet"; after it Keyholder's record, its lock record and the App PIN verifier are still stored; the app is at setup and offers "All wallets on this device" with "Remove all wallets from this device"; Erase everything leaves the vault empty (no Seed record, no lock, no PIN). Seen, existing words: that plate says "An App PIN … left over from a wallet that was removed" and "No wallet is stored here.", which is loose when the residue is an unlisted Seed record (owner's eye; no new words added). Opened `r3-first-run-dark`. |
| Older build's code | Met: `xrplbench:1:s:…` on Transmit shows "That code is from a version of XRPL Bench this one does not understand.", no Send. |
| Regression: Offline-builds Payment | Met: 1 XRP X → C, **VALIDATED `0D2DEBDD175D31301D375313880588D231BF8525C6A25309688BC4B05CA0590C`**. O opened 0 ledger sockets. |
| Widths/themes | 320 dark, 390 light, 1280 light and dark for each kind's Local settings, the Transmit refusal and the forced chooser: no side scroll, 0 elements past the viewport. 200% at 320 for Online Local settings: 0 past the viewport (the story adds no layout; removal only). |

Screenshots in the session scratchpad `s12/`; opened: `online-local-settings-1280-dark`, `forced-chooser-390-light`, `regression-payment-validated`, `transmit-older-code-320-dark`, `online-local-settings-320-zoom200` (the full-page capture at 200% shows only the shell; the plates scroll inside it). The dev server was stopped.
