# PRD input reconciliation — `CLAUDE.md` + `docs/agents/` (9 files)

Inputs reconciled against `prd.md` and `addendum.md` in this run folder:
`/home/otavio/xxx/xrpl-wallet/CLAUDE.md`, and
`/home/otavio/xxx/xrpl-wallet/docs/agents/{INDEX,anti-patterns,keys-and-secrets,ledger-io,money,shipping-and-ci,ui-and-design-system,verifying-your-work}.md`.

**Method.** The PRD deliberately links rather than restates, so absence of text
is not a finding. A finding is one of three things: an unrepresented requirement
(a product-visible obligation in an input that no FR/NFR carries), a wrong
citation or claim, or a contradiction. `docs/agents/` is a behavioural manual for
agents; most of its content legitimately has no place in a PRD, and a closing
section names what is correctly absent so the rest can be read as deliberate.

**Severity scale.** *High* — a wrong claim or contradiction that could mislead a
downstream builder about money, keys, or scope. *Medium* — a product-visible
requirement no FR carries, or a claim stronger than its evidence in a
money/security area. *Low* — a placement, wording, or declaration inconsistency
with no behavioural consequence.

---

## Finding 0 — the authoritative document set (central finding)

**The discrepancy, stated precisely.**

- `CLAUDE.md` § "Read these before you start" declares **five** documents that
  "do not overlap; each is authoritative for its own layer":
  `docs/agents/INDEX.md`, `docs/user-stories/INDEX.md`, `docs/decisions.md`,
  `DESIGN.md`, `docs/sprints/`. `PRODUCT.md` is **not** in that table.
- `prd.md` §0 declares **four** authoritative documents: `PRODUCT.md`,
  `docs/user-stories/INDEX.md` + the twelve epic files, `docs/decisions.md`,
  `DESIGN.md`. `docs/agents/INDEX.md` is **not** in that table.

**Does `PRODUCT.md` exist, and is it referenced from `CLAUDE.md`?** Yes to both.
`/home/otavio/xxx/xrpl-wallet/PRODUCT.md` exists (14 KB, 2026-09-09).
`CLAUDE.md:13` cites it — "See `PRODUCT.md` `## Licence`" — so `CLAUDE.md`
depends on a document its own reading list omits. The wider repo treats
`PRODUCT.md` as *the* product authority on at least four axes:

| Claim | Cited to `PRODUCT.md` by |
|---|---|
| Real Mainnet funds / asymmetric defect cost | `docs/agents/INDEX.md:40` |
| The WCAG 2.2 AA commitment `check:contrast` enforces | `docs/agents/shipping-and-ci.md:66`; `docs/sprints/cicd-sprints.md:48` |
| "No backend exists to compromise" positioning | `docs/agents/shipping-and-ci.md:102`; `docs/sprints/cicd-sprints.md:52` |
| Licence `FSL-1.1-ALv2` and the name `xrpl-bench` | `docs/sprints/cicd-sprints.md:36`; `docs/user-stories/app-versioning-and-updates.md:157` |
| 200% zoom as a supported condition | `docs/user-stories/in-app-notices.md:121`; `docs/sprints/notices-sprints.md:183` |

**Is `docs/agents/INDEX.md` product-relevant?** No — it originates no product
requirement. Every product fact it states, it explicitly sources elsewhere: real
funds → `PRODUCT.md` (line 40); the scope boundary → `docs/user-stories/INDEX.md`
("§ What this repo will not become"); the no-auto-update delivery model →
`docs/user-stories/app-versioning-and-updates.md`; the licence → `FSL-1.1-ALv2`
as recorded in `PRODUCT.md`. Its own content is behavioural: the three tiers
(Always / Ask first / Never), the six standing behaviours, the routing table.
Its omission from a *product* requirement view is **correct**, not merely
defensible.

**Recommendation.**

1. **`prd.md` §0's four rows are right as they stand — no change.** Each of the
   four is authoritative for a product layer, `PRODUCT.md` most of all, and the
   repo's own citations confirm it. The PRD is not wrong here.
2. **The gap is on the `CLAUDE.md` side**, and it is a repo-doc gap, not a PRD
   gap: a five-document reading list that claims non-overlapping authority
   "for its own layer" has no row for product purpose, positioning, users,
   principles, brand, or licence — the layer `PRODUCT.md` owns and that
   `CLAUDE.md:13` already reaches for. The counter-argument, which should be
   recorded rather than dismissed: `CLAUDE.md`'s own opening paragraphs *are* a
   product précis (self-custody scope, no exchange features, licence, PWA, no
   backend), so the omission may be deliberate compression rather than
   oversight. Either way it is a `CLAUDE.md` edit, not a PRD edit, and per
   standing behaviour #5 ("never repair drift as a side effect") it is
   **reported here, not repaired**.
3. One row *is* missing from §0 — see Finding 4 — and it is `docs/sprints/`,
   not `docs/agents/INDEX.md`.

**Verdict: `prd.md` §0 is defensible on both counts** — `PRODUCT.md` belongs
there and `docs/agents/INDEX.md` does not. It is *incomplete* only by the one
`docs/sprints/` row. `CLAUDE.md`'s table is the one carrying the real omission.

---

## Finding 1 — the eight non-negotiable rules, mapped (no unrepresented rule)

**All eight are represented.** The two sub-clauses most likely to be dropped in
a summary both survive: "not even in development" lands in NFR-2 verbatim in
substance, and "never while a transaction is in flight" lands in FR-48's second
bullet. Severity: **none** for coverage; one *low-medium* wording issue on rule 7
is broken out as Finding 3.

| # | `CLAUDE.md` non-negotiable | PRD representation | Notes |
|---|---|---|---|
| 1 | Money is strings/`BigInt` end to end; formatting only at the render boundary; never `Number()` a drops value | **NFR-1**; SM-1; glossary § Drops | Exact match, including the render-boundary clause and the `Number()` prohibition. `money.md`'s affordability rule is the one part of this area with no FR — Finding 2. |
| 2 | No secret in `localStorage`, React state, a store, the URL, or anything serializable — not even in development | **NFR-2**; FR-1, FR-2 | NFR-2 carries "including in development builds" and adds the transient-in-memory-and-cleared clause from `keys-and-secrets.md`. |
| 3 | An unlock is proven by decrypting known ciphertext, never by deriving a key | **FR-8** (+ FR-6, FR-7); **SM-2**; §4.2 description; `addendum.md` §2 | The strongest mapping in the PRD — FR-8's bullets name the AES-GCM auth tag and the wrap/unwrap contract for future methods, matching `keys-and-secrets.md` clause for clause. |
| 4 | Every ledger read goes through a TanStack Query hook whose key includes the active wallet *and* the active network | **NFR-3**; FR-14, FR-38 | NFR-3 states both key components and the consequence (no stale cross-wallet/cross-network data). |
| 5 | The service worker caches the static shell only. Never an RPC response | **NFR-4**; FR-52 | NFR-4 adds cache-version increment and purge-on-activate. FR-52's "ledger data is network-first and never cached" is the same rule at the user-visible altitude. |
| 6 | Nothing styles `:focus`; `outline-none` is banned | **NFR-5** | Verbatim. |
| 7 | Colour never carries meaning alone, and `bun run check:contrast` is the gate | **NFR-6**; FR-25, FR-34, FR-39; §9.1 | Rule represented; the *description of the gate* overclaims — Finding 3. |
| 8 | The app never updates itself. A new service worker installs and **waits**; only an explicit user action activates it | **FR-48** (+ FR-46, FR-47, FR-49, FR-51); §4.12 description | FR-48 also carries "a declined version stays declined" and the in-flight-transaction bar, both from `shipping-and-ci.md` / `agents/INDEX.md`. |

---

## Finding 2 — no FR covers the pre-submit affordability check (`amount + fee <= spendable`)

**Severity: medium.** The strongest finding in this pass.

`docs/agents/money.md` § Always states: "**Add the fee on top of the amount when
checking affordability.** The send path checks `amount + fee <= spendable`, in
`BigInt`, before enabling submit, so an over-send fails in the form instead of
costing a fee and returning `tecUNFUNDED_PAYMENT`."

This is product-visible on two counts — the submit control's enabled state, and a
network fee the user does *not* lose — yet no FR carries it. FR-18 covers only
*displaying* the recommended fee before the confirm step; FR-20 covers the
confirm step's content; FR-29 defines Spendable Balance as a readout. Nothing
requires the form to refuse an amount that the balance cannot cover once the fee
is added. NFR-1 covers the *arithmetic type*, not the *check*.

Why this is an omission rather than an altitude choice: **FR-25 already files a
"the form blocks this" obligation as an FR** ("An asset on a Trust Line frozen by
its issuer cannot be sent, and the control is `aria-disabled` with the reason in
visible text"). The affordability block is the same shape, on a higher-consequence
path, and it is the one that costs real money when it is absent.

**Recommendation.** Add one FR under §4.4, e.g.:

> **FR-nn: Over-send is blocked in the form.** Submit is unavailable unless
> `amount + fee <= Spendable Balance`, computed in `BigInt`. The control is
> `aria-disabled` with the shortfall stated in visible text, so an over-send
> fails before it costs a fee and returns `tecUNFUNDED_PAYMENT`.

---

## Finding 3 — NFR-6 describes `check:contrast` more broadly than the gate measures

**Severity: low-medium.** A wrong claim, so in scope rather than an absence.

NFR-6 states the gate "evaluates **every pair the app renders** in both themes,
alpha composites included, and exits non-zero on failure."

The inputs say something narrower and sharper:

- `docs/agents/ui-and-design-system.md`: "It parses tokens straight out of
  `src/index.css` and measures **25 pairs per theme**. **A token it does not
  measure is a token outside the rule.**"
- `docs/agents/INDEX.md` standing behaviour #4: "If you add something a gate
  should cover, **extend the gate in the same change** — an unmeasured token is
  a token outside the rule."
- `CLAUDE.md`'s own mobile-chrome row is the proof: four browser-surface hex
  literals "had drifted from `--background`" and `check:contrast` had to be
  *changed* to "measure all four literals". A gate that already evaluated every
  rendered pair could not have missed them.

The claim as written could lead a downstream reader to treat contrast as
automatically total and skip the extend-the-gate obligation — which is precisely
the failure mode behind `anti-patterns.md` §3 ("nothing had ever measured that
pairing").

**Recommendation.** Narrow the claim and carry the obligation, e.g. "evaluates
every **declared token pair** in both themes, alpha composites included, and
exits non-zero on failure; a token or literal the gate does not measure is
outside the rule, so adding one means extending the gate in the same change."

---

## Finding 4 — `docs/sprints/` is load-bearing in the PRD but undeclared in §0

**Severity: low.** An internal declaration-vs-citation inconsistency.

`CLAUDE.md` declares `docs/sprints/` authoritative for "what is planned but not
built — findings, sequencing, and the decisions each sprint is blocked on".
`prd.md` §0 lists four authoritative documents and `docs/sprints/` is not one of
them — yet the PRD relies on it materially:

- §9.3 cites `docs/sprints/cicd-sprints.md` **CD-6** for the residual CDN risk;
- §10 Q1 cites `docs/sprints/mobile-chrome-sprints.md` for the unanswered
  notice-band question;
- §10 Q3 cites `docs/sprints/cicd-sprints.md` for the account-wide deploy
  credential;
- `addendum.md` §§3–5 route most rejected alternatives and manual-verification
  items to `docs/sprints/`.

**Recommendation.** Add one row to §0: `docs/sprints/` — "what each sprint found,
decided, and left unverified; the residual risks and open questions this PRD
surfaces". No other change. (`docs/agents/INDEX.md` still does not belong there —
Finding 0.)

---

## Finding 5 — FR-12 omits the service-worker cache from lock teardown

**Severity: medium.**

`docs/agents/keys-and-secrets.md` § Always: "**Tear down completely on lock or
wallet removal:** the in-memory key, the persisted session, the TanStack Query
cache, **and the service worker cache**. A warm cache behind a lock screen is a
documented shared-device vulnerability."

The PRD splits this obligation and loses a quarter of it:

- **FR-13** (wallet removal): "Removal tears down that Wallet's cached state
  **and service-worker cache**." ✅ complete.
- **FR-12** (lock): "Locking clears cached balances, history, and the query
  cache — not only key material." ❌ no service-worker cache.

The asymmetry is what makes this an omission rather than a deliberate altitude
choice: the same sentence in the same input governs both events, the PRD honours
it for one, and the dropped half is the one the input labels a *documented
vulnerability*. FR-12's own title — "Lock tears down data, not just the key" —
promises the completeness the body then under-delivers.

**Recommendation.** Extend FR-12 to name the service-worker cache and the
persisted session, matching FR-13's wording.

---

## Finding 6 — the upper-bound statement is represented, but filed under balances only

**Severity: low.** Placement, not absence.

`docs/agents/money.md` § Never: "**Never** show a delivered amount as exact when
the ledger could not report it. If `amountIsUpperBound` is set, the figure is a
maximum and the UI says so — this is the sentence a user most needs and the one
most easily dropped." `anti-patterns.md` §3 records that the worst contrast
failure found (2.15:1) was carrying exactly this warning.

The PRD carries it as a bullet on **FR-29** (§4.6 Viewing Balances): "Where a
figure is an upper bound, it says so." But `amountIsUpperBound` is a
*delivered-amount* property — a partial-payment concern that surfaces in
transaction detail (**FR-37**) and on receipt (**FR-28**), not on the XRP balance
readout. As written, the rule is attached to the one surface it least applies to.

**Recommendation.** Keep the FR-29 bullet (an upper-bound balance figure is still
possible) and add the same clause to FR-37, where the delivered amount is
actually rendered.

---

## Finding 7 — twelve epics vs. thirteen features: `CLAUDE.md` is silent, not opposed

**Severity: low (informational). No PRD edit recommended.**

`CLAUDE.md` § "Planned work": "**All twelve epics are now built.**" `prd.md` §4:
"Thirteen features: the twelve epics in `docs/user-stories/INDEX.md`, plus the
Address Book (§4.11), which ships but which that index does not list."

These do not contradict. `CLAUDE.md` counts **epics**, and the Address Book has
no epic file — so "all twelve epics" is internally consistent with a thirteenth
*shipped capability* that was never filed as an epic. `CLAUDE.md` mentions the
Address Book nowhere at all, and its five tables index epics and sprints, not
capabilities. So it neither supports nor refutes §4.11; it is a third document
that does not name the capability.

The PRD already discloses this honestly and in the right register: §4.11's own
note ("Drift reported, not repaired"), §11's `[ASSUMPTION]` entry citing
`docs/decisions.md` §2 and `PRODUCT.md`, and `addendum.md` §7. That is the
correct handling under standing behaviour #5 — the repo-side fix is one epic file
in `docs/user-stories/` plus two `INDEX.md` rows, which is a repo edit and
already logged.

The one thing worth adding to the record: the count discrepancy now appears in a
**third** place. `addendum.md` §7 already notes
`docs/sprints/bugfix-sprints.md` saying "All 10 epics are implemented" when there
are twelve; `CLAUDE.md` says twelve; the PRD says thirteen features. All three
are defensible individually, which is exactly why the missing epic file is worth
closing rather than annotating further.

---

## Finding 8 — the four gates (PRD SM-4): agree

**Severity: none.**

`CLAUDE.md` § Gates names exactly four: `bun run lint` · `bun run build`
(includes `tsc -b`) · `bun run test` · `bun run check:contrast`. **SM-4** names
the same four, and `addendum.md` §4 records them as the four CI gates.
`docs/agents/shipping-and-ci.md` confirms them as the pipeline's own gates.

Two things the PRD gets *right* and that are worth citing rather than only
flagging misses:

- `docs/agents/verifying-your-work.md` tabulates **five** commands, adding
  `bunx tsc -b` as its own row. This is not a contradiction: `CLAUDE.md`
  parenthesises `tsc -b` as part of `build`, so the fifth row is the same check
  broken out for its blind spots. SM-4's count of four is correct.
- **SM-C3** reproduces `CLAUDE.md`'s caveat almost verbatim — "Four green gates
  mean nothing is *provably* broken, not that a change works; adding gates is
  not the same as verifying" against `CLAUDE.md`'s "All four green means nothing
  is *provably* broken — not that a change works." SM-6 and `addendum.md` §5
  carry the manual-verification half that `verifying-your-work.md` exists to
  enforce.

---

## Finding 9 — licence, naming, branches, scope: checked, no contradiction

**Severity: none.** Recorded because a reconciliation that finds nothing on an
axis must say it looked.

| Axis | `CLAUDE.md` / `docs/agents/` | PRD | Verdict |
|---|---|---|---|
| Licence | `FSL-1.1-ALv2`, source-available, **not** open source, never describe it as such in code, comments, README, repo description or UI copy; converts to Apache 2.0 two years after each release (`CLAUDE.md`; `agents/INDEX.md` § delivery model) | §9.5 states all of it, including the UI-copy prohibition and the two-year conversion; `addendum.md` §3 records BSL as superseded | **Agree** |
| Naming | Product `XRPL Bench`, slug `xrpl-bench`, deliberately without "open" (`CLAUDE.md`; `cicd-sprints.md` L1) | §9.5 states both, plus the untested "XRPL" trademark exposure | **Agree**, PRD adds a caveat the inputs do not contradict |
| Branches | `dev` → `stage` → `prod`; `prod` is default and deployed; **no `main`**; rebase-never-merge before every merge (`CLAUDE.md`; `agents/INDEX.md` #6; `shipping-and-ci.md`) | Not in `prd.md` (correctly — process, not product); `addendum.md` §4 records "three protected branches `dev` → `stage` → `prod`" | **No contradiction.** `addendum.md` does not state that `prod` is the default branch or that there is no `main`; that is compression of a delivery detail, not a conflicting claim, and the rebase discipline is agent behaviour with no PRD home. |
| Scope | No swaps/DEX UI, no fiat on/off-ramp, no staking/yield, no KYC, no custodial recovery, no multi-sig or omnibus (`CLAUDE.md`; `agents/INDEX.md` § What this repo will not become) | §5 lists every one of them, plus the two architectural deferrals (Web Push, fiat-equivalent) that `agents/INDEX.md` and `anti-patterns.md` §10 insist be stated as deferred rather than unbuilt | **Agree** |
| Updates never automatic | `skipWaiting()` / `registerType: 'autoUpdate'` are the one property the delivery model exists to refuse | FR-48 + §4.12 description; `addendum.md` §4 | **Agree** |
| Real-funds framing | "A pleasant wrong balance is worse than an ugly right one"; clarity about consequence wins | §0 Calibration, §1, §9.1, SM-1, SM-C1 | **Agree** |

One presentational note, not a finding: `docs/agents/keys-and-secrets.md`
requires that no third-party script, analytics, session replay, *or subresource
including fonts* can observe an unlock or seed surface — "the app's faces are
self-hosted for this reason". The PRD carries the substance in §5 ("telemetry,
analytics, session replay, or any third-party script with a path to the unlock or
seed surfaces") and §9.2 ("the only outbound traffic is to the Network's RPC
endpoints and, on user action, to the block explorer"), which forecloses a font
CDN by construction. Represented; the self-hosting *mechanism* is architecture
and correctly sits in `addendum.md`'s territory.

---

## Correctly absent from the PRD

`docs/agents/` is a manual on **how agents behave**. The following are its
substance and have no PRD home; their absence is not a gap, and the PRD is right
not to carry them:

- **The three tiers and the six standing behaviours** (`INDEX.md`) — agent
  conduct: report the awkward truth, never repair drift as a side effect, a
  harness beats an opinion, rebase before merge.
- **All of `verifying-your-work.md`** — test with two wallets, test a funded
  account, both themes, 320/390/desktop, measure the component not the document,
  open every screenshot before citing it, stop after the second round. The
  product-visible residue *is* in the PRD: SM-6, NFR-9, and `addendum.md` §5's
  manual-prerequisite list.
- **All of `anti-patterns.md`** — ten recorded incidents. Their *outcomes* are in
  the PRD as requirements (FR-8/NFR-2 from §1; NFR-6 from §3; §9.1's
  `aria-disabled`-with-visible-reason from §2; §5's no-Web-Push from §10). The
  incident narratives belong to the repo record, and `addendum.md` §2 already
  carries the one that is load-bearing for an FR.
- **The panel vocabulary and token discipline** (`ui-and-design-system.md`) —
  `.panel-plate` / `.panel-well` / `.panel-legend` / `.panel-lamp`, the
  `--commit` reservation, the legend/value inversion, never uppercase
  user-authored text. `DESIGN.md` is authoritative and `addendum.md` §6 states
  explicitly that the PRD carries no visual requirements beyond the
  accessibility NFRs. Correct.
- **CI mechanics** (`shipping-and-ci.md`) — SHA-pinned actions, explicit
  `permissions:`, frozen lockfile, pinned Bun, cache keys, concurrency groups,
  edge-rule cache lifetimes, zone purge on deploy. Delivery engineering;
  `addendum.md` §4 points at `cicd-sprints.md` rather than inlining it. Correct.
  The one *product* claim in that file — the SRI-does-not-solve-this / real
  mitigation-is-verifiability argument — **is** in the PRD, at §9.3 and FR-50.
- **Implementation-level ledger rules** (`ledger-io.md`) — key list rows by
  natural identifier not array index; never fetch in a raw `useEffect`; never
  suppress `react-hooks/exhaustive-deps`; use `fetchAccountStateOnce()` for a
  blocking pre-flight probe so probe and screen share one cache entry. These are
  the *mechanism* behind NFR-3 and FR-14/FR-38 and belong to architecture. Note
  that the probe's product-visible consequence — the pre-submit read that makes
  the affordability check meaningful — is the same surface as Finding 2.
- **Code-location pointers** — `src/lib/crypto/auth.ts:64`, `Onboarding.tsx:20`,
  `App.tsx`'s Gate, `AmountInput.tsx`'s `validateAmountString()`,
  `src/lib/xrpl/money.ts`. Correctly nowhere near a PRD.

---

## Summary of recommendations

| # | Finding | Severity | Action | Owner |
|---|---|---|---|---|
| 0 | Authoritative set: `PRODUCT.md` in PRD §0 is right; `docs/agents/INDEX.md` correctly absent | — | **No PRD change.** Report that `CLAUDE.md`'s five-doc table has no row for the product layer it already cites at line 13 | repo doc, not this PRD |
| 2 | No FR for `amount + fee <= spendable` pre-submit block | Medium | Add one FR under §4.4 | `prd.md` |
| 5 | FR-12 omits service-worker cache from lock teardown | Medium | Extend FR-12 to match FR-13 | `prd.md` |
| 3 | NFR-6 claims the gate measures "every pair the app renders" | Low-medium | Narrow to declared token pairs; carry the extend-the-gate obligation | `prd.md` |
| 4 | `docs/sprints/` cited load-bearingly but undeclared in §0 | Low | Add one row to §0 | `prd.md` |
| 6 | Upper-bound clause filed under FR-29 only | Low | Add the clause to FR-37 | `prd.md` |
| 7 | Twelve epics vs. thirteen features | Low (info) | None — already disclosed in §4.11, §11, `addendum.md` §7; repo fix is one epic file | repo doc |
| 1, 8, 9 | Eight non-negotiables; four gates; licence/naming/branches/scope | None | Checked, no action | — |
