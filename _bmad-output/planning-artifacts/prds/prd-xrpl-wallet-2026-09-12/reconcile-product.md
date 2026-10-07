# Input reconciliation — `PRODUCT.md` against `prd.md` + `addendum.md`

Run folder: `_bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/`.
Date: 2026-09-15.

**Method and the standard applied.** The PRD deliberately does not restate the
record; it links to authoritative documents instead, and that is a hard repo
rule. So "the PRD does not contain PRODUCT.md's text" is not a finding here. A
finding is one of three things: (a) a requirement-relevant fact or commitment in
`PRODUCT.md` that the PRD neither states nor points at, (b) something the PRD
states *differently* from `PRODUCT.md`, or (c) a scope classification where the
PRD's §5 Non-Goals / §6 MVP Scope does not match what `PRODUCT.md` treats as
in-, out-of-, or deferred scope.

Four findings, ranked. Two are material (high). Two are medium. A short section
of low-severity notes at the end records drift that lives on the `PRODUCT.md`
side and needs no PRD change.

**On the authority question: no conflict.** `PRODUCT.md` does not claim
authority over anything the PRD assigns elsewhere. It explicitly *defers* —
§ Capabilities and Constraints says "the functional contract is recorded in
`docs/user-stories/INDEX.md` … and the technical contract in `docs/decisions.md`.
Both are authoritative", and labels its own scope and constraint lists "In
summary". § Brand Commitments similarly cedes the visual system to `DESIGN.md`
("binding … derived from the shipped build"). That is exactly the division
`prd.md` §0 encodes. The one axis on which `PRODUCT.md` *is* the sole authority
and the PRD's §0 table assigns to nobody is accessibility — which is Gap 1.

---

## Gap 1 — The WCAG 2.2 AA conformance commitment is neither stated nor assigned

**Severity: high.**

**What `PRODUCT.md` says.** § Accessibility & Inclusion opens with a named
standard, framed as forward-binding rather than descriptive: "**Standing
commitment: WCAG 2.2 AA.** Not current practice — a requirement every future
surface is held to." The section then lists eight specific obligations under it.

This is not a dormant aspiration. Three other documents in the repo treat it as
the live conformance target and name `PRODUCT.md` as its home:

- `docs/agents/shipping-and-ci.md:66` — `check:contrast` "turns the WCAG 2.2 AA
  commitment in `PRODUCT.md` into something a PR cannot [skip]".
- `docs/sprints/cicd-sprints.md:48` (CD-2) — "`check:contrast` in particular is
  the sole enforcement of the WCAG 2.2 AA commitment recorded in `PRODUCT.md`".
- `README.md:68` — the same commitment, described as "enforceable rather than
  aspirational".

**What the PRD says or omits.** `prd.md` §8 enumerates the mechanical
consequences — NFR-5 (`:focus` unstyled, `outline-none` banned), NFR-6 (colour
never alone, `check:contrast` as the gate), NFR-8 (keyboard + screen-reader pass
per bespoke component), NFR-9 (320px and 200% zoom) — and §9.1 carries the
`aria-disabled`-with-visible-reason rule. The *standard itself is never named*,
in §8 or anywhere else in `prd.md` or `addendum.md`. Nor is it pointed at: §0's
authority table gives `PRODUCT.md` "Product purpose, users, positioning,
principles, brand, licence" — accessibility is on no row — and `DESIGN.md`'s row
is the visual system (tokens, panel vocabulary), not a conformance target. §8's
own preamble points only at `docs/decisions.md` §3 and §4.

That pointer was checked. `docs/decisions.md` §3 (guardrails 1–10) and §4
(enforced patterns) contain the focus, contrast-gate, and per-component-a11y-pass
rules, but **not** the standard, and **not** two of `PRODUCT.md`'s named
obligations:

1. **"Motion, if introduced, arrives with a `prefers-reduced-motion` guard."**
   This rule exists in the repo only in `PRODUCT.md:259`, `docs/decisions.md`
   §6.10 (outside the §3/§4 the PRD points at), and
   `docs/agents/ui-and-design-system.md:52` (a document §0 does not list — see
   Gap 4). The PRD carries no NFR for it. Since the PRD is written for
   downstream epic, story, and UX work, and `src` currently has no guard
   anywhere (decisions §6.10), the first future surface that introduces motion
   has no requirement to satisfy.
2. **The contrast *remediation* rule.** `PRODUCT.md`: "A failing pair is reported
   and fixed with a token for the missing role — never silently repainted, and
   never by borrowing a token whose value merely looks right." NFR-6 specifies
   the gate but not how a failure is to be resolved — which is the half that
   stops the gate being satisfied by a cosmetic edit.

**Why this matters.** The consequence-list is not a substitute for the target. A
downstream planner reading the PRD as "the consolidated requirement view" can
satisfy every NFR in §8 and still ship a surface that fails WCAG 2.2 AA on a
criterion §8 does not happen to enumerate, because no document in the PRD's
authority table claims the standard.

**Suggested disposition.** Two edits, both small, neither a restatement:

- Add a row to §0's table: `PRODUCT.md` is also authoritative for the
  accessibility commitment (or name § Accessibility & Inclusion explicitly in
  the existing row).
- Add to §8 one NFR naming the target — "NFR-0 — Conformance target is WCAG 2.2
  AA (`PRODUCT.md` § Accessibility & Inclusion); NFR-5 through NFR-9 are the
  enforced subset, not the whole of it" — plus an NFR for the
  `prefers-reduced-motion` guard, and one clause on NFR-6 for the
  fix-with-a-token-for-the-missing-role remediation rule.

---

## Gap 2 — Fiat-equivalent balance display is promoted from "deferred" to a permanent non-goal

**Severity: high.** This is a scope contradiction, not an omission.

**What `PRODUCT.md` says.** § Capabilities and Constraints keeps three distinct
tiers, and the middle one is deliberately not permanent:

- "**Out of scope, permanently — this is not an exchange.** Token swaps or any
  DEX trading UI, fiat on/off-ramp, staking or yield or lending, KYC/AML,
  custodial recovery, shared or omnibus addresses."
- "**Deferred, and recorded as deferred rather than silently absent.** Checks,
  Escrow, Payment Channels, multi-signing and regular-key rotation (all real
  XRPL features, each its own future epic); **fiat-equivalent balance display
  (would add a price-oracle dependency)**; Web Push for incoming payments
  (impossible without a backend — see Positioning); user-editable custom RPC
  endpoints."

Only Web Push is marked permanent, and that marking is made in § Positioning
("it is why background push notifications are recorded as permanently deferred
rather than planned"), on the architectural ground that a backend would have to
exist. No sentence in `PRODUCT.md` marks fiat-equivalent display permanent.

**What the PRD says.** `prd.md` §5 files it under "**Permanently deferred for
architectural reasons, not absence of effort**", alongside Web Push:
"**Fiat-equivalent balance display.** It would add a price-oracle dependency and
a third party with a view of what the user holds."

Two distinct divergences:

1. **The classification moved.** Of the four items in `PRODUCT.md`'s deferred
   tier, three land in the PRD's §6.2 *Out of Scope for MVP* (Checks/Escrow/
   Payment Channels; multi-sig and regular-key rotation; user-editable RPC
   endpoints) — the correct home for a deferral. Fiat display alone was lifted
   into §5, which the PRD heads "Non-Goals (Explicit)" and opens "will not
   become one". The asymmetry is the evidence: the same source tier was split,
   and only this item was made permanent.
2. **The rationale grew.** "A third party with a view of what the user holds" is
   a privacy argument that appears nowhere in `PRODUCT.md`'s justification
   (which is solely the dependency) and nowhere in `docs/decisions.md` §2, the
   authority `addendum.md` §3 cites for it. It is a plausible inference, and it
   is what would make the deferral permanent — but it is new reasoning
   introduced by the PRD, unmarked, in a section whose whole function is to be
   final.

Note that `addendum.md` §3 lists it as plain "Deferred — adds a price-oracle
dependency", matching `PRODUCT.md`. So `prd.md` §5 also disagrees with its own
companion file.

**Why this matters.** §5 and §6.2 mean different things downstream. §6.2 items
are revisitable post-v1; §5 items are closed, and a future request for a fiat
column would be refused on the strength of this line. A deferral hardened into a
prohibition without the decision being taken is exactly the class of silent
scope change `PRODUCT.md` Principle 4 exists to prevent.

**Suggested disposition.** Pick one, explicitly, and record it — do not leave
the two documents disagreeing:

- **Demote in the PRD (lower-risk):** move fiat-equivalent display from §5 to
  §6.2 with the price-oracle reason, matching `PRODUCT.md` and `addendum.md` §3;
  or
- **Promote in `PRODUCT.md`:** if the privacy argument is in fact the maintainer's
  position, add it to `PRODUCT.md`'s permanent tier with that reasoning recorded
  as a dated decision, the way Web Push's permanence is recorded in
  § Positioning — then the PRD is correct as written.

Either way, mark the privacy rationale's origin, or drop it.

---

## Gap 3 — "Assume literacy" is carried only in its positive half; the prohibition is dropped

**Severity: medium.**

**What `PRODUCT.md` says.** § Users states a two-sided design constraint, and the
restrictive side is emphatic: "The consequence for every future surface:
**assume literacy, optimize for precision and speed.** XRPL vocabulary … is the
user's own vocabulary and is used directly rather than softened into analogy.
Explanation earns its place only where the ledger's behaviour is genuinely
surprising or where money is at stake — the exact amount a reserve locks, what a
frozen trust line prevents, whether a failed transaction still consumed its fee.
**Nowhere else.**" Product Principle 2 restates it: "Spend words only where the
ledger surprises or where money is irreversibly at stake."

**What the PRD says or omits.** `prd.md` §2.2 Non-Users carries the *vocabulary*
half — "Anyone being taught custody. XRPL vocabulary … is used directly, not
softened into analogy" — and §9.1 carries the escape clause ("where clarity and
brevity conflict, clarity about consequence wins"). The budget half — explanation
is permitted *only* at surprise or money-at-stake, and nowhere else — has no
home. §9.1 read alone argues the opposite direction: more clarity is always
better. The counter-metrics, which would be the natural place for a "do not add
this" instruction, cover confirmation-step count (SM-C1), perceived read speed
(SM-C2), and gate count (SM-C3) — none of them explanatory copy, and SM-C1 is
close to the inverse concern.

This *is* pointed at: §0's table gives `PRODUCT.md` "users" and "principles",
and §1 closes "Full positioning, principles, and the reasoning behind each:
`PRODUCT.md`". So it is not lost from the record. What is lost is any
requirement-shaped form of it — which matters because the PRD's stated purpose
is to be the input to epics, stories, and UX, and a copy-writing constraint
phrased only as a *non-user* reads as an audience note rather than a rule about
what may be written on a surface.

**Suggested disposition.** Add one counter-metric, which is the cheapest correct
shape and the section that already exists for "do not optimize" instructions:
**SM-C4 — Do not optimize for explanatory copy.** Explanation earns its place
only where the ledger surprises or money is irreversibly at stake
(`PRODUCT.md` § Users, Principle 2); added elsewhere it is a defect, not polish.
Cross-reference it from §9.1 so the clarity-wins clause is read as scoped to
consequence, not as licence to explain everywhere.

---

## Gap 4 — §0's authority table is closed at four documents and omits `docs/agents/`

**Severity: medium.**

**What the record says.** The repo's entry point, `CLAUDE.md`, lists **five**
documents to read before starting, and puts `docs/agents/INDEX.md` first and
unconditionally — "how to behave — per-scenario do/never rules, and the
anti-patterns this repo has actually hit … **always, first**". It also lists
`docs/sprints/` as authoritative for what is planned but not built.
Notably, `CLAUDE.md` does **not** list `PRODUCT.md` at all.

`PRODUCT.md`'s own obligations partly live in `docs/agents/`: the
`prefers-reduced-motion` rule is enforced at
`docs/agents/ui-and-design-system.md:52`, and the manual-verification discipline
that `PRODUCT.md` § Evidence and Principle 4 depend on is
`docs/agents/verifying-your-work.md`.

**What the PRD says or omits.** `prd.md` §0 states "**Four** documents are
authoritative and this PRD links to them rather than copying them" and tables
`PRODUCT.md`, `docs/user-stories/INDEX.md` + epics, `docs/decisions.md`, and
`DESIGN.md`. `docs/agents/` appears nowhere in `prd.md`. `addendum.md` §5 does
cite `docs/agents/verifying-your-work.md` once, in the manual-verification list
— so the pointer exists, but only in the companion file and only for one of the
several documents in that directory, and `addendum.md` is explicitly scoped to
"depth that belongs to architecture".

The phrasing is the problem more than the omission: "Four documents are
authoritative" is a closed enumeration, asserted in the document that downstream
planners are told to treat as the consolidated requirement view. A planner
working from `prd.md` §0 would not know that the repo's own entry point sends
them to a fifth document first — and that document is where several of
`PRODUCT.md`'s commitments are actually enforced (feeding Gap 1).

**Suggested disposition.** Change "Four documents are authoritative" to name the
set as *the documents this PRD draws requirements from*, and add a row for
`docs/agents/INDEX.md` — authoritative for how work is carried out in this repo
(per-scenario do/never rules, verification discipline), per `CLAUDE.md`. One row
and one word; no content moves.

---

## Low-severity notes — drift on the `PRODUCT.md` side, no PRD change needed

Recorded so they are not lost, and explicitly marked as *not* PRD gaps.

- **`PRODUCT.md` § Evidence on Hand is stale about the licence file.** It states
  "no licence file exists in the repository — until it does, all rights are
  reserved by default regardless of intent". `LICENSE.md` exists at the repo
  root. `prd.md` §9.5 states the licence as in force, which is the accurate
  side. **Fix `PRODUCT.md`, not the PRD.** Severity: low.
- **`PRODUCT.md` contradicts itself on publication.** § Positioning says
  "Confirmed 2026-09-02: the source is public"; § Evidence on Hand says "Nothing
  has been published yet" and "The product has never been hosted or
  distributed". `prd.md` §9.6 follows the § Evidence reading, which is the
  conservative and (absent evidence of a public repo) the defensible one. No PRD
  change. Severity: low.
- **The Address Book contract gap is already correctly reported.** `PRODUCT.md`
  lists it in scope; `docs/user-stories/INDEX.md` — which `PRODUCT.md` itself
  names as the authoritative functional contract — does not. `prd.md` §4.11 and
  §11, and `addendum.md` §7, report this as drift rather than repairing it,
  which is the right handling. Noted here only to confirm it was checked, not as
  a gap. Severity: none.
- **The "inconvenient truth" voice constraint is operationalised instance by
  instance, not as a rule.** `PRODUCT.md` § Brand Commitments: "the wallet tells
  the truth about money, including inconvenient truth. A displayed amount that
  is only an upper bound says so; a transaction that failed *and* took its fee
  says both halves", and Principle 4: "Silence about a limitation is a defect."
  Every instance the record names is present in the PRD — FR-23 (failed *and*
  consumed its fee, both halves), FR-29 (upper bound says so), FR-40 (the
  absence of a Mainnet faucet is explained rather than silent), FR-43 (indexing
  lag stated), FR-4 (no Account vs. zero balance), NFR-7, §9.1 —
  and §1 points at `PRODUCT.md` for the principles. What is absent is the
  generative form, so a *new* surface has instances to imitate but no rule to
  apply. Judged below the bar for a gap because the coverage is genuinely
  complete and the pointer exists; if §8 gains an NFR anyway, the phrasing is
  Principle 4's own: silence about a limitation is a defect. Severity: low.
