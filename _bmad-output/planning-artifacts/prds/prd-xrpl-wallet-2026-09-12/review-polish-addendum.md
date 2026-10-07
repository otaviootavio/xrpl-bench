# Polish review — `addendum.md` (two lenses: structure, then prose)

Target: `_bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/addendum.md`
Companion read for consistency, not edited: `prd.md` in the same folder.
Reviewed 2026-09-15. Line numbers are as the file now stands.

Out of scope by instruction: the addendum's brevity, its reliance on pointers,
its deference to `prd.md`.

---

## LENS 1 — STRUCTURE

### S1. §5 line 98 — "The first three items above" is literally false

**Current (line 98–99):**

> The first three items above are SM-3's precondition (`prd.md` §7); the rest are
> recorded so they are not mistaken for verified.

`prd.md` §7 lines 625–630 states SM-3's precondition as three numbered items:
1. the manual live Testnet integration pass;
2. "the device- and tool-blocked verifications in `addendum.md` §5 closed — the
   Android home-screen install, 200% zoom on a real browser rather than
   emulated, and the live colour-scheme `change` listener";
3. the multi-wallet UI exercised with more than one Wallet present.

Mapped onto the addendum's bullets as they now stand, the precondition is
bullet 1 (line 80), bullet 2 (line 81), bullet 6 (line 87), bullet 7 (line 88),
and **half** of bullet 3 (line 84). Bullet 3 welds "320px" — which is *not* in
SM-3's precondition — to "200% zoom on a real browser", which is. So no
reordering of the bullets makes a count-based sentence true; the count has to go.

**Replacement (lines 98–99):**

> SM-3's precondition (`prd.md` §7) is the Testnet pass, the multi-wallet check,
> and the three device- and tool-blocked items below — 200% zoom on a real
> browser, the Android install, and the colour-scheme listener. The rest are
> recorded so they are not mistaken for verified.

**Optional, low value:** split line 84 into "320px on a real browser." and
"200% zoom on a real browser — so far only emulated." so the precondition maps
to whole bullets. Not required once S1 names items instead of counting.

### S2. §7 line 113 — the count is wrong and so is the verb

**Current (lines 111–113):**

> Outside this PRD's task; recorded here so it is not lost. Each entry below was
> re-verified against the source on 2026-09-15, and three earlier entries were
> found to be wrong rather than merely stale — corrected in place.

Counting the list as written: **withdrawn** entries are two —
`app-versioning-and-updates.md` (lines 118–121) and `.panel-scribe` (lines
142–145). The other seven are four **Confirmed** (117, 124, 130, 141) and three
**New** (133, 136, 139). Nine entries total.

Both wrong entries were *withdrawn*, not "corrected in place" — the verb is as
wrong as the count.

**Replacement (line 113):**

> re-verified against the source on 2026-09-15, and two earlier entries were
> found to be wrong rather than merely stale — withdrawn below.

### S3. §2 lines 31–35 — restates `prd.md` FR-8 rather than pointing at it

`prd.md` FR-8 (lines 228–235) already carries the consequence in full: "A
wrapper left behind by a previous Master Key unwraps with a valid tag and then
decrypts no stored Seed at all — an unlock that succeeds and can do nothing.
Vault metadata is therefore rebuilt from scratch whenever the Master Key is
regenerated." The addendum's second paragraph restates the same consequence in
the same words, which is the "second copy" the file's own preamble forbids. The
*mechanism* (metadata rebuilt by spreading the previous record) is the part that
lives nowhere else and should stay.

**Current (lines 31–35):**

> A second defect of the same class was found later and is why FR-8 no longer
> treats a passing authentication tag as sufficient: rebuilding vault metadata by
> spreading the previous record carried forward a wrapper for a *superseded*
> Master Key. That wrapper unwrapped with a valid tag and then decrypted none of
> the newly stored Seeds — an unlock that succeeded and could do nothing.

**Replacement:**

> A second defect of the same class was found later: rebuilding Vault metadata by
> spreading the previous record carried forward a wrapper for a *superseded*
> Master Key. That is why FR-8's second bullet exists; `prd.md` FR-8 states the
> consequence and the rule that follows from it.

The first paragraph (lines 26–29) stays as written — that history appears in no
other document.

### S4. §7 lines 128–130 — argues a case `prd.md` already owns

The Address Book entry's last two sentences re-derive the significance, which
`prd.md` §4.11 (473–477), §10 (797–798), and §11 (829–833) each already state.

**Current (lines 128–130):**

> Since `INDEX.md` is the authoritative functional contract, a shipped
> capability it does not name is a contract gap, and `prd.md` FR-21 and FR-45
> depend on it. **Confirmed.**

**Replacement:**

> `prd.md` §4.11 and §11 record the consequence. **Confirmed.**

### S5. §7 lines 119–121 and 143–145 — the two withdrawals inline their sources

Both quote or paraphrase the source document at length to prove a negative. A
withdrawal needs the verdict and the evidence pointer, not the source text.

**Current (lines 118–121):**

> `docs/user-stories/app-versioning-and-updates.md` was previously listed here
> as carrying the same defect. **It does not.** That file states "All four are
> now answered (2026-09-02)" and strikes through V1–V4 with their answers
> recorded. The earlier claim was false and is withdrawn.

**Replacement:**

> `docs/user-stories/app-versioning-and-updates.md` was previously listed here
> as carrying the same defect. It does not: V1–V4 are struck through and marked
> answered. **Withdrawn.**

**Current (lines 142–145):**

> `.panel-scribe` was previously listed here as "defined but unused, deletion
> pending". **It is already gone** from `src/` — `DESIGN.md` records its removal
> on 2026-09-02, and it now survives only in documentation. The claim was false
> and is withdrawn.

**Replacement:**

> `.panel-scribe` was previously listed here as "defined but unused, deletion
> pending". It is absent from `src/`; `DESIGN.md` records the removal.
> **Withdrawn.**

Verified independently: `grep -rn "panel-scribe" src/` returns nothing, and
`src/components/ui/switch.tsx` does exist — so both entries' factual claims hold.

### S6. §7 omits the `wallet-security.md` defect that `prd.md` elevates

`prd.md` §0 (lines 44–47) and §10 (lines 794–796) name two stale epic files.
§7 carries the `in-app-notices.md` one (lines 115–117) and not the
`wallet-security.md` one — passkey-only unlock with the key-encryption key in
platform secure storage, a mechanism a PWA cannot use.

This is a gap, not a contradiction: the two lists have different scopes (§7 also
carries code-level drift such as `Switch`, which is not an input defect, and
`prd.md` §10 does not carry §7's `bugfix-sprints.md` "All 10 epics" row). But
one of only two epic files `prd.md` elevates to a tie-break exception should not
be missing from the drift index.

**Insert after line 117:**

> - `docs/user-stories/wallet-security.md` specifies passkey-only unlock that
>   "never falls back", with the key-encryption key in platform secure storage —
>   a mechanism a PWA cannot use. `prd.md` FR-7 records the mandatory PIN that
>   shipped. **Confirmed still stale.**

### S7. §3 line 44 — "Permanently out" overstates the cited source

Addendum §3's Web Push row reads "Permanently out" and cites
`PRODUCT.md` § Positioning and `docs/decisions.md` §2. Checked against both:

- `PRODUCT.md` line 53–54 (Positioning) says push is "recorded as **permanently
  deferred** rather than planned" — supports the row.
- `PRODUCT.md` lines 112–118 files Web Push under "**Deferred**, and recorded as
  deferred rather than silently absent", in the same list as fiat-equivalent
  display.
- `docs/decisions.md` §2 row: "**Deferred** — Web Push requires a server…".
- `docs/decisions.md` §5.2 is titled "explicitly deferred" and ends "Revisit only
  if a backend is introduced for other reasons."

`prd.md` §5 (557–559) says the same thing as the addendum, so **addendum §3 and
`prd.md` §5 do not disagree with each other** — the split for both Web Push
(permanent) and fiat-equivalent display (deferred, addendum line 45 vs `prd.md`
561–568) is consistent across the two documents. The divergence is with the
*sources*, and it is the same overstatement class `prd.md` §5 admits for the
fiat row ("an earlier draft of this section called it permanent, which overstated
the record").

Recommended: keep "Permanently out" (Positioning supports it, and the
architectural argument is genuine) and record the source's weaker wording as
drift. **Insert into §7:**

> - `docs/decisions.md` §5.2 is titled "explicitly deferred" and closes "Revisit
>   only if a backend is introduced", and §2's row says only "Deferred" — neither
>   supports the permanent closure §3 above and `prd.md` §5 both state on
>   `PRODUCT.md` § Positioning's authority. The permanence is sound; the
>   authoritative wording is the stale half. **New.**

If that entry is added, §7's intro count in S2 is unaffected (it counts only the
*withdrawn* entries), but S6 and S7 together take the list from nine entries to
eleven.

### S8. Cross-references — all resolve

Checked every `§N`, `FR-N`, `NFR-N`, `CD-N` in the addendum:

- `prd.md` §7, §9.3, §10 — exist.
- FR-8, FR-22, FR-23, FR-24, FR-25, FR-33, FR-34, FR-21, FR-45, NFR-2, SM-1 — all
  exist in `prd.md`; none is a number `prd.md` renumbered.
- `docs/decisions.md` §1, §2, §3, §4, §6.5, §8, §9, §10, §11 — all exist
  (§11 is `## 11. The `promotion-source` check enforced a name…`, which confirms
  line 131–133's claim).
- CD-6 — present in `docs/sprints/cicd-sprints.md`.
- `CLAUDE.md` line 13 does cite `PRODUCT.md`, so line 136's claim holds.

No action. Note only: `prd.md` gained FR-57, FR-58, NFR-10 and NFR-11, and the
addendum references none of them — correctly, since nothing in the addendum's
scope bears on them. §6's "no visual requirements beyond the accessibility NFRs"
survives NFR-10, which `prd.md` §0 (29–30) classes as accessibility.

---

## LENS 2 — PROSE

### P1. Line 60 — glossary synonym: "a static manifest" for **Release Manifest**

**Current:** "release identity via a static manifest, byte-identical rebuilds."

`prd.md` §3 defines **Release Manifest** as "the static, same-origin document
that names the current published build", and §3's preamble declares that
introducing a synonym is a discipline violation. A lowercase paraphrase of the
defined term is exactly that.

**Replacement:** "release identity via the Release Manifest, byte-identical
rebuilds."

### P2. Line 32 — "vault metadata" → "Vault metadata"

**Current:** "rebuilding vault metadata by spreading the previous record"

`prd.md` FR-8 writes "Vault metadata is therefore rebuilt from scratch".
(Absorbed into S3's replacement text above if that edit is taken.)

### P3. Line 82 — "more than one wallet present" → "more than one Wallet present"

**Current (lines 81–82):**

> Multi-wallet UI checked with more than one wallet present — a standing rule
> after two defects were found that way.

`prd.md` SM-3 precondition 3 (line 630) writes "more than one Wallet present".
"Multi-wallet" as a feature-name compound is fine and matches `prd.md` §4.3.

**Replacement:** "Multi-wallet UI checked with more than one Wallet present — a
standing rule after two defects were found that way."

### P4. Line 22 — "the IndexedDB vault schema" → "the IndexedDB Vault schema"

Low value; same violation class as P2, in a list of architecture-owned topics.

### P5. Line 28 — "whichever method encrypted the Seed"

`prd.md` uses the full **Unlock Method** everywhere (glossary line 160, FR-8).
"method" standing alone is a soft synonym. Weak finding; take it or leave it.

**Optional replacement:** "meaning only whichever Unlock Method encrypted the
Seed could ever really work."

### P6. §7 markers — normalise

Line 117 reads **Confirmed still stale.** where lines 124, 130 and 141 read a
bare **Confirmed.** Both withdrawn entries (121, 145) end with an unbolded "is
withdrawn" where every other entry ends in a bold marker.

Fix: bare **Confirmed.** everywhere, and **Withdrawn.** as a bold marker for the
two withdrawals (already applied in S5's replacements). If line 117's "still
stale" is wanted, use it on all four Confirmed entries or none.

### P7. §2 heading — singular, for a section about two defects

**Current (line 24):** `## 2. The unlock defect, and why FR-8 is written as it is`

Lines 26–35 describe two defects of the same class.

**Replacement:** `## 2. The unlock defects, and why FR-8 is written as it is`

Cosmetic.

### P8. Line 136 — "at line 13" is a brittle citation

**Current:** "even though it cites `PRODUCT.md` at line 13 and depends on it."

The claim is true today (verified), but a line number into a file that changes
will rot, and `prd.md` §10 (799–800) states the same finding without one.

**Replacement:** "even though it cites `PRODUCT.md` and depends on it."

### P9. Register — no other passages argue rather than state

Read the newly wordier passages against the established voice. Beyond S3, S4 and
S5 (handled under structure, since the problem there is duplication rather than
tone), the remaining additions — §7's `promotion-source` entry (131–133), the
`DESIGN.md` entry (137–139), §4's residual-risk bullets (66–72) — are
declarative and end where they should. No further action.

### P10. Typos, markdown, em-dashes

Checked: no doubled words; em-dash spacing is uniformly spaced throughout; the §3
table's ten rows are all well formed with matching pipe counts; the brace glob on
line 101 (`docs/sprints/{bugfix,interface,notices,mobile-chrome}-sprints.md`) is
deliberate shorthand, not malformed markdown. Nothing to fix.

---

## Applying order

S1, S2, S6, S7 are corrections of fact and should land first. S3, S4, S5 are the
pointer-index restorations. P1, P2, P3 are the glossary fixes. P4–P8 are optional.
