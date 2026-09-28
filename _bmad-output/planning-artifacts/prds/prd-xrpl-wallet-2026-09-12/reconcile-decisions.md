# Input reconciliation — `docs/decisions.md` vs. `prd.md` + `addendum.md`

**Input:** `/home/otavio/xxx/xrpl-wallet/docs/decisions.md` (1267 lines, §1–§11)
**Targets:** `prd.md` (FR-1..FR-56, NFR-1..NFR-9), `addendum.md`
**Date:** 2026-09-15

Method note: this repo's rule is *link, don't restate*. Absence of text is not a
finding. A finding here is one of: (a) a guardrail or enforced pattern with no
NFR/FR and no pointer, (b) an NFR/FR that **contradicts** decisions.md, (c) a
wrong or missing cross-reference, (d) an open/settled mismatch.

Coverage of §3 and §4 was checked bullet by bullet. Eight of ten §3 guardrails
and eight of ten §4 patterns map cleanly to an NFR or FR; those are not listed
below. The findings are the residue.

---

## F-1 — NFR-2 contradicts §4's explicit `vaultKey` carve-out

**Severity: critical**

**decisions.md says** (§4, bullet 4): "No secret ever enters React/store state,
the URL, or anything serializable" — and then carves out, at length, one
exception: a `CryptoKey` imported **non-extractable** *may* be held in session
state (`app-store.ts`'s `vaultKey`) and written to the IndexedDB `session`
store, because it is a handle the browser will not export bytes for. The bullet
names the files (`src/store/app-store.ts`, `src/lib/crypto/db.ts`), explains the
lazy-expiry window ("auto-lock minutes of inactivity, with deletion on the next
read or lock", accepted as such), and closes with an instruction in the
imperative: **"Do not 'fix' `vaultKey` by removing it."**

**The PRD says** (NFR-2): "No secret enters `localStorage`, React state, a
store, the URL, or anything that gets stringified — including in development
builds. Decrypted key material exists transiently in memory for signing and is
cleared immediately."

**Why this is a defect, not a summary.** NFR-2 states the absolute form with no
carve-out and no pointer to §4's bullet. A downstream story or architecture pass
reading NFR-2 literally would file the removal of `vaultKey` from the store and
from the IndexedDB session store as an NFR-2 violation — the exact change §4
forbids by name. The two sentences also disagree on lifetime: NFR-2 says key
material is "cleared immediately" after signing; §4 records a handle that
deliberately survives across the auto-lock window and can sit in IndexedDB past
its expiry until the next read or lock.

The absolute phrasing is inherited from `CLAUDE.md`'s never-negotiable list,
which states the rule without the carve-out — so this is a mechanical
inheritance, not a judgement call. `decisions.md` is authoritative and carries
the exception.

**Suggested disposition.** Add one clause to NFR-2 and stop: "...anything that
gets stringified. The single recorded exception — a non-extractable `CryptoKey`
handle in session state — and its accepted expiry window are in
`docs/decisions.md` §4." Do not restate the reasoning.

---

## F-2 — §8's own citation is wrong for NFR-5, NFR-6 and NFR-9

**Severity: high**

**The PRD says** (§8 preamble): "Each exists because it is a known failure mode
on this stack. Reasoning and the full guardrail list: `docs/decisions.md` §3 and
§4."

**decisions.md says.** §3 and §4 were read in full. Neither contains anything
about the focus indicator, colour, contrast, the contrast harness, viewport
width, or zoom. The actual homes are:

| NFR | PRD points at | Reasoning actually lives in |
|---|---|---|
| NFR-5 — nothing styles `:focus` | §3/§4 | **§6.3** ("The focus indicator is the browser's, not ours"), incl. the revised rule wording |
| NFR-6 — colour never alone; `check:contrast` is the gate | §3/§4 | **§6.2** (fill vs. text token roles) and **§7.5** (the harness) |
| NFR-9 — 320px and 200% zoom are supported conditions | §3/§4 | **§6.8**, **§6.9**, **§7.2**, **§9.5** |

NFR-7 and NFR-8 *are* in §4/§3.9, so the preamble is right for six of nine and
wrong for three.

**Why this matters.** The PRD's entire method is that a reader follows the link
instead of trusting the summary. A reader who follows this one for NFR-5/6/9
finds nothing, and the most likely conclusion is that the NFR was invented here
rather than recorded there — which is precisely the inverse of the truth.

**Suggested disposition.** Split the preamble citation: "§3 and §4 for NFR-1
through NFR-4, NFR-7 and NFR-8; §6.2, §6.3, §7.5 and §6.8/§6.9/§7.2 for NFR-5,
NFR-6 and NFR-9."

---

## F-3 — NFR-6 overstates the contrast harness's coverage

**Severity: medium**

**decisions.md says** (§7.5): `scripts/check-contrast.mjs` covers "**25 pairs
per theme** (50 total)" — an enumerated, hand-maintained list, named pair by
pair. The section's whole point is that coverage is *not* automatic: "A new token
that the harness does not measure is a token outside the rule — and the most
consequential control in the app (the one that spends) would have been the
unmeasured one. Adding a token to `index.css` without adding its pairs here is
incomplete work."

**The PRD says** (NFR-6): `check:contrast` "evaluates **every pair the app
renders** in both themes, alpha composites included, and exits non-zero on
failure."

**Why this is a defect.** "Every pair the app renders" claims exhaustiveness the
harness does not have and §7.5 explicitly denies. The alpha-composite and
non-zero-exit halves are accurate. The risk is directional: a downstream reader
concludes contrast is covered by construction and drops the §7.5 obligation to
extend the harness whenever a token is added — which is the one failure mode
§7.5 exists to prevent.

**Suggested disposition.** Reword to "evaluates the enumerated token pairs in
both themes, alpha composites included, and exits non-zero on failure. Adding a
token without adding its pairs is incomplete work (`docs/decisions.md` §7.5)."

---

## F-4 — §8.11's hard precondition contradicts Open Question 5's "nothing else is"

**Severity: high**

**decisions.md says** (§8.11, "Accepted risk: production ships on a
`*.b-cdn.net` origin"): IndexedDB — where the encrypted vault lives — is
origin-scoped, so moving production to a custom domain later is a *new origin*:
"no vault, no wallets, and every user must re-import from seed," and the old
origin "keeps serving a working-but-frozen wallet until the site is deleted,
which is the stale-shell failure arriving from a direction guardrail #6 does not
cover." The risk is accepted *only* on the ground that the author is currently
the only user. It then states a precondition in bold: "**This must be resolved
before anyone else is invited to use it.** ... Treat 'attach the final
production hostname' as a prerequisite of that step, not a later improvement."
Plus an operational rule: "never install the staging site as a PWA and never put
Mainnet funds in it."

**The PRD says.** §9.3 covers the CDN-in-the-path tension and cites CD-6 and
§8.10's reasoning — correctly. But §8.11 appears nowhere: not in §9.3, not in
§9.4 Platform, not in the `addendum.md` §4 residual-risk list (which carries
CD-6, the account-wide credential, and the `max-age=0` assets — three of four),
and not in §10. Meanwhile PRD §10 Open Question 5 asks what triggers first real
Mainnet funding and answers: "The manual Testnet pass is a stated prerequisite;
**nothing else is**."

That last clause is contradicted by the record. §8.11 states a second
prerequisite for the adjacent step (inviting anyone else), and the origin
question bears directly on funding decisions because the mitigation for a future
migration *is* the mandatory seed backup in FR-3.

**Suggested disposition.** Two one-line edits. Add §8.11 to `addendum.md` §4's
residual-risk list as a fourth bullet (pointer only). Amend OQ5 to name the
hostname prerequisite and cite §8.11, replacing "nothing else is".

---

## F-5 — Guardrail #5 (array index as React key) has no NFR, no FR, and no pointer

**Severity: medium**

**decisions.md says** (§3, guardrail 5): "Never use array index as the React
`key` for lists that can reorder or filter (transaction history, trust lines).
Use the transaction hash or `currency+issuer` instead — index-as-key ... causes
row state to stick to the wrong item after a list update, **e.g. after switching
wallets or networks**."

**The PRD says.** Nothing. NFR-3 looks adjacent but is not: NFR-3 scopes the
*query key* so a switch cannot leave stale data on screen. Guardrail #5 is about
*component identity* — the data can be correct and the row state still be
attached to the wrong row. The consequence is money-adjacent and user-visible
(an expanded transaction detail, or a trust-line row's controls, bound to the
wrong entry after a wallet switch), and it touches FR-14, FR-35, FR-36 and
FR-37.

This is distinguishable from two other §3 guardrails that are also unrepresented
but are pure implementation discipline, adequately served by §8's wholesale
pointer to §3/§4: guardrail #2 (never suppress `react-hooks/exhaustive-deps`)
and guardrail #8 / §4's shadcn bullet (never blind-regenerate a customised
primitive; edit `components/ui/*` in place). Those two are **low** and arguably
no finding at all — they constrain how code is written, not what the product
must do. Guardrail #5 has a product-visible failure mode and belongs in the
requirement view.

**Suggested disposition.** Either add a sub-bullet under FR-14 ("row identity is
keyed by transaction hash or `currency+issuer`, never list index — see
`docs/decisions.md` §3.5") or add it as a tenth NFR. One line either way.

---

## F-6 — §5 is cited by neither artifact, and §5.6 is a user-visible decision the PRD omits entirely

**Severity: medium**

**decisions.md says** (§5.6, "Holder trust lines are created with
`tfSetNoRipple`"): `submitTrustSet` sets `tfSetNoRipple`, because "Without
NoRipple on the holder side, a holder's balance can shift as a side effect of
unrelated payments between other parties — an unexpected-balance-change vector
for a self-custody wallet."

**The PRD says.** FR-31 ("Create a Trust Line") states only that the user can
open a Trust Line and that the Owner Reserve cost is stated first. Nothing in
`prd.md` or `addendum.md` cites §5 at all — `addendum.md` §1 points at §1/§2/§3/§4,
and §3/§4 of the addendum point at §2, §6.5, §8, §9, §10, §11. §5 is the one
numbered top-level section neither file references.

Most of §5 is nonetheless *reflected* and therefore fine: §5.1 → FR-11
(immediate mobile lock, 30s desktop grace), §5.2 → §5 Non-Goals (Web Push),
§5.5 → FR-23's "failed *and* consumed its fee" bullet, §5.7 → §3 glossary and
the §11 assumption on reserve figures. §5.3 (IndexedDB not localStorage) and
§5.4 (`queryClient.fetchQuery` for pre-flight reads) are architecture-layer and
are adequately served by `addendum.md` §1's "belongs to architecture" list.

§5.6 is the exception: it is a flag on a transaction the user submits, with a
stated consequence for the balance the user reads (SM-1's whole subject), and it
is neither reflected nor pointed to.

**Suggested disposition.** Add `tfSetNoRipple` as a sub-bullet of FR-31 with a
pointer to §5.6, and add §5 to `addendum.md` §1's pointer line so the section
stops being orphaned.

---

## F-7 — Open/settled status: no mismatch found; the PRD gets this right

**Severity: none (verified, recorded for completeness)**

Checked in both directions.

- `decisions.md` records nothing as open. §5's preamble ("Each was decided rather
  than left open") and §6's ("As in §5, each was decided rather than left open")
  are explicit; a grep for open/unresolved/undecided/TBD across all 1267 lines
  returns only those two disclaimers and one conditional revisit (§5.2, "Revisit
  only if a backend is introduced for other reasons").
- V1–V4 and N1–N4: `decisions.md` §10's preamble states V1–V4 "were already
  decided ... 2026-09-02 during S15", and §9 records N1–N4 as decided. The PRD
  treats both sets as settled and files the stale "Open decisions" tables in the
  epic files as drift (`prd.md` §10 OQ6, `addendum.md` §7). Correct.
- The five accepted risks and unverifiables `decisions.md` carries as *accepted*
  rather than open (§8.10's four unmitigated items, §8.11) are matched by
  `prd.md` §9.3 / §10 and `addendum.md` §4/§5 — except §8.11, which is F-4.

---

## F-8 — Two items checked and dropped

**Severity: none**

Recorded so they are not re-filed by the next pass.

- **§6.1 (dark mode switches on `prefers-color-scheme` only; no toggle, no
  persisted preference).** Initially a candidate omission — the PRD's only
  mention of themes is NFR-6's "in both themes". Dropped: `DESIGN.md` carries the
  rule twice (line 223 and the explicit "**Don't** add a `.dark` class or a theme
  toggle" at line 459), the PRD names `DESIGN.md` authoritative for the visual
  system in §0, and §9 deliberately carries no visual requirements. The pointer
  exists; the PRD is correct not to restate it.
- **`prd.md` §10 OQ1 (dashed outline on the empty notice band).** §9.3 decided
  the *quiet state* — an unlit plate, no ghost of the previous notice — which is
  a different question from whether the reserved band is visibly delineated at
  320px. `docs/sprints/mobile-chrome-sprints.md` lines 188–191 do raise the
  outline question and do not answer it, so OQ1's citation is accurate. At most
  a cosmetic improvement would be to also cite §9.3 as the adjacent decision.

---

## Citation verification table

Every `docs/decisions.md` section number referenced by either artifact, with the
artifact that references it. Note that most of the numbered citations are in
`addendum.md`, not `prd.md`.

| Cited § | Cited by | Exists? | decisions.md section title | Cited for | Verdict |
|---|---|---|---|---|---|
| §1 | `addendum.md` §1 | Yes (L7) | Technical Decisions (stack) | The stack: React 19/Vite/Tailwind/shadcn-in-repo/xrpl.js, PWA, no backend | **Correct.** Every stack claim in addendum §1 is in §1. |
| §2 | `prd.md` §0, §4.11, §11; `addendum.md` §1, §3 | Yes (L19) | Product decisions (resolving the gaps from the prior review) | Address Book as a new epic; Web Push deferral; fiat-display deferral; user-editable endpoints deferral | **Correct on all four.** §2's table carries "Address book — Yes, add as a new epic", "Background payment notifications — Deferred", "Fiat-equivalent balance display — Explicitly deferred", "Custom/failover RPC endpoints — v1 ships one hardcoded ... plus one hardcoded backup". |
| §3 | `prd.md` §8; `addendum.md` §1 | Yes (L40) | Guardrails — known AI-authoring failure modes in this stack | "the full guardrail list" behind NFR-1..NFR-9 | **Partly wrong — see F-2.** Correct for NFR-1/2/3/4/8; §3 carries nothing on focus, colour or viewport (NFR-5/6/9). |
| §4 | `prd.md` §4.2, §8; `addendum.md` §1, §2 | Yes (L57) | Enforced patterns / harness (always — no exceptions) | The unlock wrap/unwrap mechanism (FR-8); "final bullet" for the unlock defect; enforced patterns behind the NFRs | **Correct for §4.2 and addendum §2** — the unlock decision *is* §4's final bullet, verbatim including the "caught live during testnet validation" account. **Same partial failure as above for §8's NFR-5/6/9.** Also the source of the F-1 contradiction. |
| §5 | *nobody* | Yes (L72) | Decisions made during the 2026-09-01 bug-fix sprints | — | **Orphaned — see F-6.** Reflected but never pointed at; §5.6 is neither. |
| §6.5 | `addendum.md` §3 | Yes (L303) | Errors never auto-dismiss, and state changes are announced | sonner "removed and replaced by the store-backed Annunciator" | **Correct.** §6.5 establishes the per-type rule in `notify.tsx` and states in terms that it "held even while the renderer was a third-party toast library (see §9 for the S16 annunciator rework that replaced it)". |
| §8 | `addendum.md` §4 | Yes (L591) | Decisions made during the 2026-09-02 CI/CD sprints (S13–S15) | Three protected branches, `promotion-source`, four CI gates, deploy from CI to bunny.net, static release manifest, byte-identical rebuilds | **Correct.** Maps to §8.4 (branches), §8.12 (four parallel jobs), §8.13 (pinned CLI deploy), §8.9 (manifest on own origin), §8.6 (reproducible build). |
| §9 | `addendum.md` §3, §4 (as part of "§8, §10, §11" run-on) | Yes (L885) | Decisions made for the 2026-09-02 notice annunciator sprints (S16–S17) | The annunciator replacing sonner | **Correct.** |
| §9.5 | **neither artifact** | Yes (L970) | Visual verification found two real defects; both are fixed | — | **Not actually cited.** The task brief lists §9.5 as a PRD citation; `grep` finds no reference to it in `prd.md` or `addendum.md` (the only "§9.5" in `prd.md` is its *own* §9.5, "Licence and Naming"). `CLAUDE.md` is what cites decisions.md §9.5. No defect — but no coverage either: §9.5 is the source for NFR-9's 320px/1440px + `640×400`-standing-in-for-200%-zoom evidence, which is where F-2 would ideally point. |
| §10 | `addendum.md` §4 | Yes (L1008) | Completing the app-versioning epic (2026-09-02) | Grouped under "Delivery, CI/CD, and residual risks" | **Correct but loosely aimed.** §10 is implementation notes for US-2/4/5/6/8/9, not delivery mechanics; its load-bearing content for the PRD is the SHA-keyed decline and the single-choke-point in-flight flag behind FR-48, which is where a precise citation would sit. Not a wrong reference. |
| §11 | `addendum.md` §4 | Yes (L1180) | The `promotion-source` check enforced a name, when it meant an invariant | The `promotion-source` check "enforcing tree equality rather than a branch name" | **Correct.** §11 is exactly that post-mortem and its resolution. |
| §6 (whole) / §7 (whole) | neither | Yes (L171, L441) | Interface sprints; visual-world replacement | — | Not cited by number. Acceptable in principle — `DESIGN.md` is the PRD's authority for the visual system — **except** for NFR-5, NFR-6 and NFR-9, whose reasoning lives here and which §8 mis-attributes to §3/§4 (F-2). |

---

## Summary of dispositions

| # | Severity | Fix | Edit size |
|---|---|---|---|
| F-1 | critical | Add the `vaultKey` carve-out clause (or a §4 pointer) to NFR-2; drop or qualify "cleared immediately" | 1 clause |
| F-2 | high | Split §8's preamble citation: §3/§4 for NFR-1..4/7/8; §6.2, §6.3, §7.5, §6.8/§6.9/§7.2/§9.5 for NFR-5/6/9 | 1 sentence |
| F-4 | high | Add §8.11 to `addendum.md` §4's residual risks; amend OQ5 to drop "nothing else is" and name the hostname prerequisite | 2 lines |
| F-3 | medium | Reword NFR-6 from "every pair the app renders" to the enumerated-pairs form, citing §7.5 | 1 sentence |
| F-5 | medium | Row identity keyed by hash / `currency+issuer`, never list index — sub-bullet under FR-14 citing §3.5 | 1 line |
| F-6 | medium | `tfSetNoRipple` sub-bullet under FR-31 citing §5.6; add §5 to `addendum.md` §1's pointer line | 2 lines |
| — | low | Guardrail #2 (`exhaustive-deps`) and guardrail #8 / §4's shadcn-in-place bullet are unrepresented but are implementation discipline; §8's wholesale pointer to §3/§4 is adequate. No action required. | — |
| F-7, F-8 | none | Verified correct; recorded so they are not re-filed | — |

No open/settled mismatch exists in either direction. The PRD's treatment of
V1–V4 and N1–N4 as settled-with-drift-reported is accurate.
