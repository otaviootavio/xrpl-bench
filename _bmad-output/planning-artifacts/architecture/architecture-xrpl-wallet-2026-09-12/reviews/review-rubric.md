# Rubric Review — ARCHITECTURE-SPINE.md

**Reviewer:** Rubric Walker, BMad architecture Reviewer Gate
**Date:** 2026-09-15
**Target:** `_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/ARCHITECTURE-SPINE.md`
**Companion read:** `GAP-REGISTER.md` (15 entries, 9 closed, 6 open)
**Evidence base:** `package.json`, `scripts/*.mjs`, `src/` import graph, `infra/`, `.github/workflows/deploy.yml`

---

## Overall verdict

This is a genuinely good spine on the axis it was built for, and thin on the axis
nobody looked at. Its treatment of the client's module graph is better than most
documents of this kind: the two sealed boundaries are the right two, each AD names
the concrete divergence it prevents rather than gesturing at "maintainability",
the three `[GATED]` claims are all true — the scripts exist, live in `bun run lint`,
and fail a merge — and the gap register is disciplined, recording six places where
the spine is deliberately stricter than the code with file and line rather than
quietly relaxing the rule to match. AD-13 through AD-15, added today, are exactly
the kind of rule a spine should carry: each generalises a shipped money-losing or
truth-losing defect into a rule that a unit one level down could otherwise get
wrong independently. The "seed vs. invariant" doctrine is stated in the header and
mostly honoured.

What it does not do is cover its own declared altitude. The scope line claims "the
whole client. Every module under `src/`, the build, and the service worker", and
the operational envelope that phrase commits to is decided nowhere. `infra/` holds
a checked-in cache policy whose own comment says the wrong value "would prevent the
service worker from ever discovering an update", and `scripts/verify-headers.mjs`
gates it on every deploy — yet no AD governs HTTP cache policy, `infra/` is never
named, and the entire deployment story is five sentences of policy parked inside a
section labelled "Structural Seed". AD-11 governs who registers the service worker
and AD-16 governs which Cache Storage entries survive a lock; between them sits the
one layer that determines whether an update is discoverable at all, and it is
ungoverned and not even Deferred. Two units one level down can choose incompatibly
there and break a never-negotiable invariant.

The second theme is smaller and uniform: the document's normative picture has
drifted from its normative prose. The mermaid graph asserts one dependency that does
not exist in `src/` and omits three that do — including one that AD-3's own Rule
mandates. The `components/ui` leaf sentence describes the tree as it was before the
`notice-tone` move that `check-layering.mjs` was written to lock in. None of these
is dangerous on its own; collectively they mean a coding agent reading the diagram
and a coding agent reading the ADs would build different things, which is precisely
the failure the artefact exists to prevent.

Verdict: **thin at the initiative altitude it claims; adequate as a build substrate
for `src/`.** Publishable for module-level work today, with one critical finding
outstanding. Not yet trustworthy as the initiative-altitude contract its front
matter claims to be.

---

## Dimension verdicts

### 1. Divergence coverage — **thin**

Within the module graph, coverage is strong. The real divergence points for units
building under `src/` are fixed: who owns the connection (AD-2), who owns key
material (AD-3), who owns query keys (AD-4), who owns the write path (AD-9), who
owns teardown (AD-16), and — newly — what a screen may claim when a read fails
(AD-13/14/15). Each passes the inclusion test: two independently built screens
genuinely could render a failed read differently, and two did, which is why those
three ADs exist.

The verdict is thin rather than adequate because of one omission with a large blast
radius and one with a small one.

The large one: **nothing governs HTTP cache policy** (F-1). The build and the
service worker are in scope by the spine's own scope line. `infra/pullzone-cache.json`
sets a zone-wide 60-second floor and explains at length that a per-path rule was
attempted and deleted because it degraded assets to `no-cache, no-store`. That is a
live, non-obvious, real trade-off with a documented failure mode — the definition of
what belongs in a spine — and it is absent.

The small one: **AD-2 makes egress enumerable but names no owner of the list** (F-4).
The rule requires each outbound call to live in a named `lib` module whose purpose is
that call, and grounds `PRODUCT.md`'s privacy claim in the resulting list being
enumerable. It never says the list is closed, or who may extend it. A unit adding a
crash reporter in `lib/telemetry.ts` satisfies every word of AD-2 while falsifying the
claim AD-2 exists to support. Visible is not the same as permitted.

### 2. Rule enforceability — **adequate**

Most Rules are falsifiable as written, and the ones that are not are honestly
labelled: the header states plainly that every non-`[GATED]` AD is review-enforced,
so a missing script is disclosed, not concealed. All three `[GATED]` claims verify —
`check-query-keys.mjs`, `check-sw-register.mjs` and `check-layering.mjs` are all in
the `lint` script, all exit non-zero on violation, all export their scan function so
the guard itself is testable, and all carry a per-line opt-out rather than a
tree-wide exemption. `check-sw-register.mjs` is the best of the three: it fails both
on a stray importer *and* on the owner ceasing to import, so the guard cannot rot into
pointing at nothing. AD-11's `[GATED]` label is fully earned.

Three deductions. AD-1's label covers less than its Rule says (F-5). AD-4's gate
checks key *provenance* but not key *content* (F-3). And gate allocation does not
track blast radius: AD-7 is the most grep-shaped rule in the document, guards the
project's highest-severity invariant, and is ungated while SW registration is gated
(F-6).

### 3. Deferred safety — **adequate**

The six Deferred entries are mostly well-judged, and two are better than that. "A
second network provider or a user-editable endpoint" correctly observes that AD-2
already seals the boundary such a feature would sit behind, so the decision cannot
cause divergence before it is taken — that is the right reasoning for deferring
something. "The production origin" is the standout: it refuses to treat the hostname
as a deployment detail, on the correct ground that IndexedDB is origin-scoped and a
domain move is a vault-less new origin. "Component-level test strategy" was amended
today to note that four screen-level tests now pin AD-13/14/15; I verified all four
exist (`balances-error`, `history-error`, `trustlines-error`, `send-destination-error`).

No entry is actively unsafe. The verdict is held at adequate only because the
section's completeness is contingent on Dimension 5 — a dimension that is silent
rather than deferred is not made safe by a well-written Deferred list, and HTTP
cache policy appears in neither.

### 4. Brownfield ratification — **adequate**

This is the dimension the artefact handles most honestly. Where the spine is stricter
than the code, it says so and the gap register carries file and line: AD-13 vs. G-10,
AD-14 vs. G-11, AD-8 vs. G-12, AD-16 vs. G-13 and G-14, AD-2 vs. G-15. G-10 is
exemplary — it records not only the defect but the alternative that was considered and
rejected, and the reasoning (a blocked send is recoverable, a tagless send is not) is
the correct asymmetry. The "Not gaps" section, recording what was checked and found
sound so it is not re-raised, is a practice more registers should copy.

Spot-checks confirm the ratifications: no `Wallet.fromSeed` outside `lib/crypto`;
`useAccountLiveUpdates.ts` is the only `getXrplClient` caller outside the boundary,
exactly as AD-2's named exception states; the only non-boundary `xrpl` imports are
`isValidClassicAddress` and a `TransactionStream` type, both exempt; `lib/notify.tsx`
is the only `lib → store` edge; the only two `fetch` calls in `src/` are the faucet
and the release manifest, matching AD-2's enumeration; `money.ts` contains no
`Number()`, `parseFloat` or `toFixed` outside comments explaining their absence; and
there is no `src/lib → src/hooks` import anywhere.

One deduction: the `components/ui` leaf sentence contradicts the tree and, more
importantly, contradicts the intent of the guard that was written to fix it (F-2).

### 5. Altitude breadth — **thin**

The rubric's named priority, and the weakest dimension by a distance.

The scope line commits to the build and the service worker. The build is represented
by a version table; the service worker by AD-11 and AD-16. The operational and
environmental envelope those imply is represented by a single five-sentence paragraph
at the end of **Structural Seed** — a section the document's own doctrine defines as
"true at cold-start, owned by the code once it exists". Deployment policy is not seed.
Filing it there is why the dimension reads as silent: it is the one part of the
document explicitly marked as not binding.

What that paragraph omits, and what the repository actually contains:

- `infra/pullzone-cache.json` — a zone-wide cache floor, with recorded reasoning, a
  named provider, live pull-zone and storage-zone IDs, and a documented failed
  attempt at per-path rules. Unmentioned.
- `infra/rulesets/{dev,stage,prod}.json` — branch protection as checked-in config,
  the mechanism behind "only merges reach these branches". Unmentioned.
- `scripts/verify-headers.mjs` — a post-deploy gate against live headers, described in
  `deploy.yml` as "the gate that stops a stale shell shipping". Unmentioned.
- `scripts/gen-release-manifest.mjs` — produces the `releases.json` that AD-2 names as
  a declared egress target and that the whole user-controlled update model reads.
  Its output is referenced; its ownership is not.
- Operations proper — error reporting, telemetry, observability. Almost certainly a
  deliberate nothing, given the product's privacy claim, but an initiative spine should
  say "there is none, and adding any is a boundary decision" rather than be silent.
  F-4 is the same gap seen from the other side.

Provider strategy is likewise undecided: "a CDN pull zone per environment" names no
provider, no owner of `infra/`, and no position on portability, while the config and
the deploy job are bunny.net-specific down to a pinned CLI version. The paragraph also
implies three environments where two zones exist.

### 6. Seed minimality — **thin**

The Structural Seed tree itself is good — terse, annotated only where the annotation
carries an invariant (`SEALED`, "the AD-8 inline failure surface", "the only path to
the Annunciator"). It stops well short of documenting the tree.

The section around it does not. The Stack table lists fifteen dependencies with
version ranges under a header reading "Re-read from `package.json` on 2026-09-15;
unchanged since 2026-09-12", then concedes in the following paragraph that the
remaining dependencies "carry no invariant" — which is true of most of the fifteen
too. `package.json` is authoritative for this and cannot drift from itself; a
transcription of it can, and the dated re-read line is an admission that keeping the
two in step is now a recurring chore the document has taken on. The seed doctrine in
the spine's own header argues for cutting this to the entries that actually bind
(`xrpl`, `@tanstack/react-query`, `zustand`, `vite-plugin-pwa`) and pointing at
`package.json` for the rest (F-7).

And, per Dimension 5, the Deployment paragraph is the inverse error: binding
operational policy filed under a heading that declares it non-binding.

### 7. Internal consistency — **thin**

The ADs are consistent with one another — I found no AD-to-AD contradiction, and the
cross-references (AD-9 deferring to AD-1 on how it reaches the flag; AD-14 deferring to
AD-8 for what renders instead; AD-16's two sets resolving the tension G-13 and G-14
describe) are coherent and load-bearing.

The failure is between the prose and the picture. The rubric directs checking the
mermaid graph against AD-1 and its named exception specifically, and that check fails
in four places (F-8): one asserted edge that does not exist in `src/`, and three real
edges the graph omits, one of which AD-3's Rule explicitly requires. The graph is
directly beneath the sentence "No arrow points upward", which invites reading it as
the complete permitted set — and read that way it forbids what AD-3 mandates.

Secondarily, AD-8 states an absolute that the component owning its surface breaks
(F-9), where AD-1 and AD-2 in the same document both handle their equivalents by
naming the exception.

---

## Findings

### F-1 — No AD governs HTTP cache policy, and the SW update model depends on it — **critical**

**Cites:** Structural Seed § "Deployment"; AD-11; AD-16; Deferred (absent from)

`infra/pullzone-cache.json` sets `CacheControlMaxAgeOverride: 60` zone-wide and
records why in its own comment: a fresh bunny `sites` pull zone defaults to
`2592000` on everything including `index.html` and `sw.js`, which "would pin a user
to a month-old app shell and **prevent the service worker from ever discovering an
update**". It further records that a per-path rule for `/assets/` was accepted by the
API, silently stored empty parameters, degraded hashed assets to `no-cache, no-store`,
and was deleted. `deploy.yml` runs `scripts/verify-headers.mjs` against live headers
after every deploy specifically to stop a stale shell shipping.

So: the never-negotiable invariant "the app never updates itself — a new service
worker installs and **waits**" has a prerequisite, namely that the browser can see a
new build at all. AD-11 fixes who registers the worker. AD-16 fixes which Cache
Storage entries survive a lock. Nothing fixes the layer in between.

Apply the spine's own inclusion test. Two units one level down — one adding
`immutable` to `/assets/` to cut bandwidth, one adding `runtimeCaching` to the
Workbox config for the same reason — can choose incompatibly, and both choices are
defensible in isolation. The call is non-obvious (the register documents a failed
attempt), and it is a real trade-off (bandwidth against staleness, resolved
deliberately toward "revalidates too often" over "serves a stale wallet"). Answer:
yes on all three. It belongs in the spine, and it is not even under Deferred.

Note that `GAP-REGISTER.md`'s "Not gaps" already records "No `runtimeCaching` in the
service worker at all" as a deliberate property stronger than §4 — which confirms the
policy is understood and simply never promoted into an invariant anyone must respect.

**Fix:** a new AD owning the cache contract. The floor is short zone-wide; a per-path
relaxation requires a live-header verification; `runtimeCaching` stays empty, and an
addition is a boundary decision, not a performance tweak. Name `verify-headers.mjs` as
its enforcement, which makes it a legitimate fourth `[GATED]`-class rule (gated at
deploy rather than at lint — worth saying explicitly, since the header currently
defines `[GATED]` as "a script inside `bun run lint`").

---

### F-2 — The `components/ui` leaf sentence predates the `notice-tone` move — **medium**

**Cites:** Design Paradigm, final line; Structural Seed, `ui/` annotation

Both say `src/components/ui` "may import `@/lib/utils` and nothing else".
`src/components/ui/alert.tsx:5` imports `NOTICE_TONE` and `NoticeTone` from
`@/lib/notice-tone`.

This is not a code defect and must not be filed as one. `check-layering.mjs`'s
docstring records that the tone vocabulary formerly lived *in* `alert.tsx` while
`lib/notify` imported it upward as a value, that four gates stayed green throughout,
and that moving it to `src/lib/notice-tone.ts` is the fix the guard now locks in.
AD-8's own Rule states the same intent: "The tone vocabulary lives in
`src/lib/notice-tone.ts`, not in a UI component, so `lib` and `store` can name a tone
without importing upward." The current import is the designed end state.

The defect is that the leaf sentence was not updated when the move happened, and it now
contradicts AD-8 in the same document. It is stated twice, which doubles the chance a
unit takes it literally — and taking it literally means filing a false violation
against `alert.tsx`, or churning a correct module to satisfy a stale sentence.

Severity is held at medium rather than high precisely because the gate covers the
dangerous direction: moving `NOTICE_TONE` back into `alert.tsx` would fail
`check-layering.mjs` the moment `notify.tsx` imported it upward again. The cost here
is wasted review attention and pointless churn, not a reintroduced defect.

**Fix:** amend both occurrences — `ui` may import `@/lib/utils`, `@/lib/notice-tone`,
and its own siblings, and nothing else. No gap-register entry: the code is correct.

---

### F-3 — AD-4's gate checks key provenance, not key scope — **high**

**Cites:** AD-4 `[GATED]`

AD-4's Rule has two halves. Half one: keys come from a single factory, no literals
elsewhere. Half two: "A read scoped to an account takes the active wallet and the
active network."

`check-query-keys.mjs` enforces half one, thoroughly — `queryKey:` plus twelve
positional key APIs, matched whole-file so a line break cannot defeat it. It enforces
nothing about half two, because it never inspects what a factory function returns.

Half two is the half that prevents the stated divergence. AD-4's "Prevents" clause is
"an invalidation key drifting from the read key... which leaves stale data — in the
worst case a previous wallet's balance — on screen after a switch". A new factory entry
spelled `myThing: (address: string) => ['myThing', address] as const`, omitting
`network`, passes the gate cleanly and reintroduces precisely that: the same address on
two networks shares one cache entry.

The current factory is well-formed — `accountState`, `accountTx`, `trustLines`,
`destinationInfo` all take `NetworkId` first, and the genuine exceptions
(`serverReserves`, `recommendedFee` network-scoped; `passkeyRegistered`, `lockoutState`
device-scoped) are named functions exactly as the Rule requires. So this is a
future-proofing gap, not a live defect. But the `[GATED]` label invites a reader to
believe the gate covers the Rule, and a new factory entry is the likeliest place the
rule is next broken.

**Fix:** either extend the gate to assert every exported factory entry either takes a
`NetworkId` or appears on an explicit allow-list of device-scoped keys, or narrow the
`[GATED]` label to the provenance half and mark the scope half review-enforced.

---

### F-4 — AD-2 requires egress to be visible but never says the list is closed — **medium**

**Cites:** AD-2, "Egress beyond the ledger is declared, not incidental"

The clause requires every outbound request to live in "a named `lib` module whose
purpose is that call", enumerates the two that exist, and states that "the privacy
claim in `PRODUCT.md` is a claim about this list, so the list has to be enumerable".

Enumerable is a property of the list's *shape*, not its *membership*. Nothing in AD-2
says the list is closed, who may add to it, or what test an addition must pass. A unit
that adds `src/lib/telemetry.ts` containing a single `fetch` to an error collector has
complied with every word — the module is named, its purpose is that call, the list
remains enumerable — while falsifying the claim the clause exists to protect.

This is the same silence Dimension 5 sees from the operations side: the spine never
states that the wallet has no telemetry, so it never states that adding some is a
decision rather than an implementation detail.

**Fix:** one sentence — the list is closed; a new egress target is a spine amendment,
not a module addition. That also gives the operations dimension the explicit "there is
none, deliberately" it currently lacks.

---

### F-5 — AD-1's `[GATED]` label covers less than AD-1's Rule — **medium**

**Cites:** AD-1 `[GATED]`, Rule and named exception

The Rule states three prohibitions and one exception. `check-layering.mjs` has
`LOWER = ['src/lib', 'src/store']` and `UPPER = ['components', 'pages']`, so it
enforces:

- `src/lib → src/components|pages` — gated
- `src/store → src/components|pages` — gated
- `src/lib → src/hooks` — **not gated**; `hooks` is absent from `UPPER`
- "`lib/notify.tsx → store/notice-store`... is the only `lib` → `store` edge
  permitted; any other is a violation" — **not gated**; the scan never looks at
  `lib → store` at all, in either direction

I verified there is no live `src/lib → src/hooks` or `src/store → src/hooks` import
anywhere, and that `lib/notify.tsx` is the sole `lib → store` importer. So nothing is
broken today; this is a labelling defect, not a code defect.

It matters because the exception clause is phrased in a way that implies machine
knowledge — "it is the only `lib` → `store` edge permitted; any other is a violation" —
sitting under a `[GATED]` heading. A reader reasonably concludes a second `lib → store`
edge would fail `lint`. It would not, and given that this exact edge class is the one
the guard's own docstring describes as invisible to every other gate, that is the
wrong thing to be wrong about.

**Fix:** preferably widen the scan — add `hooks` to `UPPER`, and add a `lib → store`
check allowing `notify.tsx` alone. Both are a few lines and the guard is already
structured for it. Failing that, mark AD-1 `[PARTLY GATED]` and say which half.

---

### F-6 — Gate allocation does not track blast radius: AD-7 is the obvious fourth gate — **medium**

**Cites:** AD-7; header definition of `[GATED]`

Three scanners exist and the repo has a settled idiom for them: `node:` builtins only,
exported scan function so the guard is testable, per-line opt-out directive,
`runningAsScript` realpath guard, and a `check:*` script alongside the `lint` entry.
Adding a fourth is cheap and patterned.

AD-7's Rule — "No `Number()`, `parseFloat`, or `toFixed` touches a monetary value
anywhere, **including inside that module**" — is the most mechanically checkable rule in
the document, and it guards the invariant the project lists first among those that
"lose money or keys". It is review-enforced. AD-11, which guards a double service-worker
registration, is gated.

I am not claiming review-only enforcement is concealed — the header discloses it
plainly, and `money.ts` is currently clean (the only occurrences of those tokens are
comments explaining why they are absent). The finding is the unexplained asymmetry: the
cheapest-to-gate, highest-severity rule is the one left to human attention, and AD-7's
own "Prevents" clause anticipates the exact regression a scanner would catch — "a future
edit reaching for a float because the surrounding code already does arithmetic inline".

AD-2 and AD-3 are the same shape at lower cost-benefit (both are single-pattern greps —
`Client` from `xrpl` outside the boundary, `Wallet.fromSeed` outside `lib/crypto`) and
are worth a sentence in the same breath.

**Fix:** either add `check-money-arithmetic.mjs`, or add one line to the header saying
which ADs were considered for gating and why they were not — so the allocation reads as
a decision rather than an accident.

---

### F-7 — The Stack table documents what `package.json` owns — **medium**

**Cites:** Stack section; header doctrine on seed

Fifteen rows of names and version ranges transcribed from `package.json`, under
"Re-read from `package.json` on 2026-09-15; unchanged since 2026-09-12". I verified the
transcription is currently accurate.

That is the problem rather than the defence. The spine's own doctrine holds that
anything the code owns once it exists is seed, not invariant, and `package.json` owns
this absolutely. The dated re-read line documents a maintenance burden the spine has
voluntarily taken on, with a silent failure mode: the table drifts, someone trusts it,
and nothing catches it. The paragraph immediately below already draws the right
distinction — Radix, `lucide-react`, `qrcode` and the rest are excluded because "none of
them carry an invariant" — without noticing that the same test excludes most of the
fifteen. `oxlint`, `vitest`, `typescript` and `bun` constrain no unit's design choices.

**Fix:** keep the entries that bind a decision — `xrpl`, `@tanstack/react-query`,
`zustand`, `vite-plugin-pwa`, and `node >=22` if the engine floor is load-bearing — say
in one line why each is there, and point at `package.json` for everything else. Drop
the dated re-read line with them.

---

### F-8 — The Design Paradigm diagram contradicts AD-3 and asserts a non-existent edge — **medium**

**Cites:** Design Paradigm mermaid graph; AD-3 Rule; AD-1

Checked edge by edge against `src/`:

**Asserted, does not exist.** `crypto --> ledger`. No file under `src/lib/crypto`
imports `@/lib/xrpl`. The nearest thing is `keystore.ts:1` importing `Wallet` from the
`xrpl` *package*, which is a different thing from the sealed `src/lib/xrpl` module the
node is labelled as. A drawn edge reads as permission; this one invites a unit to create
a dependency from the key-material boundary into the ledger boundary that nothing today
requires and that couples the two sealed modules.

**Exists and is mandated, not drawn.** `pages --> crypto`. AD-3's Rule says "Screens ask
`src/lib/crypto/keystore.ts` for what they need", and five page files do exactly that
(`Onboarding`, `Unlock`, `SettingsTab`, `SendTab`, `TrustLinesTab`). The graph routes
crypto only via `store --> crypto`. Under "No arrow points upward" — which invites
reading the graph as the complete permitted set — the picture forbids what the AD
requires.

**Exists, not drawn.** `comp --> store` (`AddressLink`, `Annunciator`, `AppHeader`,
`NetworkSelector`) and `hooks --> crypto` (`useAutoLock.ts:3`, `extendSession` from
`@/lib/crypto/auth`). Both are legal downward edges under AD-1; both are simply missing.

**Fix:** delete `crypto --> ledger`; add `pages --> crypto`, `comp --> store`,
`hooks --> crypto`. If the graph is meant to be illustrative rather than exhaustive,
say so in the sentence beneath it — but given that sentence currently reads "No arrow
points upward", exhaustive is the natural reading and the better target.

---

### F-9 — AD-8 states an absolute its own surface owner breaks — **low**

**Cites:** AD-8 Rule, "Dismissal is part of the `notify` surface; nothing reaches into
the notice store directly"

`src/components/Annunciator.tsx:66` reads `dismiss` straight from `useNoticeStore`, and
line 3 imports the store directly.

The code is right. Annunciator *is* the Annunciator — the component that renders the
surface and owns its dismiss affordance — and routing its own rows' dismissal back out
through `notify` would buy nothing. The rule's intent is plainly about *other* modules,
and G-5 confirms the real defect it came from: `useAppUpdate` reaching past `notify`
into the store, since fixed by giving `notify` a `dismiss`.

The rule as written does not say that. AD-1 and AD-2 each handle their equivalent
situation by naming the exception explicitly and stating that it is the only one; AD-8,
amended today, states an unqualified absolute instead. A unit taking it literally either
files a false violation against `Annunciator.tsx` or refactors a working surface for no
gain.

**Fix:** one clause — nothing outside `lib/notify.tsx` and `components/Annunciator.tsx`
touches the notice store; Annunciator is the surface's renderer and is the only
component permitted to.

---

### F-10 — Deployment policy is filed under a heading that declares it non-binding — **low**

**Cites:** Structural Seed, closing paragraph

The paragraph carries genuinely binding content: no server-side component in any
environment, promotion on tree equality, and the closed egress list AD-2 depends on. It
sits at the end of a section the spine's own header defines as "true at cold-start,
owned by the code once it exists" — the one category explicitly marked as not an
invariant. A unit reading for binding rules and correctly skipping the seed section
misses all of it.

It also drifts in one detail: "a CDN pull zone per environment" alongside three branches
implies three zones, where `infra/pullzone-cache.json` defines two (`stage`, `prod`) and
`deploy.yml` maps only those two, erroring on any other ref. `dev` is a CI branch, not a
deployed environment.

**Fix:** promote the paragraph into the operational section F-1 calls for, and correct
the environment count.

---

## Summary

| # | Finding | Severity |
|---|---|---|
| F-1 | No AD governs HTTP cache policy; the SW update model depends on it | critical |
| F-2 | `components/ui` leaf sentence predates the `notice-tone` move | medium |
| F-3 | AD-4's gate checks key provenance, not key scope | high |
| F-4 | AD-2 requires egress visible but never closes the list | medium |
| F-5 | AD-1's `[GATED]` label covers less than AD-1's Rule | medium |
| F-6 | Gate allocation does not track blast radius (AD-7) | medium |
| F-7 | Stack table documents what `package.json` owns | medium |
| F-8 | Diagram contradicts AD-3 and asserts a non-existent edge | medium |
| F-9 | AD-8 states an absolute its own surface owner breaks | low |
| F-10 | Deployment policy filed under a non-binding heading | low |

**Verified sound, recorded so it is not re-raised:** all three `[GATED]` scripts exist
and are in `bun run lint`; `check-sw-register.mjs` additionally fails if the owner stops
importing, which prevents guard rot; AD-2's named exception matches `src/` exactly
(`useAccountLiveUpdates` is the only outside `getXrplClient` caller); the only two
`fetch` calls in `src/` are the two AD-2 enumerates; no `Wallet.fromSeed` outside
`lib/crypto`; no `src/lib → src/hooks` import anywhere; `lib/notify.tsx` is the only
`lib → store` edge; `money.ts` is free of `Number`/`parseFloat`/`toFixed`; the AD-4
factory scopes every account read by `NetworkId` and names its device-scoped exceptions;
and the four screen-level tests the Deferred section claims for AD-13/14/15 all exist.

**AD-5 verified against code and found sound.** `lib/crypto/auth.ts:36` imports the
session key with `extractable = false`, and `:98-101` deliberately re-hands a
*non-extractable* handle to a key that had to be generated extractable in order to be
wrapped — with a comment saying exactly that and why. `lib/crypto/db.ts:29,51` records
that only ciphertext or a non-extractable `CryptoKey` is ever written. The other
`importKey` calls (`derive.ts`, `aes.ts`, `pin.ts`) all pass `false` too. AD-5's
`[ADOPTED]` claim is a faithful ratification of the code, not a target ahead of it —
worth stating because it is the AD most likely to be "corrected" by an agent reading
§4's no-secret rule literally, which is the exact outcome AD-5 was written to prevent.
