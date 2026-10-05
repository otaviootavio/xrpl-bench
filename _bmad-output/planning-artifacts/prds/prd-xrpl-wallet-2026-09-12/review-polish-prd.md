# Two-lens polish review — `prd.md`

Reviewed at 835 lines, after the ~40-edit finalization pass. Structure first, then
prose. Every finding carries a line number, the exact current text, and the exact
replacement. Nothing here was applied to `prd.md`.

---

# LENS 1 — STRUCTURE

## S1. §7 SM-4 states a falsehood about the gates (highest priority)

**Line 636–639.** SM-4 claims the contrast rule is the only NFR a gate can decide.
It is not. `package.json`'s `lint` script is
`oxlint … && node scripts/check-query-keys.mjs && node scripts/check-sw-register.mjs && node scripts/check-layering.mjs`.
`scripts/check-query-keys.mjs` exists specifically to enforce that every query key
comes from the `queryKeys` factory — which is NFR-3, decided by a gate on every
merge. (`check-layering.mjs` decides AD-1, an architecture rule the PRD does not
carry as an NFR, so it does not need naming here.)

This is the one finding in the document that is provably wrong rather than rough.

Current:

```
- **SM-4 — All four gates green on every merge.** `lint`, `build`, `test`,
  `check:contrast` (`tsc -b` runs inside `build`). Aimed at NFR-6's contrast
  rule, which is the only NFR a gate can decide; the rest are enforced by review
  and by the manual pass. SM-C3 is the guard against reading this as more.
```

Replacement:

```
- **SM-4 — All four gates green on every merge.** `lint`, `build`, `test`,
  `check:contrast` (`tsc -b` runs inside `build`). Aimed at the two NFRs a gate
  can decide: NFR-6's contrast rule, and NFR-3's query-key discipline, which
  `lint` enforces through `scripts/check-query-keys.mjs`. The rest are enforced
  by review and by the manual pass. SM-C3 is the guard against reading this as
  more.
```

## S2. §8 intro miscounts the NFRs

**Line 659.** Two NFRs were added (NFR-10, NFR-11); the count was not updated.
There are eleven. "focus, colour, or viewport" is still correct and must not
change: NFR-10 cites `PRODUCT.md`, not `docs/decisions.md`, so it is not
"recorded elsewhere in that document"; NFR-11 cites §3 itself.

Current: `enforced patterns are \`docs/decisions.md\` §3 and §4, but three of the nine below`

Replacement: `enforced patterns are \`docs/decisions.md\` §3 and §4, but three of the eleven below`

## S3. SM-1 does not name the two money FRs added for exactly its concern

**Line 617–619.** §6.1 describes FR-57 and FR-58 as "money-correctness behaviour";
SM-1 is the money-correctness gate and stops at FR-30.

Current: `every release's manual Testnet pass. Validates FR-16 through FR-30.`

Replacement: `every release's manual Testnet pass. Validates FR-16 through FR-30, FR-57, and FR-58.`

## S4. §0's cross-reference to §10 over-promises

**Line 49.** §0 gives the two stale-epic defects in full (with the FR mapping that
makes the tie-break actionable), then says they are *recorded* in §10 — but §10's
bullets are the shorter version. §0's instance should survive; §10's stays as the
register entry, and the pointer should stop claiming §10 holds the record.

Current: `Both are recorded in §10 as defects in the input rather than in this PRD.`

Replacement: `Both are listed in §10's defect register rather than treated as defects in this PRD.`

No change to the §10 bullets (lines 792–796): compressing them to pointers would
create a pointer loop back to §0 and would break the register's completeness.

## S5. Origin / IndexedDB precondition is stated twice at full length

**Lines 728–734 (§9.3) and 773–777 (§10 item 4).** Both restate: IndexedDB is
origin-scoped → a custom-domain move strands every vault → re-import from Seed →
`docs/decisions.md` §8.11 states the precondition. §9.3 already says the item is
"tracked separately as an open question in §10", so §9.3 is the instance that
should carry the mechanism and §10 item 4 should become the pointer (an open
question needs the question, the owner, and the trigger — not the mechanism).

Current (773–777):

```
4. **When is the production origin settled?** IndexedDB is origin-scoped, so
   moving off the provider subdomain to a custom domain would strand every
   existing vault and force a re-import from Seed. `docs/decisions.md` §8.11
   states the precondition: settle it before anyone but the author is invited.
   *Owner: Otavio. Revisit: before inviting a second user.*
```

Replacement:

```
4. **When is the production origin settled?** The constraint and its cost are in
   §9.3; `docs/decisions.md` §8.11 states the precondition — settle it before
   anyone but the author is invited.
   *Owner: Otavio. Revisit: before inviting a second user.*
```

## S6. SM-3's third precondition is a verification gap that §10 does not carry

**Line 630 vs lines 809–814.** SM-3's preconditions 1 and 2 are each duplicated
elsewhere (1 in §6.2, 2 in §10's third verification bullet), but precondition 3 —
"the multi-wallet UI exercised with more than one Wallet present" — appears only
under SM-3. A reader scanning §10's "Verification gaps carried forward" for the
complete list of what is unverified will miss it. Add it to §10.

Insert after line 813 (`A Trust Line with a non-zero balance …  Underwrites FR-33 and FR-34.`):

```
- The multi-wallet UI has never been exercised with more than one Wallet present.
  Underwrites FR-13, FR-14, and NFR-11, and is SM-3's third precondition.
```

## S7. Duplication checked and found acceptable — no edit

- **RTL (§6.2 line 599 and §10 item 5, lines 778–782).** Already resolved by the
  edits: §10 item 5 says "§6.2 carries the same item as an MVP exclusion; this is
  the entry that owns it." One instance owns it and says so. No change.
- **FR-57 in §4.6 and FR-58 in §4.4.** Both are in the correct feature — FR-57 is
  a display rule (Viewing Balances), FR-58 a signing rule (Sending Payments) — and
  §4's intro (line 167–171) explains the out-of-numeric-sequence placement
  explicitly. No change. FR-58's position *within* §4.4 (between FR-24 and FR-25
  rather than after FR-25) is cosmetic; not worth an edit.
- **§0's authority table.** Five rows (lines 22–26), prose says "Five documents"
  (line 17). Correct. Line 799's separate reference to `CLAUDE.md`'s
  "five-document table" is a different table and is also accurate.
- **All `§N` / `FR-N` / `NFR-N` / `SM-N` references resolve.** FR-1…FR-58 are all
  defined and all cited; NFR-1…NFR-11 all defined; SM-1…SM-6 and SM-C1…SM-C3 all
  defined. No reference to a removed "FR-1 through FR-56" range survives anywhere
  — §6.1 line 580 correctly says "FR-1 through FR-58". §9.3's "FR-46 through
  FR-51" and SM-6's "FR-53 through FR-56" both check out.

## S8. `**Functional Requirements:**` appears in 2 of 13 features

**Lines 181 and 217.** Only §4.1 and §4.2 carry the label; the other eleven
features go straight from description (or heading) to `#### FR-N`. The `####`
headings make the label redundant. Delete both lines (and the blank line each
leaves) so all thirteen features read the same way. `**Description:**` in 4 of 13
is fine — a description exists only where a feature needs one.

## S9. §10 item 5 breaks the bullet-ending convention

**Lines 778–782.** Items 1, 2, 3, 4 and 6 all end with the italic
`*Owner: … Revisit: …*` line. Item 5 puts prose *after* it.

Current:

```
   *Owner: Otavio. Revisit: when a user requiring an RTL locale exists.* The
   accepted risk is that RTL then becomes unbudgeted work discovered late.
```

Replacement:

```
   The accepted risk is that RTL then becomes unbudgeted work discovered late.
   *Owner: Otavio. Revisit: when a user requiring an RTL locale exists.*
```

## S10. NFR-10 bundles two unrelated rules — decide, do not auto-apply

**Lines 697–700.** Every other NFR groups by subject. NFR-10 joins
`prefers-reduced-motion` to contrast-failure remediation on the strength of shared
`PRODUCT.md` provenance alone, and the contrast half belongs to NFR-6, which
already owns contrast and cites §6.2/§7.5. The fix costs no renumbering:

NFR-6, append to line 687 (after `(\`docs/decisions.md\` §6.2 and §7.5.)`):

```
  A contrast failure is fixed by introducing a token for the missing role, never
  by silently repainting an existing one.
```

NFR-10 becomes:

```
- **NFR-10 — Motion respects `prefers-reduced-motion`.** A `PRODUCT.md`
  commitment that the guardrail sections do not carry.
```

Flagged rather than recommended outright: NFR-10's current shape may be a
deliberate "one NFR per source document" grouping.

---

# LENS 2 — PROSE

## Glossary discipline — the literal test

§3 line 116: "Terms below are used verbatim throughout this document. Introducing
a synonym is a discipline violation." Tested against every defined term, singular
and plural. `Annunciator`, `Trust Line`, `Active Wallet`, `Active Network`,
`Unlock Method`, `Release Manifest`, `Faucet`, `Spendable Balance` are clean
everywhere they appear as the defined term.

`Seed` and `Vault` are not. **Nineteen violations**, listed in file order. The
most damning are lines 730 and 775, which write lowercase `vault` in the same
clause as capitalised `Seed`.

| Line | Current | Replacement |
|---|---|---|
| 71 | `credential that cannot decrypt the vault cannot unlock the app.` | `credential that cannot decrypt the Vault cannot unlock the app.` |
| 84 | `reserve minus owner reserves, because the difference is what a failed send` | `Reserve minus Owner Reserves, because the difference is what a failed send` |
| 162 | `- **Vault** — the encrypted at-rest store of seed material, on-device only.` | `- **Vault** — the encrypted at-rest store of Seed material, on-device only.` |
| 176 | `First run creates or imports a Wallet, walks seed backup, and` | `First run creates or imports a Wallet, walks Seed backup, and` |
| 185 | `- The seed is generated locally; it is never transmitted and never logged.` | `- The Seed is generated locally; it is never transmitted and never logged.` |
| 186 | `- The seed is at rest only in the Vault, encrypted.` | `- The Seed is at rest only in the Vault, encrypted.` |
| 188 | `#### FR-2: Import an existing Wallet from a seed` | `#### FR-2: Import an existing Wallet from a Seed` |
| 189 | `The user can import a Wallet by entering a seed.` | `The user can import a Wallet by entering a Seed.` |
| 191 | `warns before completing that this seed may be unable to sign.` | `warns before completing that this Seed may be unable to sign.` |
| 197 | `#### FR-3: Guided seed backup` | `#### FR-3: Guided Seed backup` |
| 198 | `The user is walked through recording the seed before the Wallet is usable.` | `The user is walked through recording the Seed before the Wallet is usable.` |
| 199 | `- Revealing the seed requires an explicit confirm step stating the consequence.` | `- Revealing the Seed requires an explicit confirm step stating the consequence.` |
| 444 | `that includes a Seed or a new account is never ingested; the app does not` | `that includes a Seed or a new Account is never ingested; the app does not` |
| 574 | `a path to the unlock or seed surfaces.` | `a path to the unlock or Seed surfaces.` |
| 670 | `unlocked vault key in store or session state is permitted and intended; it` | `unlocked Vault key in store or session state is permitted and intended; it` |
| 730 | `vault and force a re-import from Seed — so the origin has to be settled before` | `Vault and force a re-import from Seed — so the origin has to be settled before` |
| 775 | `existing vault and force a re-import from Seed. \`docs/decisions.md\` §8.11` | *superseded by S5, which rewrites this bullet* |

Lines 188 and 197 are `####` FR headings, so the edit changes the FR titles. That
is correct — FR-2's own sub-bullet at line 193 already writes "The Seed entry
field", making the heading's lowercase `seed` an inconsistency inside a single FR.

**Line 84 also carries a synonym, not just a capitalisation slip.** "Know the true
spendable number" names `Spendable Balance` by a coined phrase, which §3 forbids
outright. The grep for "spendable balance" cannot catch it.

Current (lines 83–85):

```
- **Know the true spendable number.** Not the balance — the balance minus base
  reserve minus owner reserves, because the difference is what a failed send
  costs in confusion.
```

Replacement:

```
- **Know the true Spendable Balance.** Not the balance — the balance minus Base
  Reserve minus Owner Reserves, because the difference is what a failed send
  costs in confusion.
```

### Checked and deliberately left alone

- **Line 97**, `drops, reserve, trust line, sequence, destination tag` — this
  bullet is naming XRPL vocabulary *as vocabulary*, in the register a
  non-user would meet it. Lowercase is right here.
- **Line 141**, `an XRPL account's master key pair` — the newly added
  disambiguation. Lowercase is the point of the sentence. Correct.
- **Lines 64, 72, 88, 145, 392, 588** — "a wallet", "the wallet's claims", "this
  wallet", "a minimum functional self-custody wallet" all mean the product, not a
  `Wallet` (one keypair and address). Correct as written.
- **Lines 66, 715**, `no account, no email` — a service account, not an XRPL
  `Account`. Correct.
- **Lines 445, 678**, `a network service`, `cross-wallet or cross-network` —
  generic noun and compound adjectives respectively. No change.
- **Line 630**, `the multi-wallet UI` — feature name, matching §4.3's heading.

## Register and flab in the newly added passages

### P1. FR-58's third bullet argues with the reader

**Lines 348–350.** The document's voice states the requirement; this bullet
defends the decision to have written one. "Stated as a requirement rather than
left to the default" is editorial process, not a requirement.

Current:

```
- Stated as a requirement rather than left to the default, because the failure
  is silent — a partial payment succeeds, and only the delivered amount reveals
  the shortfall.
```

Replacement:

```
- The failure is silent: a partial payment succeeds, and only the delivered
  amount reveals the shortfall.
```

### P2. The `Seed` glossary entry opens with a ranking instead of a definition

**Lines 150–155.** Six lines is not itself too long — `Master Key` and
`Owner Reserve` are comparable. But the entry's second sentence ranks the term
("the highest-consequence operation in the product") before defining anything,
which no other entry does. Cut the ranking clause; keep the definition and the
NFR-2 line.

Current:

```
- **Seed** — the secret from which a Wallet's keypair is derived, and the only
  thing that can recover it. Entering, revealing, or storing a Seed is the
  highest-consequence operation in the product: it is the material FR-1 through
  FR-3 handle, the thing the Vault encrypts, and what recovery after a hard lock
  requires. A Seed is never in application state, never serialized, and never
  transmitted (NFR-2).
```

Replacement:

```
- **Seed** — the secret from which a Wallet's keypair is derived, and the only
  thing that can recover it. It is the material FR-1 through FR-3 handle, the
  thing the Vault encrypts, and what recovery after a hard lock requires. A Seed
  is never in application state, never serialized, and never transmitted
  (NFR-2).
```

### P3. FR-57's closing sentence restates §1

**Lines 392–393.** "A wallet that reports a requested amount as received is wrong
about money, which §1 treats as total failure" adds a rhetorical appeal to a
requirement that has already been stated three ways above it. The governing clause
is what matters.

Current:

```
- This governs FR-28, FR-36, and FR-37. A wallet that reports a requested
  amount as received is wrong about money, which §1 treats as total failure.
```

Replacement:

```
- This governs FR-28, FR-36, and FR-37.
```

Low confidence — the sentence is consistent with §1 and with the document's habit
of naming the stake. Listed for the parent to decide, not recommended outright.

## Typography and mechanics — clean

Checked and found nothing: no doubled words, no unspaced or inconsistently spaced
em-dashes (every `—` is spaced on both sides throughout), no stray `--` or en
dashes, no double spaces mid-sentence, no trailing whitespace, no unbalanced
`*`/`**` emphasis, no broken code spans. Heading hierarchy is well-formed: one
`#`, eleven `##` in order 0–11, `###` subsections numbered contiguously within
each (§2.1–2.3, §4.1–4.13, §6.1–6.2, §9.1–9.6), and `####` used only for FR
entries.

---

## Priority order for application

1. **S1** — line 636–639. Factually false claim about the gates.
2. **S2** — line 659. Miscount.
3. **S3** — line 617–619. SM-1 omits the FRs it exists to gate.
4. **Glossary table** — nineteen capitalisation violations, plus the line 84
   synonym.
5. **S4, S5, S6** — duplication and a missing verification-gap entry.
6. **S8, S9, P1, P2** — consistency and flab.
7. **S10, P3** — flagged for decision, not recommended outright.
