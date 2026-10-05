# Finalize triage — verified dispositions

Nine agents ran: six input reconciliations, three reviewers. This file records
which findings were verified against the code, and where each one is fixed.

The governing correction is F0. Every "the epic file says X" finding resolves
through it, so it is dispositioned first.

## F0 — §0's tie-break rule is wrong as stated (CRITICAL, in-PRD)

§0 says: "Where an FR and an epic file disagree, the epic file wins and this PRD
is stale." Applied literally this regresses shipped behaviour, in two places:

- `in-app-notices.md` N1-N4 still read as open decisions blocking S16/S17, for
  work that shipped 2026-09-02. FR-49/53/55/56 would defer to undecided text.
- `wallet-security.md` specifies passkey-only unlock, "never falls back", with
  the KEK in platform secure storage — a mechanism a PWA cannot use. FR-7 ships
  a mandatory PIN, and FR-7 is what SM-2 validates.

Fix: the epic file wins *where it is current*; the staleness exception is named
and pointed at §10. Verified: `app-versioning-and-updates.md` is NOT stale
(line 152: "All four are now answered (2026-09-02)", V1-V4 struck through).

## Verified against the code — PRD under-describes correct behaviour (additive)

| # | Finding | Code says | Fix |
|---|---|---|---|
| F1 | Partial payments absent from every FR | `reads.ts:182` prefers `delivered_amount` over `DeliverMax`/`Amount`; legacy `"unavailable"` flagged as upper bound; send path sets no Payment `Flags`, so `tfPartialPayment` is never set | Add to FR-28/36/37; state the send-side prohibition |
| F2 | FR-19/20 never require detecting `lsfRequireDestTag` | `reads.ts:30` reads `flags & 0x00020000`; surfaced in `ReceiveTab`; regression test exists for the error-coerced-to-false bug | FR-19 gains detection; FR-20 gains the tag in the confirm step |
| F3 | FR-8 does not exclude the stale-wrapper defect | `auth.ts:64-72` builds vault meta from scratch, never by spreading: a stale `wrappedMasterKeyForPasskey` gave "a valid auth tag for the old wrapper" that decrypted none of the new seeds | FR-8 must require the wrapper wrap the *current* Master Key — auth tag alone is insufficient |
| F4 | FR-9 omits its own reset and counting rules | `failedAttempts` persists in IndexedDB; resets only on success; **only a failed unwrap counts** — cancelled ceremonies and config errors do not (`auth.ts:161`, a fixed foot-gun) | FR-9 gains persistence, reset condition, and what counts |
| F5 | Glossary "Each Trust Line costs one" is incomplete | `reads.ts:28` uses `OwnerCount`; `useSpendableBalance` and `money.ts:129` are correct | Glossary wording only; FR-29's "owned objects" already right |

## Verified — the PRD is wrong and the code is right (corrective, not additive)

| # | Finding | Detail |
|---|---|---|
| F6 | **FR-2 "Seed entry fields are controlled by the app"** | "Controlled" is React for value-in-state — the banned pattern. `Onboarding.tsx:50` holds the seed in `pendingSeedRef = useRef`, with only a `hasPendingSeed` boolean in state. The PRD instructs the opposite of what the code correctly does. |
| F7 | **NFR-2's absolute wording contradicts `decisions.md` §4** | §4 permits a non-extractable `CryptoKey` handle in store/session state and says by name "Do not 'fix' `vaultKey` by removing it." Confirmed in `Onboarding.tsx:45` (`vaultKey` in `useState`). NFR-2 as written forbids it and says "cleared immediately", contradicting the accepted auto-lock-window lifetime. |

## Verified — reviewer claim REFUTED

| # | Claim | Verified |
|---|---|---|
| F8 | C-3: eight-failure wipe is irreversible destruction with no forewarning | **Collapses.** `wipeVault` is not called at 8 failures; hard lock only *blocks* unlock. Destruction is a separate user-initiated reset with a confirm step (`Unlock.tsx:122`). FR-9's "requires full re-import from seed" is accurate. |
| F9 | H-4: "read live from `server_state`" risks a 10^6 units error | **Refuted.** `reads.ts:113-117` uses `server_state` with `reserve_base`/`reserve_inc`, which are in drops; defaults `1_000_000`/`200_000` confirm. Wording could name the unit; not a defect. |
| F10 | addendum §7: `.panel-scribe` still present, deletion pending | **False.** Zero hits in `src/`; survives only in docs. `Switch` half stands (`ui/switch.tsx` exists, no JSX call site). |
| F11 | OQ6 / addendum §7: both V1-V4 and N1-N4 stale | **Half false.** Only `in-app-notices.md` N1-N4 is stale. |

## Surviving product gap (neither PRD nor code)

- **F12** — nothing warns the user as they approach the eight-failure hard lock.
  Reaching it makes the wallet unusable without the seed. A forewarning
  ("N attempts remain") exists in neither the requirement nor the build.
  This is a product question, not a documentation fix.

## Reported outward — NOT fixed in this PRD

Same disposition as the Address Book gap: recorded, not repaired.

- `in-app-notices.md` — N1-N4 presented as open for shipped work.
- `wallet-security.md` — passkey-only spec contradicts the shipped mandatory PIN.
- `docs/user-stories/INDEX.md` — no Address Book epic or file, though it ships.
- `CLAUDE.md` — five-doc authority table has no row for the product layer
  (`PRODUCT.md`), which it cites at line 13 and depends on.
- `cicd-sprints.md` — still describes `promotion-source` as a branch-name check;
  `decisions.md` §11 replaced it with tree equality.
- `DESIGN.md` — documents only true `disabled`; PRD §9.1/FR-25 mandate
  `aria-disabled` plus a visible reason.
- Unused `Switch` primitive — deletion pending.

## Unverified claims carried forward, not resolved here

- `interface-sprints.md` leaves the validated-payment outcome box and the
  `expired` `TxStatusBadge` unrendered; only the `tec*` path was ever exercised.
  Underwrites FR-22/23/24 and SM-1. Absent from §10 and addendum §5.
- A non-zero-balance Trust Line has never been rendered against real ledger
  state. Underwrites FR-33/34.

## Added after the polish pass

`triage.md` above was written before the structure/prose pass ran. That pass
found three factual errors introduced by the fixes themselves, all corrected:

- **SM-4** claimed NFR-6's contrast rule was "the only NFR a gate can decide".
  Wrong: `lint` also runs `check-query-keys.mjs` and `check-sw-register.mjs`,
  so the gates decide NFR-3 and NFR-4 as well. Verified in `package.json`.
- **addendum §5** said "the first three items above are SM-3's precondition".
  False under any ordering — the precondition is the Testnet pass, the
  multi-wallet check, and three device-blocked items that are not contiguous.
- **addendum §7** said three entries were "corrected in place". Two were
  withdrawn. Final tally: 4 Confirmed, 3 New, 2 Withdrawn.

Also closed: 19 glossary capitalisation violations on `Seed` and `Vault`;
NFR-10 split so contrast remediation sits with NFR-6; and `PRODUCT.md`'s
"assume literacy" principle, which had survived in the PRD only in its positive
half while §9.1 read as licence to explain everywhere.
