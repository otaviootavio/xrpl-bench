---
title: 'A saved address carries its destination tag — identity is the (address, tag) pair'
type: 'fix'
created: '2026-10-04'
status: 'done'
route: 'unattended'
review_loop_iteration: 1
baseline_commit: '689ef5d'
context:
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/ui-and-design-system.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

## Intent

**Problem (G-18, stories 9.1 and 9.2, AD-6).** An Address Book entry was
`{ address, label }`, deduped on the address alone. One exchange deposit address
serves many customers, each with their own destination tag. Under the old
identity:

- saving a second account at the same exchange overwrote the first;
- FR-21's "you haven't sent here before" stayed silent when a known address was
  used with a **new** tag (or with no tag), because it compared addresses;
- every send wrote a label fabricated from the address
  (`destination.slice(0, 8)`), and Settings showed it as a name beside the same
  address in full;
- Settings keyed rows on `e.address`, so two entries at one address would have
  shared a React key.

**Approach.** One module beside the store, `src/store/address-book.ts`, owns
the entity and its identity:

- `AddressBookEntry { address; destinationTag?: string; label?: string }`.
  The tag is canonical decimal text, never a number.
- `sameCounterparty(a, b)` and `counterpartyKey(e)` are the one answer to "is
  this the same counterparty?". "No tag" equals only "no tag". `"0"` is a real
  tag.
- `canonicalDestinationTag(raw)` strips leading zeros as text, so `"007"` and
  `"7"` are one identity. They are one UInt32 on the ledger.
- `upsertAddressBookEntry` replaces the same pair and appends a new one. It
  keeps an existing human label when the incoming entry has none.
- `migrateAddressBook(raw)` reads any earlier shape and never throws.

The app store normalises the Address Book in `persist`'s `merge`, on every hydration. It deliberately does not bump `version`; see Decision 8.
Send decides the warning on the pair and writes the pair it actually signed,
with no label. Settings renders one row per pair.

## Boundaries & Constraints

**Always:**
- The tag is a string or `undefined`. Nothing canonicalises it through `Number`.
- The first-send warning only ever *adds* a confirmation. Nothing in this change
  can silence it for a pair that was never paid.
- The merge returns every persisted field, and it is total over `unknown`.
  zustand leaves a store on its in-memory defaults when hydration throws, and
  the next `set()` would then write empty wallets and an empty book over
  storage.
- The persisted `version` stays 0. Every earlier build reads version 0 and has
  no `migrate`, so moving it would make a rollback wipe the slice (Decision 8).

**Never (held):**
- No call site compares an Address Book entry's `.address` to decide identity.
  A source scan in `store/__tests__/address-book.test.ts` pins this.
- Nothing makes the list look curatable: no add, edit or delete controls. The
  empty-state copy ("saved here automatically") is unchanged and still accurate.
- Nothing outside this epic was repaired (rule 5). The two things found are
  recorded in `deferred-work.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Pinned by |
|---|---|---|---|
| Second tag at a known address | book `[A#1]`, send to `A#2` | warning "You haven't sent with destination tag 2 before"; after a validated send, the book is `[A#1, A#2]` | send-address-book, address-book |
| Same pair | book `[A#7]`, tag typed `007` | no warning, no write | send-address-book |
| Tagged address, now tagless | book `[A#1]`, no tag | warning "…without a destination tag before", body "only with a destination tag" | send-address-book |
| Tagless address, now tagged | book `[A]`, tag 5 | warning (absence is not a wildcard) | send-address-book, address-book |
| Never-seen address | book `[]` | original "You haven't sent here before" + "character by character" | send-address-book |
| Write after send | tag field `0042` | entry `{ address, destinationTag: '42' }`, no `label` key | send-address-book, address-book |
| Tag `0` vs none | `A#0`, `A` | two identities, two keys | address-book |
| Old persisted shape | v0 blob `[{address, label: address.slice(0,8)}]` | `[{ address }]`; wallets, network, auto-lock, declined versions intact; still stored as version 0 after the next write | app-store-migration |
| Old human label | v0 `{address, label: 'Landlord'}` | label kept | address-book; browser |
| What this build wrote | `[A#1, A, B 'Landlord']` stored | read back unchanged (idempotent) | app-store-migration |
| Nothing stored | no blob | in-memory book untouched | app-store-migration |
| Garbage book | `addressBook: 'not-an-array'` | `[]`, wallets intact, no throw | app-store-migration, address-book |
| Entry without an address | `{ label }`, `{ address: 12 }`, `null` | dropped (the only drop) | address-book |
| Two rows at one address | Settings with `A#1, A#2, A` | three rows, no duplicate-key warning | settings-address-book |
| Row without label | Settings with `A` | address once, in full; no `A.slice(0,8)`, no "Label" legend | settings-address-book |

## Code Map

- `src/store/address-book.ts` — **new.** Entity type, `canonicalDestinationTag`, `counterpartyKey`, `sameCounterparty`, `upsertAddressBookEntry`, `migrateAddressBook`, `addressKnownUnderOtherTag`. The last one chooses the warning's words only; it is not an identity test.
- `src/store/app-store.ts` — `addressBook: AddressBookEntry[]`. `addAddressBookEntry(entry)` goes through the upsert. `mergePersistedAppState` is wired into `persist` as `merge`; `version` is unchanged (0).
- `src/pages/tabs/SendTab.tsx` — `counterparty = { address, destinationTag: canonicalDestinationTag(destTag) }`. `isKnownDestination` uses `sameCounterparty`. The write is `addAddressBookEntry(counterparty)`, with no label. The warning has tag-specific copy when the address is known under another tag.
- `src/pages/tabs/SettingsTab.tsx` — each row is a `dl` keyed by `counterpartyKey(e)`:
  - Label, only if one exists;
  - Address, through `AddressLink truncate={false}`;
  - Destination tag, only if one exists, with a `panel-legend` text legend.
- Tests:
  - new: `src/store/__tests__/address-book.test.ts`, `src/store/__tests__/app-store-migration.test.ts`, `src/pages/tabs/__tests__/send-address-book.test.tsx`, `src/pages/tabs/__tests__/settings-address-book.test.tsx`;
  - updated: three callers of the changed `addAddressBookEntry` signature (`teardown.test.ts`, `settings-full-reset.test.tsx`, `unlock-hard-lock-reset.test.tsx`).

## Tasks & Acceptance

**Story 9.1**
- [x] **Given** the entry type at `store/app-store.ts:13`, **when** this is done, **then** the entry carries an optional tag, stored as a string or `undefined`, never through a number. *(`AddressBookEntry`; `canonicalDestinationTag` keeps `9007199254740993` as written.)*
- [x] **Given** `addAddressBookEntry`, **when** two entries share an address and differ by tag, **then** both are kept, and the same pair replaces rather than duplicates.
- [x] **Given** AD-6, **then** one exported function answers "same counterparty?" (`sameCounterparty`, with `counterpartyKey` as its key form), and no call site compares `.address` to decide identity. *(Source scan, mutation-checked.)*
- [x] **Given** a tagless and a tagged entry for one address, **then** they are two counterparties.
- [x] **Given** a persisted v0 store, **when** the app loads, **then** entries read as tagless and none is lost. *(Real rehydration test, plus the browser migration below.)*

**Story 9.2**
- [x] **Given** FR-21's test at `SendTab.tsx`, **when** sending to a known address with a never-used tag, **then** the warning fires, decided by `sameCounterparty`.
- [x] **Given** the write on every validated send, **then** it records the tag actually signed and no fabricated label.
- [x] **Given** a row with no human label, **then** the address renders once through `AddressLink`, plus the tag when there is one, and no truncated address renders as a name.
- [x] **Given** two entries at one address, **then** React keys are unique and come from `counterpartyKey`.
- [x] **Given** the empty-state copy, **then** it is still accurate, and nothing makes the list look curatable.
- [x] **Given** 320 px and 200% zoom, **then** address and tag stay readable without overflow, and the tag is told apart by its "Destination tag" legend, not by colour. *(320 measured; 200% zoom approximated, see Verification.)*

## Decisions (made unattended, for Otavio to check)

1. **Migration drops the fabricated labels.** A v0 label exactly equal to `address.slice(0, 8)` is removed, because that is what the old Send screen wrote on every send. Any other label is kept. Without this, every existing row would go on showing a truncated address as a name, which is the thing 9.2 forbids.
2. **The tag is canonicalised as text.** Leading zeros are stripped, so `007` and `7` are one counterparty. The ledger's tag is a UInt32, so they are the same payment target. `"0"` stays a real tag, distinct from no tag.
3. **The warning's words change when the address is known under another tag.** "Double-check the address character by character" points the operator at the part that is already familiar. Instead:
   - with a new tag: **"You haven't sent with destination tag N before"** / "You have paid this address before, but not with this destination tag. Check the tag against what the recipient gave you before continuing.";
   - with no tag: **"You haven't sent here without a destination tag before"** / "You have paid this address before, but only with a destination tag. Check whether the recipient needs one before continuing."

   A never-seen address keeps the original copy unchanged.
4. **Settings shows the address in full** (`truncate={false}`, wrapping with `break-all`), not middle-truncated. The row's job is to be checked character by character, and it is the only text in the row besides the tag.
5. **Row layout is a labelled `dl`** ("Label", "Address", "Destination tag" legends), reusing History's `panel-legend` dt/dd vocabulary. A row with no human label simply has no Label line.
6. **The identity module lives in `src/store/`**, beside the store that persists the entity. AD-6 names the store as the source of truth for persisted entity identity.
7. **Entries that name no address are dropped by the migration.** Such an entry is not an object, or has no non-empty string `address`. It could not be shown or sent to. Every entry with an address is kept. A malformed tag on such an entry reads as tagless (this app never wrote one), and two entries that become one pair collapse into one.
8. **The migration runs in `merge`, and the persisted version stays 0.** A version bump with `migrate` would make a rollback of `prod` past this commit destructive. Every earlier build is version 0 with no `migrate`. zustand hydrates nothing from a stored version it does not expect, and its next write puts defaults over storage. That would erase the Address Book, the network, the auto-lock setting and the declined updates. The wallets would survive, because `App.tsx` rebuilds them from the keystore. Normalising on read is idempotent and keeps the stored shape readable by an older build, which simply ignores the tag. The cost is that a fabricated label stays on disk until the next write, which happens at once (unlock writes), and it is stripped on every read before that.
9. **A pre-Epic-9 entry reads as tagless, so it silences the warning for a later tagless send to that address.** This is what 9.1's AC asks ("read as tagless"), and Verification row H records it. The cost: before this epic a send to `(EXCHANGE, tag 5)` stored only `{ address: EXCHANGE }`, which migrates to `(EXCHANGE, no tag)`. If the operator later pays EXCHANGE and forgets the tag, the pair is known and no warning shows. Forgetting the tag on an exchange deposit is how funds get lost, and the destination's `RequireDest` flag is the only remaining guard; not every exchange sets it. The alternative is to mark migrated entries "tag unknown": they would match no pair (always warn) but still pick the "you have paid this address before" wording. That changes the persisted shape and the AC, so it was not done here. Raised at PR #41 review; for Otavio to choose.

## Self-review triage

| # | Finding | Verdict |
|---|---|---|
| 1 | A throwing migration would leave defaults in memory and let the next `set()` erase storage | Real by design; prevented. The merge is total and tested on garbage input, and a mutation that throws on garbage fails 2 tests |
| 2 | A migration returning only `addressBook` would drop wallets | Prevented. It spreads the slice, and a test asserts every other field after rehydration |
| 3 | The first build used `version: 1` + `migrate`, which makes a rollback wipe the persisted slice | Real, found at the pre-PR review. Reworked to a merge-time migration at version 0 (Decision 8), pinned by a test that the stored version stays 0 |
| 4 | The written entry could hold a tag different from the one signed | Checked. The tag field strips non-digits, so `Number(destTag)` and the canonical text name the same integer; a test asserts `destinationTag: 42` submitted and `'42'` written for input `0042` |
| 5 | An invalid (out-of-range) tag could be compared or written | Not reachable. `tagValid` closes `canSend`, and the write follows a validated send only |
| 6 | Upsert could erase a human label on the automatic save | Prevented and pinned (no labels can be given today) |
| 7 | The `.address` scan is a heuristic | Accepted. It matches the defect's own shape (an array method on `addressBook` whose callback compares its entry's `.address`), self-tests that shape, and was mutation-checked against the original line |
| 8 | Address Book is not network-scoped | Real, outside Epic 9. Recorded in `deferred-work.md`, not fixed (rule 5) |
| 9 | The tagless-case description first read "not with this destination tag" when there was no tag | Real, found in the browser pass. Fixed, re-verified in round 2, and pinned |

## Verification

**Commands.** `bun run lint && bun run build && bun run test && bun run
check:contrast` all exit 0: 48 files, 581 tests.

**Mutation checks.** Each mutation was applied by this session, the four new
suites were run, and the mutation was reverted.

| Mutation | Result |
|---|---|
| Settings keys rows on `e.address` | 1 fails (duplicate-key warning) |
| Send decides identity with `e.address === destination` | 5 fail (incl. the source scan) |
| Send writes `label: destination.slice(0, 8)` | 2 fail |
| Send writes `{ address }`, dropping the tag | 2 fail |
| `counterpartyKey` ignores the tag | 13 fail |
| Tagless key collides with tag `0` | 1 fails |
| Canonicalise through `String(Number(raw))` | 1 fails |
| No canonicalisation | 5 fail |
| `merge` removed from `persist` (merge-based build) | 4 fail |
| `version: 1` + pass-through `migrate` added (rollback hazard) | 1 fails |
| Nothing stored wipes the in-memory book | 1 fails |
| Migration keeps the fabricated label | 5 fail |
| Upsert erases an existing label | 1 fails |
| Settings invents a label from the address | 1 fails |
| Migration throws on a non-array book | 2 fail |
| Tag-specific warning copy removed | 3 fail |
| Tagless description reverted to "not with this destination tag" | 1 fails |

**Browser pass, 2026-10-04: RUN.**
- Build: commit `7bec05f` (`fix/epic-9-address-tags` on `dev` `689ef5d`), served by `bun run dev --port 5174`. Its `src/` is byte-identical to the pushed head; only this spec, the gap register and the commit message changed after the run. An earlier run on the pre-merge build (version-1 migration, module still in `src/lib/`) found triage #9. Everything below is from the re-run on `7bec05f`.
- Driver: Playwright Chromium 1148, with a CDP virtual authenticator (ctap2, internal, resident key, UV, PRF).
- Network: Testnet.
- Contexts: two fresh isolated contexts, each with a new throwaway wallet funded from the in-app faucet. No existing wallet was touched.
- Store contents were read from, and for the migration written to, the app's own IndexedDB key inside that throwaway context.

| Step | Exercised | Result |
|---|---|---|
| A | first send to genesis `rHb9…`, tag 1 | "You haven't sent here before" — met |
| B | same pair again | no warning — met |
| C | tag 2 | "You haven't sent with destination tag 2 before" — met |
| D | no tag | "…without a destination tag before" — met; its body copy was wrong, fixed (triage #9) |
| E | tag typed `007` (first time for 7) | warning names "destination tag 7" — met |
| F | tag 7 | no warning: `007` and `7` are one identity — met |
| Store after A–F | — | version 0, `[A#1, A#2, A, A#7]`; no labels — met |
| Settings | 390/320/1280 in light and dark, and 640 light | 4 rows; card, row and document overflow all 0; no row outside the viewport — met |
| Migration | blob rewritten to v0 with `{genesis, label "rHb9CJAW"}`, `{rPT1…, label "rPT1Sjq2"}`, `{ACCOUNT_ONE, label "Landlord"}`, then reload + PIN unlock | still version 0; wallets 1; active wallet unchanged; book `[genesis, rPT1…, ACCOUNT_ONE "Landlord"]`; balance shown; Settings 390 light / 320 dark show 3 rows, no fabricated label, "Landlord" kept — met |
| G | after migration, migrated tagless genesis, tag 9 | tag-specific warning — met |
| H | after migration, migrated tagless genesis, no tag | no warning (the migrated entry is that pair) — met |
| Round 2 (second fresh context) | book seeded `[genesis#1]`, review with no tag, 390 light and 320 dark (no send) | body "only with a destination tag" — met |

**Screenshots.** They are held in this session's scratchpad, not committed.
Each one cited here was opened and judged.
- Final run on `7bec05f` (`e9-final/`):
  - confirm dialogs D (the tagless copy, "only with a destination tag"), E (warning names "destination tag 7") and H (no warning);
  - Settings at 1280 dark and 320 light: four rows, each tag under its "Destination tag" legend, the address wrapping inside its plate at 320;
  - Settings migrated at 320 dark: three rows, "Landlord" kept, no truncated name.
- First run on the pre-merge build (`e9-shots/`). The UI code was identical except for the tagless body copy, which that run found wrong:
  - confirm dialogs A, B and C;
  - Settings at 320 dark, 390 dark, 640 light and 1280 light;
  - Settings migrated at 390 light;
  - History at 1280 light (six validated 1 XRP sends);
  - round 2 at 320 dark.
- The other final-run captures were measured by script but not opened, so they are not cited.

**Gaps, stated plainly:**
- **200% zoom was approximated**, not exercised. 1280 at 200% is a 640 CSS-px viewport, which was measured and shot. Browser zoom itself was not driven.
- The tags were not inspected in History, because its rows were collapsed in the shot. The tag submitted is pinned by unit test (`destinationTag: 42`), and the submit path is unchanged.
- At 320 px the confirm dialog's content measures 5 px wider than its client box, with nothing visibly clipped. It was not compared against the baseline, and it is recorded in `deferred-work.md`.
- Only XRP sends were exercised in the browser. The token path shares the same `counterparty` and write line.
