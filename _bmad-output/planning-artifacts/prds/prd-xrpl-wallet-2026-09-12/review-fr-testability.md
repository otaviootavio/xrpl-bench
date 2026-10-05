# Review: FR Testability — PRD XRPL Bench (2026-09-12)

**Reviewer lens:** FR-TESTABILITY. One question per requirement: *could a competent
engineer who has read only this PRD tell whether this requirement is met or not met?*

**Scope judged:** `prd.md` FR-1..FR-56 and NFR-1..NFR-9, plus §7 metric coverage.
`addendum.md` read as context.

**Ruling on the link-out, stated up front.** §0 makes a deliberate choice: the PRD
points at `docs/user-stories/*` and `docs/decisions.md` rather than restating them.
Read with maximum literalism, that choice makes roughly half the FRs undeterminable
on their own text — which would be a review of a settled decision, not of
testability. So every row below is judged against **the PRD text plus the named
pointer in its feature heading**, and the link-out is raised once, as a structural
finding (F-1), not fifty-six times. `UNTESTABLE` is reserved for requirements where
**no** authoritative criterion exists at the far end of any pointer either.

**Counts:** 34 TESTABLE · 25 WEAK · 6 UNTESTABLE (65 items: 56 FR + 9 NFR).
FR only: 33 / 20 / 3. NFR only: 1 / 5 / 3.

---

## 1. FR classification table

| # | Class | Criterion as written / the word that hides it | What it would need to say |
|---|---|---|---|
| FR-1 | TESTABLE | Generate on-device; not transmitted, not logged | — (see F-7: "never logged" is code-review-shaped, but network absence is observable) |
| FR-2 | TESTABLE | Reads `account_flags`; warns on `lsfDisableMasterKey` before completing | — |
| FR-3 | WEAK | "explicit confirm step **stating the consequence**" | Which consequence, in which words, and what the step blocks until confirmed |
| FR-4 | TESTABLE | Distinguishes no-Account from zero-Spendable; states Base Reserve | — |
| FR-5 | WEAK | address readable "in full, **without a pointer**" | "Pointer" here means the input device, not a link — say "reachable and readable by keyboard alone, and not revealed only on hover" |
| FR-6 | TESTABLE | Unlock succeeds via platform authenticator where present | — |
| FR-7 | TESTABLE | PIN set during onboarding, never optional; PIN-only device reaches every function | — ("every function" is enumerable from §4) |
| FR-8 | **UNTESTABLE** | "fails on the AES-GCM authentication tag, **not on an application-level comparison**" | The distinguishing criterion is invisible from outside the binary. The observable half ("a wrong credential never unlocks, for every configured method") is testable; the stated criterion is a code-review rule. See F-7 |
| FR-9 | WEAK | Backoff "begins at the third" attempt; re-import "after eight" | No backoff *schedule* (base, multiplier, cap), no rule for what **resets** the counter, and no statement that the counter survives reload/app-kill. A counter that resets on refresh satisfies the text and defeats the requirement |
| FR-10 | WEAK | "locks after **inactivity** — default 5 minutes, 1/5/15/30" | "Inactivity" is undefined: which events reset the timer, and does the timer run while backgrounded or only while focused |
| FR-11 | WEAK | "immediately on **coarse-pointer** devices, and after a 30-second grace window on **desktop**" | The two branches are named on different axes (pointer capability vs. form factor), so a touch laptop is in both or neither. Also "backgrounding" is undefined (tab hidden, window blur, or OS app switch) and the grace window's behaviour on *return inside* 30s is unstated |
| FR-12 | TESTABLE | Clears cached balances, history, query cache | — |
| FR-13 | WEAK | "explicit confirm step **stating the consequence**" | Same as FR-3 |
| FR-14 | TESTABLE | Switching never leaves previous Wallet's data on screen | — |
| FR-15 | TESTABLE | Re-auth required only when signing needs that Wallet's key | — |
| FR-16 | TESTABLE | Send XRP from Active Wallet | — |
| FR-17 | TESTABLE | Send token, gated on Trust Line existing | — |
| FR-18 | TESTABLE | Fee displayed **before** the confirm step | — |
| FR-19 | TESTABLE | Destination tag can be attached | — |
| FR-20 | TESTABLE | Confirmation names destination, exact amount, fee | — (the one confirm-step FR that enumerates its content; FR-3/13/33 should copy it) |
| FR-21 | **UNTESTABLE** | "an address **not in the Address Book**" | Depends entirely on FR-45, which has no authoritative contract (§4.11 admits no epic file exists). "First time" is also unscoped: first time ever, per Wallet, or per Network |
| FR-22 | WEAK | validated vs. submitted are "visually and textually **distinct**" | Name the discriminator: different label text, and a non-colour visual difference (§NFR-6 already demands the latter — say so here) |
| FR-23 | WEAK | codes "surfaced with their meaning", reported "**plainly**" | Say: the raw code string is shown verbatim *and* accompanied by a one-line effect statement; and for a fee-consuming failure, both the non-application and the fee debit are named |
| FR-24 | TESTABLE | Marked "expired, not applied" past `LastLedgerSequence`; retry re-signs with a new sequence | — (the model FR of this document: names the state, the trigger, and the forbidden alternative) |
| FR-25 | TESTABLE | Cannot send; control `aria-disabled` with reason in visible text | — |
| FR-26 | TESTABLE | Address shown as text and QR | — |
| FR-27 | TESTABLE | Destination tag included in what is shared | — |
| FR-28 | TESTABLE | Notice raised in Annunciator; XRP vs. token distinguished | — |
| FR-29 | WEAK | balance and Spendable shown as "**distinct** figures"; "where a figure is an upper bound, **it says so**" | Which figures are upper bounds is never stated, so the second clause cannot be checked. Enumerate them (or say "any figure computed from a paginated read") |
| FR-30 | TESTABLE | Per-Trust-Line balances with issuer identified | — |
| FR-31 | TESTABLE | Owner Reserve cost stated before the action proceeds | — |
| FR-32 | TESTABLE | Limit editable | — |
| FR-33 | WEAK | "irreversible and requires an explicit confirm step" | No required content; compare FR-20 |
| FR-34 | TESTABLE | Badged "wherever it appears" | — (enumerable: balances list, send form, history) |
| FR-35 | TESTABLE | List complete regardless of count (marker paging) | — |
| FR-36 | TESTABLE | Chronological; sent vs. received distinguished | — |
| FR-37 | TESTABLE | Expands to detail incl. result code and fee | — |
| FR-38 | TESTABLE | Switch works; no previous-Network data left on screen | — |
| FR-39 | WEAK | Mainnet is "**unmistakable**"; carries a "real-funds indication" not reliant on colour | Name the artefact and its persistence: a text label containing the Network name, present on every screen, at a stated location |
| FR-40 | WEAK | on Mainnet "the absence is **explained** rather than silent" | Where the explanation appears and in what trigger state (always, or only on attempting to fund) |
| FR-41 | TESTABLE | One hardcoded primary + one backup per Network, with failover | — (failover *trigger* unstated, but presence/absence is determinable) |
| FR-42 | WEAK | every address/hash links to the correct explorer; "**no hand-rolled explorer anchor exists**" | Clauses 1 and 3 are testable and good. Clause 2 is a grep rule, not product behaviour — see F-7. Split it out or restate as "every explorer link resolves to the Active Network's explorer host" |
| FR-43 | WEAK | copy "**acknowledges** that the explorer may lag" | No required wording, and no statement of where the copy sits relative to the link (adjacent, tooltip, once per screen?) |
| FR-44 | WEAK | "**reachable** without a pointer"; "read in full **by keyboard alone**" | Heading says *reachable*, bullet says *readable* — different tests. Say: focusable in tab order, and activation reveals the complete string as text (not a title attribute), announced to a screen reader |
| FR-45 | **UNTESTABLE** | "The user can label addresses locally" | No fields, no uniqueness rule, no per-Network/per-Wallet scoping, no capacity, no edit/delete. §4.11 states outright that no epic file exists, so there is no authoritative criterion anywhere. FR-21 is built on this |
| FR-46 | WEAK | build stamp "baked in at build time and is **visible in the app**" | Where, and in which lock states. `docs/decisions.md` §10.2 records a shipped defect that was exactly this gap (unreachable before unlock) — the FR as written did not catch it |
| FR-47 | TESTABLE | Static same-origin Release Manifest naming the current build | — |
| FR-48 | WEAK | "cannot be applied **while a transaction is in flight**" | "In flight" has no boundary: signed-not-submitted, submitted-not-validated, or until validated-or-expired (FR-24 defines that terminal state and should be cited) |
| FR-49 | WEAK | user "**sees what changed** before accepting" | No source of truth for the changelog and no minimum content; "the manifest's notes for the offered version, shown before the activate control is enabled" would be testable |
| FR-50 | TESTABLE | Rebuilds byte-identically from the published tag | — (the most testable requirement in the document) |
| FR-51 | WEAK | "recover from a **bad** update without clearing site data" | Neither "bad" nor the recovery affordance is defined. Name the affordance (e.g. revert to the previous cached build) and the entry point that exists when the app does not render |
| FR-52 | TESTABLE | Shell renders offline; ledger data network-first, never cached | — |
| FR-53 | TESTABLE | Reserved area; never covers panel or navigation; present on main/unlock/onboarding | — |
| FR-54 | TESTABLE | Errors and warnings do not expire on a timer | — |
| FR-55 | TESTABLE | "announced **politely**" = inside a polite live region, expanded list included | — ("politely" is a term of art here, `aria-live="polite"`, and the bullet says so; not weak) |
| FR-56 | WEAK | "when notices **exceed the reserved area**" | The reserved area's height is nowhere in the PRD, so the trigger cannot be reached deliberately. State it as a count or as a measurable height, and say what the summary line contains |

### NFR classification

| # | Class | Note |
|---|---|---|
| NFR-1 | **UNTESTABLE** (as product behaviour) | "No `Number()` on a Drops value anywhere" is a source-code prohibition. Observable consequence — exact arithmetic beyond 2^53 drops — is not stated |
| NFR-2 | **UNTESTABLE** (as product behaviour) | "anything that gets stringified", "React state", "cleared immediately" are code properties. The observable slice (nothing secret in `localStorage`/IndexedDB-plaintext/URL) could be stated and tested |
| NFR-3 | WEAK | Written as mechanism ("goes through a query hook"), but its consequence *is* stated and is testable — and FR-14/FR-38 already test it. Lead with the consequence |
| NFR-4 | TESTABLE | Cache contents, cache-version increment, and old-cache purge are all inspectable |
| NFR-5 | **UNTESTABLE** (as product behaviour) | "`outline-none` is banned" is a lint rule. "Every focusable element shows a visible focus indicator in both themes" would be testable and is what is actually wanted |
| NFR-6 | WEAK | Two halves of different quality. The `check:contrast` half is testable and gated. "**Colour never carries meaning alone**" has no enumeration of the meaning-bearing states and no check — it is the half that fails in review, and the half SM-4 cannot see |
| NFR-7 | WEAK | "**plain language**", "exact consequence" — and the PRD never enumerates the irreversible actions, so coverage cannot be asserted. FR-3/13/33 are the instances and are weak in the same way |
| NFR-8 | WEAK | A process requirement with no artefact: no checklist, no recorded evidence, no definition of "bespoke". Unfalsifiable after the fact |
| NFR-9 | WEAK | 320px and 200% zoom named without saying whether they are **conjunctive**. Read together with SM-6 ("at 320px and 200% zoom") it reads as 320px *at* 200% — a ~160px effective viewport that nothing passes. No browser/UA named. "Clipped or unreachable" needs "no horizontal scroll on the document, and every control focusable and fully within the viewport" |

---

## 2. Metric coverage (Q1)

### What each metric actually measures

| Metric | Its own test | FRs it claims | FRs it genuinely determines |
|---|---|---|---|
| SM-1 | a displayed balance/fee/amount disagreeing with the ledger, via explorer cross-check on the manual Testnet pass | FR-16–FR-30 (15) | FR-16, FR-17 (a payment must be made to cross-check it), FR-18, FR-29, FR-30 |
| SM-2 | a wrong credential never unlocks, in any configuration | FR-6–FR-9 (4) | FR-8 *outcome only*; FR-7 partially (the PIN-only configuration) |
| SM-3 | "the author holds real Mainnet funds and continues to" | "the whole" | none — see §3 |
| SM-4 | four named gates green on every merge | "the cross-cutting NFRs" | NFR-6's contrast half only |
| SM-5 | byte-identical rebuild from tag | FR-50 | FR-50 |
| SM-6 | keyboard-only + screen-reader at 320px / 200% | FR-44, FR-53–FR-56 (5) | FR-44, FR-55; FR-53 partially (reach, not non-overlay) |

### Claimed but not actually validated

- **SM-1 → FR-19, FR-20, FR-21, FR-22, FR-23, FR-24, FR-25, FR-26, FR-27, FR-28.**
  SM-1 is a *numbers-agree-with-the-ledger* metric. Ten of the fifteen FRs in its
  claimed range are not about a number: destination-tag entry, confirm-step content,
  first-time warning, submitted-vs-validated distinctness, result-code copy,
  expiry handling, frozen-line blocking, address/QR sharing, tag sharing, incoming
  notice. FR-26/27/28 are not even in the same feature — SM-1's range crosses §4.4,
  §4.5 and §4.6 and picks up Receiving wholesale.
- **SM-2 → FR-6, FR-9; and the stated criterion of FR-8.** SM-2 tests only the
  negative path. FR-6's *positive* path (a correct passkey does unlock) is not
  measured by "a wrong credential never unlocks". FR-9 — backoff at the third
  attempt, forced re-import after eight — is not touched at all, which is the most
  consequential miss in §7, since FR-9 is the only anti-brute-force requirement in
  the document. FR-8's actual criterion (fails on the GCM tag rather than an
  app-level comparison) is indistinguishable from outside, so SM-2 validates FR-8's
  outcome while leaving the property the addendum §2 defect was about unmeasured.
- **SM-4 → the cross-cutting NFRs, i.e. all of NFR-1..NFR-9.** This is the weakest
  claim in §7. The PRD nowhere establishes that lint rules exist for NFR-1, NFR-3 or
  NFR-5; NFR-2, NFR-7 and NFR-8 are not gateable by `lint`/`build`/`test`/`check:contrast`
  at all; NFR-9 is explicitly manual (§6.2 defers the automated a11y audit, addendum
  §5 records the 200% pass as emulated); and `check:contrast` covers contrast but not
  NFR-6's "colour never carries meaning alone". One half of one NFR out of nine.
- **SM-6 → FR-54, FR-56; FR-53 in part.** FR-53's "never covers the panel or the
  navigation" is a visual/layout property a keyboard-and-SR pass does not exercise.
  FR-54 is a timing property — it needs a wait, not a tab order. FR-56 needs notices
  deliberately forced past the (unspecified, per FR-56 above) reserved height.

### FRs validated by no metric at all — 31 of 56

FR-1, FR-2, FR-3, FR-4, FR-5 · FR-10, FR-11, FR-12, FR-13, FR-14, FR-15 ·
FR-31, FR-32, FR-33, FR-34, FR-35, FR-36, FR-37, FR-38, FR-39, FR-40, FR-41,
FR-42, FR-43 · FR-45, FR-46, FR-47, FR-48, FR-49 · FR-51, FR-52.

Whole features are uncovered: **Account Onboarding (§4.1, all five FRs)**,
**Tokens and Trust Lines (§4.7, all five)**, **Network Selection (§4.9, all four)**,
**Address Book (§4.11)**, and all of **App Versioning (§4.12) except FR-50**. That
last one is notable: §4.12's description calls the feature "what keeps the
no-backend claim honest", and six of its seven FRs have no metric.

### Full coverage table, FR-1..FR-56

`V` = genuinely determined by the claiming metric · `C` = claimed by a metric but
not determined by it · `—` = claimed by no metric.

| FR | | FR | | FR | | FR | |
|---|---|---|---|---|---|---|---|
| FR-1 | — | FR-15 | — | FR-29 | V (SM-1) | FR-43 | — |
| FR-2 | — | FR-16 | V (SM-1) | FR-30 | V (SM-1) | FR-44 | V (SM-6) |
| FR-3 | — | FR-17 | V (SM-1) | FR-31 | — | FR-45 | — |
| FR-4 | — | FR-18 | V (SM-1) | FR-32 | — | FR-46 | — |
| FR-5 | — | FR-19 | C (SM-1) | FR-33 | — | FR-47 | — |
| FR-6 | C (SM-2) | FR-20 | C (SM-1) | FR-34 | — | FR-48 | — |
| FR-7 | V-part (SM-2) | FR-21 | C (SM-1) | FR-35 | — | FR-49 | — |
| FR-8 | V-part (SM-2) | FR-22 | C (SM-1) | FR-36 | — | FR-50 | V (SM-5) |
| FR-9 | C (SM-2) | FR-23 | C (SM-1) | FR-37 | — | FR-51 | — |
| FR-10 | — | FR-24 | C (SM-1) | FR-38 | — | FR-52 | — |
| FR-11 | — | FR-25 | C (SM-1) | FR-39 | — | FR-53 | V-part (SM-6) |
| FR-12 | — | FR-26 | C (SM-1) | FR-40 | — | FR-54 | C (SM-6) |
| FR-13 | — | FR-27 | C (SM-1) | FR-41 | — | FR-55 | V (SM-6) |
| FR-14 | — | FR-28 | C (SM-1) | FR-42 | — | FR-56 | C (SM-6) |

**Totals:** 10 FRs genuinely determined (2 of them only in part) · 15 claimed but
not determined · 31 claimed by nothing. SM-3's "Validates the whole" is what makes
§7 *look* complete; excluded, because a claim that covers everything distinguishes
nothing (see §3).

---

## 3. SM-3 — is it falsifiable? (Q2)

**No, not as written.** "The author holds real Mainnet funds in it and continues to"
fails every leg of a falsifiability test:

- **No start condition.** §10 question 5 admits this outright: "SM-3 is the product's
  only adoption metric and currently has no defined precondition." §9.6 records that
  the product "has not yet held real Mainnet funds" — so the metric is, today,
  *false*, and the document does not treat that as a failure. A metric whose current
  value is "not met" and which nothing is doing about is a wish.
- **No quantity.** One drop of XRP satisfies it as well as a year's savings.
- **No duration and no observation interval.** "Continues to" has no window, so it
  can never be evaluated at a point in time — only retrospectively, and only never
  negatively.
- **No failure condition independent of the author's own will.** The author is both
  the measurer and the measured; withdrawing funds for an unrelated reason registers
  identically to withdrawing them because the wallet lost money. The metric cannot
  distinguish "the product failed" from "the operator changed his mind".
- **Its coverage claim is vacuous.** "Validates the whole" asserts coverage of all 56
  FRs while testing none of them. This is the mechanism by which §7 appears to cover
  the product: 31 FRs have no specific metric, and SM-3 papers over exactly that gap.

Making it falsifiable does not require abandoning it or adding usage metrics. It
requires the three missing scalars and a stated trigger: *a stated minimum amount,
held for a stated period, funded after the manual Testnet pass and a byte-identical
rebuild check (SM-5) both pass, with "removed the funds because of a wallet defect"
named as the failure event.* And the "Validates the whole" line should be deleted —
it is the only line in §7 that reduces the document's measured coverage by existing.

**Severity: high.** Not because the metric is wrong to want, but because its coverage
claim conceals the 31-FR gap found in §2.

---

## 4. Numeric thresholds (Q3)

| Requirement | Threshold(s) | Verdict |
|---|---|---|
| FR-9 | backoff "begins at the third consecutive failed attempt"; re-import "after eight consecutive failures" | **Incomplete, and security-critical.** Three gaps: (a) no backoff *schedule* — "exponential" with no base, multiplier, or cap is unmeasurable, so 1s→2s and 1min→2min both comply; (b) **nothing says what resets the counter** — success presumably does, but reload, app kill, and lock/unlock are unaddressed, and a counter that resets on refresh satisfies the literal text while providing no protection at all; (c) no statement that the count is persisted, which is the same gap from the other side. The boundary itself *is* stated inclusively and unambiguously ("begins at the third", "after eight"), which is more than FR-10 or FR-11 manage |
| FR-10 | 5 min default; 1/5/15/30 configurable | **Boundary stated, trigger not.** The numbers and the option set are complete and testable. "Inactivity" is not defined: which interactions reset the timer, and whether the timer accrues while the app is backgrounded (where it would interact with FR-11) or only while focused. What happens *at* the boundary is clear (it locks); what counts toward it is not |
| FR-11 | 30-second desktop grace window | **Boundary named, both branches ambiguous.** The two arms are classified on different axes — "coarse-pointer devices" (a media query) versus "desktop" (a form factor) — so a touch-screen laptop matches both descriptions and the requirement does not say which wins. Separately: "backgrounding" is not defined (tab hidden? window blur? OS app switch? screen lock?), and the behaviour of a return *inside* the 30 seconds is unstated — does the grace timer cancel, or does the app lock anyway on the next background? |
| NFR-9 / SM-6 | 320px viewport; 200% zoom | **Ambiguous in the way that matters.** NFR-9 lists them as two supported conditions; SM-6 phrases it "at 320px **and** 200% zoom", which reads conjunctively — a ~160px effective viewport that no design passes. Nothing in the PRD settles which reading is binding. Also missing: the browser/UA the measurement is taken in, whether "200% zoom" means page zoom or text-only zoom (materially different tests), and an observable pass criterion for "clipped or unreachable" |
| FR-48 (added) | "while a transaction is in flight" | **A threshold with no units at all,** in the same class as the above. Three candidate boundaries — signed, submitted, and validated-or-expired — give three different products. FR-24 already defines the terminal state precisely and should be cited here |
| FR-56 (added) | "when notices exceed the reserved area" | **A threshold whose value appears nowhere in the PRD.** The reserved height is not stated, so the overflow condition cannot be reached on purpose by anyone working from this document |

Stated consistently and completely enough to test: **none of the four fully.** FR-9's
missing reset rule and NFR-9/SM-6's conjunctive ambiguity are the two that change the
product rather than the test.

---

## 5. Implementation prohibitions vs. observable behaviour (Q4)

Requirements written as constraints on the source code rather than on what the
product does:

| Requirement | The prohibition | Grep- or review-verifiable only? |
|---|---|---|
| NFR-1 | "No `Number()` on a Drops value anywhere" | Yes |
| NFR-2 | no secret in "React state, a store, ... anything that gets stringified", "cleared immediately" | Partly — storage and URL are observable; React state and clearing are not |
| NFR-3 | "goes through a query hook" whose key includes wallet and network | Yes (the *consequence* is stated and is observable) |
| NFR-5 | "`outline-none` is banned" | Yes |
| FR-8 bullet 1 | "fails on the AES-GCM authentication tag, not on an application-level comparison" | Yes |
| FR-42 bullet 1 | "no hand-rolled explorer anchor exists" | Yes |
| FR-1 / FR-2 | "never logged"; fields "never retain plaintext" | Partly |
| NFR-4 / FR-52 | SW caches shell only, "never an RPC response" | No — inspectable; these are fine |

**Verdict: acceptable as record, with one real problem.**

Acceptable, and deliberately so. §0 states this PRD "records the v1 boundary as
built rather than proposing it", and addendum §2 records that NFR-2 and FR-8 exist
because a real defect shipped — any PIN unlocked the app, and each method derived its
own unverified key. A requirement that encodes the shape of a defect that actually
happened is the most valuable kind of entry in a document whose purpose is to be the
record. Rewriting NFR-1, NFR-2, NFR-5 and FR-8 as pure behaviour statements would
delete the reasoning that makes them load-bearing. Do not do that.

The problem is narrower and worth stating exactly: **these requirements are
grep-verifiable, not product-verifiable, so a downstream test plan derived from this
PRD yields zero tests for them — while SM-4 claims the four gates already cover
them.** That combination is what turns an acceptable record entry into a coverage
illusion. Two consequences follow:

1. SM-4's "Validates the cross-cutting NFRs" is unsupported (see §2), and SM-C3
   already warns, in this same document, that gate count is not verification. §7
   contradicts its own counter-metric.
2. The fix is additive, not subtractive: each of these should carry **its observable
   consequence alongside** the prohibition. NFR-1 → "no displayed amount differs from
   the ledger value at any magnitude, including above 2^53 drops". NFR-5 → "every
   focusable element shows a visible focus indicator in both themes". FR-8 → "no
   configured Unlock Method admits a wrong credential, and a method that did not
   encrypt the seed still unlocks" (the second clause is the actual defect from
   addendum §2, and no current FR states it). FR-42 → keep clause 1 as the
   code-review rule it is, and let clause 3 carry the test.

---

## 6. Findings, by severity

**F-1 — CRITICAL — §7 claims coverage it does not have; 31 of 56 FRs have no
metric, and SM-3 conceals it.** SM-1, SM-2, SM-4 and SM-6 are stated as FR *ranges*
rather than as the properties they actually measure, so 15 further FRs are claimed
by a metric that cannot determine them. Only ~10 FRs are genuinely determined. Whole
features — Onboarding, Trust Lines, Network Selection, Address Book, and all of App
Versioning bar FR-50 — are unmeasured. SM-3's "Validates the whole" is the line that
makes the total look complete. Fix: restate each metric's claim as the property it
tests, delete "Validates the whole", and let the uncovered set be visible. Coverage
does not have to be complete; it has to be honest, which is this product's own
stated standard (§1).

**F-2 — CRITICAL — FR-9 does not say what resets the failure counter, or that it
persists.** The only anti-brute-force requirement in a document for a wallet holding
real funds. A conforming implementation whose counter resets on reload provides no
protection, and SM-2 does not test FR-9 at all, so nothing in the document would
catch it. This is the same class of defect as addendum §2 — a security property that
looked satisfied and was not.

**F-3 — HIGH — SM-4's "Validates the cross-cutting NFRs" is unsupported, and
contradicts SM-C3.** Of nine NFRs, the four named gates reach one half of one
(NFR-6's contrast check). NFR-2, NFR-7, NFR-8 and NFR-9 are not gateable by them at
all; §6.2 and addendum §5 already record NFR-9's checks as manual and partly
emulated. The document's own counter-metric SM-C3 warns against exactly this reading.

**F-4 — HIGH — SM-3 is not falsifiable: no amount, no duration, no start condition
(§10 Q5 admits this), and no failure event the author's own choice cannot produce.**
It is a status statement, and §9.6 records its current value as false.

**F-5 — HIGH — FR-21 and FR-45 have no authoritative criterion anywhere.** §4.11 and
addendum §7 both record that the Address Book ships with no epic file and is absent
from `docs/user-stories/INDEX.md`, the document §0 names as authoritative. FR-45
specifies no fields, scoping, or lifecycle; FR-21's "first time" is therefore
undefined — and FR-21 is a *safety* warning on the send path. The drift is correctly
reported; the untestability of a send-path safeguard is the part that should not wait
for the repair.

**F-6 — MEDIUM — Six requirements name a threshold without naming its boundary
behaviour or its unit:** FR-9 (reset/persistence/schedule), FR-10 ("inactivity"),
FR-11 (branch axes mismatched; "backgrounding"; return-inside-grace), NFR-9 vs. SM-6
(320px *and* 200%, or 320px *at* 200%?), FR-48 ("in flight"), FR-56 (reserved height
never stated). See §4.

**F-7 — MEDIUM — Six requirements are source-code prohibitions rather than product
behaviour** (NFR-1, NFR-2, NFR-3, NFR-5, FR-8 b1, FR-42 b1). Appropriate as record
— they encode the addendum §2 defect — but they generate no tests, which is only a
problem *because* SM-4 claims otherwise (F-3). Fix additively: state the observable
consequence alongside each. See §5.

**F-8 — MEDIUM — the confirm-step family is inconsistent.** FR-20 enumerates its
required content (destination, exact amount, fee) and is fully testable. FR-3, FR-13
and FR-33 say only "an explicit confirm step stating the consequence", and NFR-7
generalises the vagueness without enumerating which actions are irreversible. Four
irreversible-action requirements, one testable. FR-20 is the template.

**F-9 — LOW — "distinct" and "unmistakable" carry weight they cannot bear**: FR-22
(validated vs. submitted), FR-29 (balance vs. spendable), FR-39 (Mainnet). All three
are load-bearing for §1's "the amount signed is the amount intended", and all three
would be testable by naming the discriminator — for FR-22 and FR-39, NFR-6 already
supplies the non-colour half of the answer and only needs citing.

**F-10 — LOW — FR-44's heading and its bullet state different tests** ("reachable"
vs. "read in full by keyboard alone"), and FR-5's "without a pointer" uses "pointer"
in the input-device sense in a document where the word otherwise means a link. Both
are one-line fixes.

**F-11 — LOW (structural, informational) — the link-out means ~half the FRs are not
self-contained.** This is §0's stated and settled design, and judging it otherwise
would be reviewing the decision rather than the text. Recorded only so the ruling
behind this review's classifications is explicit: every row above was judged against
the PRD plus its named pointer, and UNTESTABLE was reserved for the three FRs and
three NFRs with no criterion at either end of a pointer.

---

## 7. What is strong

Stated because a testability review that lists only gaps misrepresents the document.
**FR-24** is the best-written requirement here: it names the state, the trigger, the
copy, and the forbidden alternative (never blind-resubmit the same blob). **FR-50**
is exactly falsifiable. **FR-20**, **FR-25**, **FR-55** and **NFR-6**'s gate clause
each name a mechanism precise enough to fail. The counter-metrics SM-C1–C3 are
unusual and correct — SM-C3 in particular is the argument this review used against
SM-4. And §11's assumptions index plus §10's open questions mean several of the gaps
above (Q5 on SM-3, the Address Book drift) were already found by the author and are
recorded rather than hidden; that is the property that made them reviewable at all.
