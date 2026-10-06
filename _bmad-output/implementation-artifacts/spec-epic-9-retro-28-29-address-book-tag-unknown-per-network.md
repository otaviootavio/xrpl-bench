---
title: 'An unrecorded Address Book entry never silences the first-send warning, and the book is separated by network'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
baseline_commit: 'de0a9f1d682d833d5519d15992bf850059c2c4e8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-epic-9-address-tags.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 9 reads a pre-epic-9 entry `{ address, label }` as the tagless pair, so a tagless send to an exchange the operator once paid *with* a tag shows no first-send warning (retro F1). The book is not scoped to a network either, so a Testnet rehearsal silences the Mainnet warning (F2). `docs/decisions.md` §2 still describes the pre-epic-9 book (F3).

**Approach (Otavio, 2026-10-04, retro item 28):** an entry is recorded on a network. Identity becomes (network, address, tag). An entry with no recorded network (everything saved before this change) suppresses the warning on no network, stays visible in Settings, and is never dropped. An entry with no recorded network and no tag reads as "tag not recorded", never as tagless. Entries this build writes always carry their network and keep exact tag semantics. Fix §2 (item 29).

## Boundaries & Constraints

**Always:**
- Persisted `version` stays 0 (epic 9 Decision 8 honoured). A round trip through any older build can only turn an entry into an unrecorded one: more warnings, never fewer.
- The merge stays total over `unknown`; the migration drops only entries with no string address. A legacy entry never collapses into a recorded one, and entries on two networks never collapse into one.
- Identity stays in `src/store/address-book.ts` (AD-6). No call site compares `.address` to decide identity.
- Send writes the network it submitted on (same closure as the signed tag).
- The tag-specific "You have paid this address before…" wording is chosen only from recorded entries on the network being sent on.

**Never:** no new curation controls (add/edit/delete); no version bump; no automatic deletion of a legacy entry when its pair is re-recorded.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| Pre-epic-9 entry, tagless send | `[{A, label:'rHb9CJAW'}]`, testnet, no tag | warning; generic copy |
| Pre-epic-9 entry, tagged send | same, tag 5 | warning; generic copy |
| Recorded elsewhere | `[{A, network:mainnet}]`, testnet, no tag | warning; generic copy |
| Recorded here | `[{A, network:testnet}]`, testnet, no tag | no warning |
| Epic-9 entry with tag | `[{A, destinationTag:'1'}]` | kept as tag 1, network not recorded; warns for every pair |
| Re-record | legacy `{A}` + validated tagless testnet send | book `[{A}, {A, network:testnet}]` |
| Two networks | `{A,1,testnet}`, `{A,1,mainnet}` | two entries, two keys |
| Unknown network value | `{A, network:'devnet'}` | read as not recorded, kept |
| Settings legacy row | `{A}` | "Network: Not recorded", "Destination tag: Not recorded" |

</frozen-after-approval>

## Code Map

- `src/store/address-book.ts` -- entity + identity. Add `network?: NetworkId` (`@/lib/xrpl/networks`, type-only import). `counterpartyKey` gains network and tag-state tokens: tag `-` none, `?` not recorded (network absent and no tag); network `?` not recorded. `sameCounterparty` stays key equality. New `suppressesFirstSendWarning(book, pair)` / pair-recorded check: true only for an entry with a recorded network equal to the pair's. `addressKnownUnderOtherTag` filters to recorded entries on the pair's network. `migrateAddressBook` keeps `network` only if in `NETWORK_IDS`.
- `src/store/app-store.ts` -- no shape change beyond the type; `mergePersistedAppState` unchanged.
- `src/pages/tabs/SendTab.tsx:150-159,414` -- `counterparty` gains `network`; `isKnownDestination` via `sameCounterparty` on recorded entries (a query pair never matches a `?` key).
- `src/pages/tabs/SettingsTab.tsx:307-328` -- Network legend per row; "Not recorded" legends for legacy rows; `AddressLink` given the entry's network.
- `src/components/wallet/AddressLink.tsx:67` -- optional `network` prop, falling back to the store.
- `docs/decisions.md:25-26` -- §2 rows reconciled; point to AD-6.
- `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` AD-6 -- identity now includes network.
- Tests: the four epic-9 suites plus callers of `addAddressBookEntry`.

## Tasks & Acceptance

**Execution:**
- [x] `src/store/address-book.ts` -- network + tag-state identity, migration, wording helper -- F1/F2
- [x] `src/components/wallet/AddressLink.tsx` -- optional network -- explorer link of a Testnet row viewed on Mainnet
- [x] `src/pages/tabs/SendTab.tsx` -- write and test the triple
- [x] `src/pages/tabs/SettingsTab.tsx` -- legends
- [x] tests -- every matrix row, rollback shapes, version 0, mutation-checked
- [x] `docs/decisions.md`, AD-6, `sprint-status.yaml` items 28/29 done, close deferred epic-9 entry 1

**Acceptance Criteria:**
- Given any persisted shape any earlier build wrote, when the app loads, then every entry with an address is still listed in Settings and storage stays version 0.
- Given an entry recorded on Mainnet, when sending the same pair on Testnet, then the warning shows (and vice versa).

## Decisions (made unattended, for Otavio to check)

1. **"Not recorded" is decided by the missing network, not by a stored flag.** On disk a migrated pre-epic-9 `{A}` and an epic-9 tagless `{A}` are identical (epic 9's merge stripped the fabricated label). Both read "tag not recorded". Epic 9 is on `dev` only (not an ancestor of `stage` or `prod`), so only test devices hold epic-9 entries, and a network-less entry suppresses nothing anyway: the tag state changes words and display only.
2. **Version stays 0.** An older build ignores `network`; epic 9's migration rebuilds entries field by field and drops it, so a rollback-and-return leaves entries unrecorded (more warnings). Known rollback losses, both failing safe: epic 9's upsert merges `(A,1,testnet)` and `(A,1,mainnet)` into one entry; the pre-epic-9 build replaces every entry at an address with one `{A, label}` (retro F4).
3. **Re-recording appends; the legacy row stays.** "Never dropped" is taken literally. Settings may show `A (not recorded)` and `A (Testnet)` together.
4. **Settings lists every network's entries**, each with a "Network" legend, rather than filtering to the active network — nothing is hidden, and the row's explorer link uses its own network.
5. **Wording.** A legacy or other-network entry at the same address does not unlock "You have paid this address before…" (it might be false and is reassuring); the original "character by character" copy shows.
6. **An unknown network value** (e.g. a future `devnet`) reads as not recorded and is kept.
7. **AD-6's text is amended** to (network, address, tag); the module stays in `src/store/`.
8. **(Resume, review triage #1) The tag-specific words also stay off while any entry with no recorded network exists at the address**, even beside a recorded entry on this network. That unrecorded entry may be a payment on this network with exactly this tag or with none, so "but not with this destination tag" or "but only with a destination tag" could be false. The warning itself is unchanged; only its words fall back to the generic copy.
9. **(Resume) Rollback to `prod`, explicitly.** `prod` (pre-Epic-9) reads `addressBook` with no migration and keeps each entry object as stored, so nothing is dropped on read. Its own rules then apply: the first-send check compares addresses only, so any entry at an address, on any network, silences the warning there. That is `prod`'s behaviour today, not a regression this change introduces. Its Settings keys rows by address, so two entries at one address give a duplicate React key (cosmetic). Its next `addAddressBookEntry` for an address replaces every entry at that address with one `{ address, label }`, which is the known F4 loss. Coming back to this build, every such entry reads as unrecorded (more warnings).
10. **(Resume) A row with "Network: Not recorded" links to the active network's explorer.** That is the rule for every other address in the app. A recorded row on the other network links to that network's explorer, and `docs/decisions.md` §4 and `block-explorer-links.md` US-1 now name that exception.
11. **(Resume) Retro item 28's "add it to PR #41's record"** is done as a comment on PR #41 linking this PR, posted after this PR is opened. The retro file is a dated record and is not edited.

## Implementation Notes

- `counterpartyKey` is `network|address|tag`, with `?` for a network not recorded, and `?` (no network, no tag) or `-` (no tag) for the tag. `tagNotRecorded(e)` is the named predicate Settings reads.
- `suppressesFirstSendWarning(book, pair)` takes a `SendPair` whose `network` is required, and checks `e.network !== undefined && e.network === pair.network` before key equality. For a typed caller that guard is redundant with the key; it defends a caller that builds a pair from untyped data with no network (its key would equal a legacy entry's). Resume: a test now pins exactly that case, so the guard is no longer a surviving mutant.
- `addressKnownUnderOtherTag` now also takes a `SendPair` and counts only recorded entries on the pair's network (Decision 5).
- `migrateAddressBook` keeps `network` only when it is in `NETWORK_IDS` (value import of the `as const` list; `NetworkId` is imported as a type).
- Send's `counterparty` is `{ network, address, destinationTag }` from the same render closure `doSend` submits with; the write is unchanged otherwise.
- Settings: a "Network" legend on every row ("Mainnet" / "Testnet" / "Not recorded"); a "Destination tag: Not recorded" line for `tagNotRecorded` rows; a recorded tagless row still has no tag line (unchanged from Epic 9). `AddressLink` takes an optional `network` and falls back to the active one, so a legacy row links to the active network's explorer.
- `mergePersistedAppState` and the store shape are unchanged; callers of `addAddressBookEntry` in teardown/reset tests compile unchanged (the field is optional).

## Spec Change Log

## Review Triage Log

Resumed run, 2026-10-04: the unattended build had finished every task before a rate limit cut it off. Step 3 verified the existing diff against every task, AC and matrix row instead of re-implementing (one gap filled: the `suppressesFirstSendWarning` guard had no test; one added). Three review layers ran (blind, edge-case, verification-gap) on the diff from `de0a9f1`.

| # | Source | Finding | Verdict | Route / evidence |
|---|---|---|---|---|
| 1 | edge | Tagless send with a recorded tagged entry here plus a legacy entry at the address says "paid … only with a destination tag", which the legacy entry may contradict | low | patch: `addressKnownUnderOtherTag` returns false while any unrecorded entry exists at the address; store and Send tests added (Decision 8) |
| 2 | verification-gap (other) | `mergePersistedAppState` JSDoc (`app-store.ts`) still says a pre-epic-9 entry reads as tagless | low | patch: comment corrected |
| 3 | verification-gap | no gaps found | — | — |
| 4 | blind | deferred-work resolution cites a spec not in the diff | false | the spec is this file, untracked at review time and committed with the change |
| 5 | blind | item 28 marked done but "add it to PR #41's record" not done | low | patch: comment on PR #41 after this PR opens (Decision 11) |
| 6 | blind | `GAP-REGISTER.md` G-18 still describes the pair and "read as tagless" | low | patch: G-18 amended with the triple and the unrecorded rule |
| 7 | blind | the explorer-link exception is recorded only in a JSDoc; `decisions.md` §4 and US-1 say "active network" | low | patch: §4 and `block-explorer-links.md` US-1 name the exception |
| 8 | blind | a "Network: Not recorded" row links to the active network's explorer | low | reject: same rule as every other address; recorded as Decision 10 |
| 9 | blind | migration could tell pre-epic-9 entries apart by the fabricated label | false | the intent fixes "no network and no tag reads as not recorded"; Decision 1 shows on-disk epic-9 entries already lost that label |
| 10 | blind | legacy rows can never be removed; near-duplicate rows accumulate | low | reject: excluded by intent ("never … no new curation controls … no automatic deletion"); Decision 3 |
| 11 | blind | Settings interleaves networks; no visual check at 320 | low | reject the grouping (Decision 4); the visual check ran (Verification) |
| 12 | blind | `AddressLink` gained a third stacked doc block that orphans the others in hovers | low | patch: the `network` doc moved onto the prop |
| 13 | blind | `decisions.md` does not say why the persisted version stays 0 | low | patch: §2 Address book row says so, with the rollback consequence |
| 14 | blind | §2 "a known address with a new tag, or with no tag, is new" is ambiguous | low | patch: reworded |
| 15 | blind | two conditionals render the "Destination tag" legend in Settings | low | reject: mutually exclusive by definition, both pinned by tests; no named harm |
| 16 | blind | no test for a network switch between opening the dialog and confirming | false | `doSend` and `counterparty` come from one render closure, so the submit network and the written network cannot diverge; a switch re-renders both together |

## Verification

**Commands:** `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` -- all exit 0.

**Result (2026-10-04, unattended dev):** all four exit 0; 49 files, 663 tests.

**Mutation checks** (applied, the three address-book suites run, reverted):

| Mutation | Result |
|---|---|
| Key ignores network | 6 fail |
| Unrecorded tag keyed `-` (legacy reads as tagless) | 1 fails (key-token test) |
| Unrecorded network keyed as `testnet` | 3 fail |
| Wording helper ignores the network filter | 8 fail |
| Migration keeps any network string | 2 fail |
| Migration drops `network` | 4 fail |
| Upsert drops `network` | 5 fail |
| Send pair pinned to `testnet` | 3 fail |
| Settings link ignores the row's network | 1 fails |
| Settings drops the "tag Not recorded" line | 1 fails |
| Settings drops the Network legend value | 3 fail |
| `suppressesFirstSendWarning` without its recorded-network guard | survives (redundant with the key; see Implementation Notes) |

**Resume additions (mutation, applied with a script, the four suites run, reverted):**

| Mutation | Result |
|---|---|
| `suppressesFirstSendWarning` without its recorded-network guard | 1 fails (was surviving; new untyped-pair test) |
| guard without only the `!== undefined` half | 1 fails |
| `suppressesFirstSendWarning` address-only (the original defect) | 16 fail |
| legacy entries count as recorded for the address | 7 fail |
| Send's check replaced by an address-only test | 12 fail |
| `tagNotRecorded` always false | 3 fail |
| `AddressLink` ignores its `network` prop | 1 fails |
| Settings network legend shows one fixed network | 1 fails |
| wording helper counts legacy entries | 4 fail |
| wording helper drops the legacy-at-address check (triage #1) | 2 fail |
| that check ignores the address | 1 fails |

Every row in the original table above was re-run on the resumed tree before the review patches, with identical counts. After the triage #1 patch, "wording helper ignores the network filter" fails 4 tests rather than 8, because the new legacy-at-address check now answers some of those cases first. No mutant survives.

**Gates after the review patches:** lint, build, test (49 files, 666 tests), check:contrast, all exit 0.

**Browser pass, 2026-10-04: RUN.**
- Build: the working tree on `fix/address-book-tag-unknown-per-network` (base `de0a9f1`), with every review patch applied, served by `bun run dev -- --port 5178 --strictPort`. The committed `src/` is this tree.
- Driver: Playwright Chromium 1148 with a CDP virtual authenticator (ctap2, internal, resident key, UV, PRF). Two fresh isolated contexts, each with a new throwaway Testnet wallet (the first funded from the in-app faucet). No existing wallet was touched.
- Seed: written to the app's own IndexedDB key inside that throwaway context, version 0: `{genesis, label:'rHb9CJAW'}` (pre-epic-9, fabricated label), `{rPT1…, network:'mainnet'}`, `{rrrr…BZbvji, network:'devnet', destinationTag:'4'}`, `{rPT1…, label:'Landlord'}` (pre-epic-9, human label). Then reload and PIN unlock.

| Step | Exercised | Result |
|---|---|---|
| R1 | legacy genesis, tag 5 (review only) | "You haven't sent here before", "character by character" copy — met |
| R2 | legacy genesis, no tag (sent, validated) | same generic warning — met |
| Store after R2 | — | version 0; all 4 seeded entries kept (fabricated label stripped, `devnet` read as not recorded, "Landlord" kept), plus `{genesis, network:'testnet'}` appended — met |
| R3 | genesis, no tag again | no warning — met |
| R4 | rPT1…, no tag (recorded only on Mainnet, plus a legacy row) | generic warning — met |
| R5 | rrrr…, tag 4 (entry with an unknown network) | generic warning — met |
| R6 | genesis, tag 6 (recorded tagless here, legacy row present) | generic warning, no "You have paid this address before" (Decision 8) — met |
| Settings | 1280/390/320, light and dark | 5 rows with Network legends `Not recorded, Mainnet, Not recorded, Not recorded, Testnet`; both legacy tagless rows show "Destination tag: Not recorded"; the Mainnet row links to `livenet.xrpl.org`, the rest to `testnet.xrpl.org` (active Testnet); card, row and document overflow 0 at every width — met |
| Last row at 320 | second context, same seed, scrolled to the last row, light and dark | the row is on top at its bottom corners (`elementFromPoint`), not under the bottom bar — met |

**Screenshots** (session scratchpad, `r28shots/`, not committed). Opened and judged: R1, R2, R3, R4 confirm dialogs; Settings 1280 light, 390 dark, 320 light, 320 dark; last row at 320 dark. In the 390 and 320 element captures the fixed bottom bar overlays the last row; the separate last-row check shows that is a capture artefact. The other captures were measured by script but not opened, so they are not cited.

**Gaps:**
- 200% zoom was not driven.
- Only XRP sends were exercised; the token path shares the same `counterparty` and write line.
- Mainnet was never sent on (by rule); the Mainnet side of "recorded elsewhere" is pinned by unit tests with the network switched.
- The rollback to `prod` was reasoned from `origin/prod`'s source (Decision 9), not run in a browser.
