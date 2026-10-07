# PRD input reconciliation — `docs/sprints/` (all five files)

Input: `docs/sprints/bugfix-sprints.md`, `cicd-sprints.md`, `interface-sprints.md`,
`mobile-chrome-sprints.md`, `notices-sprints.md`
Reconciled against: `prd.md` and `addendum.md` in this run folder.
Date: 2026-09-15.

`docs/sprints/` is authoritative for what each sprint found, decided, and left
behind. The PRD deliberately links rather than restates, so **absence of sprint
prose from the PRD is not a gap**. A gap here means one of three things only: an
item a sprint file explicitly left OPEN / UNVERIFIED / UNDECIDED that appears in
neither `prd.md` §10 nor `addendum.md` §4/§5/§7; a decision in a sprint file that
contradicts an FR or NFR; or a false attribution in the PRD or addendum.

Summary: **two genuinely uncarried unverified items (F1, F2)**, one partly-carried
one (F3), **two false/stale attributions in the addendum (F5, F6)**, one drift the
addendum's own §7 should list (F4), one FR wording collision on the key-material
boundary (F10), and four low-severity items.

---

## F1 — HIGH — The non-`tesSUCCESS` transaction-outcome surfaces were never rendered

**Sprint file:** `docs/sprints/interface-sprints.md`, § "Still not verified"
(third bullet), reinforced by § "Per-finding evidence" row `IF-M2`.

**What it says:** "**The `outcome` result box and the non-`tesSUCCESS`
`TxStatusBadge` variants** — a validated payment and an `expired` result were
never produced. The `claimed` (`tec*`) path did render live, via the
`tecNO_PERMISSION` trust-line attempt." This is filed as a standing unverified
item in the completion record of a sprint plan that is otherwise marked complete
and `Block`-lifted.

**What the PRD says or omits:** `prd.md` states FR-22 (submitted vs. validated
must be "visually and textually distinct"), FR-23 (a transaction that failed *and*
consumed its fee states both halves) and FR-24 ("expired, not applied"). SM-1
makes correctness about money the primary metric. Neither `prd.md` §10 nor
`addendum.md` §5 names this: §5's "live Testnet integration pass — manual" bullet
is generic and does not say that three of the four outcome states have never been
seen rendered. This is the highest-consequence unverified item in the record,
because the surfaces that were never observed are precisely the ones that tell the
user their money did or did not move.

This is not a case of the addendum delegating to the sprint file. §5 *enumerates*
seven specific unverified items and then points at the sprint files; the one it
omits is the money-outcome surface that underwrites SM-1. The omission is
selective, not delegated.

**Suggested disposition:** add an explicit bullet to `addendum.md` §5 — "a
validated payment, and a `LastLedgerSequence` expiry, have never been rendered;
only the `tec*` claimed path has. Producing both on Testnet is part of the manual
pre-release pass (FR-22, FR-23, FR-24)." Optionally promote to `prd.md` §10 as a
seventh open question, since SM-1's measurement method (explorer cross-check on
the manual Testnet pass) is the only thing that can close it.

---

## F2 — MEDIUM-HIGH — A Trust Line with a non-zero balance has never been rendered in the real UI

**Sprint file:** `docs/sprints/interface-sprints.md` — § "Still not verified"
(fourth bullet) and the `IF-M4` evidence row: "The non-zero branch **cannot** be
produced through this app's UI (issuing an IOU is out of scope), so it is covered
by a new component test instead."

**What it says:** the state in which a user holds a token and therefore must be
shown a self-explaining, `aria-disabled` Close control exists only under a
`@vitest-environment jsdom` component test. It has never been rendered against
real ledger state.

**What the PRD says or omits:** FR-33 (close a Trust Line, irreversible confirm),
FR-34 (frozen badge "wherever it appears") and §9.1 ("a control that is
temporarily unavailable is `aria-disabled` with its reason in visible text — never
hidden") all depend on this branch. `addendum.md` §5 lists manual prerequisites
but not this one. The sprint file's own § "Verification prerequisites" step 2 makes
"a second trust line with a non-zero balance" a standing precondition for
verifying that sprint — a precondition never met.

**Suggested disposition:** add to `addendum.md` §5 as a manual prerequisite, with
the constraint that produced it (the app cannot issue an IOU, so the state must be
created from a second issuing account on Testnet). Keeping the component test is
fine; the gap is that no document outside the sprint file records that the test is
standing in for a rendered state.

---

## F3 — MEDIUM — Unlock backoff countdown, the import warning, and the populated Address Book are still recorded as unverified at runtime

**Sprint file:** `docs/sprints/interface-sprints.md`, § "Verification
prerequisites": "Also still unverified at runtime and worth a pass while the app
is in this state: the Unlock screen and its backoff countdown, the import and
import-warning flows, and the populated address book."

**What it says:** three flows that no sprint verified against a running app.
`notices-sprints.md`'s later browser pass partly closes this — it drove
`Unlock` → reset-device → `Onboarding` (choice / import-seed / vault-setup /
backup-confirm) → `Main` end to end with a virtual WebAuthn authenticator, and
exercised the wrong-PIN notice. It does **not** claim the backoff countdown
(the `H0` timer fix, FR-9, SM-2), the `lsfDisableMasterKey` import warning
(FR-2, and `M8`'s Settings-path equivalent), or a populated Address Book
(FR-45, and FR-21's first-time test) was observed.

**What the PRD says or omits:** FR-2, FR-9, FR-21, FR-45 and SM-2 all assert
behaviour on these surfaces. `addendum.md` §5 lists neither. Because
`notices-sprints.md` closes part of it, this is "partly carried", not absent — but
the residue is invisible outside the sprint file.

**Suggested disposition:** one bullet in `addendum.md` §5: the backoff countdown
and the disabled-master-key import warning remain unobserved at runtime; the rest
of the Unlock/Onboarding path was verified in the notices pass.

---

## F4 — MEDIUM — `cicd-sprints.md` is itself stale on `promotion-source`, and `addendum.md` §7 does not say so

**Sprint file:** `docs/sprints/cicd-sprints.md` § "Verified, not assumed":
"PR `dev` → `prod` → **BLOCKED** by the `promotion-source` check, with the
message naming the offending head branch."

**What it says:** the check as executed compared the head branch *name*.
`docs/decisions.md` §11 (2026-09-02) then found that to be the wrong invariant and
replaced it with **tree equality** (`git diff --quiet origin/<source> <head-sha>`),
which `.github/workflows/ci.yml:128` implements. `cicd-sprints.md` was never
updated, so the file that is authoritative for what S13–S15 found now describes a
check the repo no longer has.

**What the PRD says or omits:** `addendum.md` §4 states the current, correct
behaviour ("a `promotion-source` check enforcing tree equality rather than a branch
name") and cites both `cicd-sprints.md` and `docs/decisions.md` §11 — so the PRD
side is right and the sprint side is drifted. But `addendum.md` §7 ("Drift
reported, not repaired") does not list this instance, and §4's pointer sends a
reader to a sprint file that contradicts §4's own sentence.

**Suggested disposition:** add to `addendum.md` §7. No change to §4, which is
accurate.

---

## F5 — MEDIUM — False attribution: `app-versioning-and-updates.md` V1–V4 are **not** presented as open

**Where:** `prd.md` §10 OQ6 and `addendum.md` §7 (first bullet).

**What they claim:** "The 'Open decisions' tables in
`docs/user-stories/app-versioning-and-updates.md` (V1–V4) and
`docs/user-stories/in-app-notices.md` (N1–N4) still present decisions as open."

**What the source actually says:** `app-versioning-and-updates.md` § "Open
decisions this epic depends on" reads "**All four are now answered
(2026-09-02). Kept as a record of what was decided and why**", the column header
is `Decision` rather than `Why it blocks`, and every row ID is struck through
(`~~**V1**~~` … `~~**V4**~~`) with the answer stated inline. That is the house
style for a settled decision — the same style `cicd-sprints.md` uses for D1, D2,
L1, D5, D3, D4. The V-table is **not** stale.

`in-app-notices.md` §"Open decisions this epic depends on" *is* stale: "Four, all
genuinely open", no strikethrough, `Why it blocks` column intact, N2 marked
"**Blocks S17**". So half of the claim is correct and half is refuted.

**Suggested disposition:** narrow OQ6 and `addendum.md` §7 to `in-app-notices.md`
(N1–N4) only, and add `notices-sprints.md`'s own "Decisions required before
implementation" table (N1–N4, unstruck, `Blocks` column live) as the second
instance — it is the same drift in the sprint file rather than in the epic file.
Removing the V1–V4 claim also removes the only part of OQ6 that would have sent a
reader to a document that is already correct.

---

## F6 — MEDIUM — Stale claim: `.panel-scribe` has already been deleted

**Sprint file:** `docs/sprints/cicd-sprints.md` § "Known-not-done", final bullet:
"`.panel-scribe` is still defined-but-unused in `src/index.css`; the decision to
drop it is recorded in `DESIGN.md` and the deletion is pending."

**What is actually true:** `grep -rn "panel-scribe" src/` returns nothing, and
`DESIGN.md` records it twice as done — "the `.panel-scribe` two-tone groove device
was removed 2026-09-02 (see Known Gaps)" and "**`.panel-scribe` — RESOLVED and
removed 2026-09-02** … Deleted from `src/index.css`'s component layer in the same
change that touched that file for S16." `docs/agents/ui-and-design-system.md`
agrees.

**What the PRD says:** `addendum.md` §7 final bullet carries the stale claim
forward: "The unused `Switch` primitive and the defined-but-unused `.panel-scribe`
are both still present with deletion pending." The `Switch` half is still true
(`src/components/ui/switch.tsx` exists, unused, and `interface-sprints.md` § Out of
scope says delete it opportunistically). The `.panel-scribe` half is refuted.

**Suggested disposition:** drop `.panel-scribe` from `addendum.md` §7, keep
`Switch`. Optionally note in §7 that `cicd-sprints.md`'s Known-not-done bullet is
the stale source — a sprint file asserting a pending deletion that `DESIGN.md`
records as complete is exactly the doc-vs-code drift this repo has corrected twice.

---

## F7 — LOW — The browser-surface contrast gate is regex-fragile, and nothing outside the sprint file says so

**Sprint file:** `docs/sprints/mobile-chrome-sprints.md`, step 11: "the four
literals must stay **lowercase six-digit hex, single-quoted**, as `LIGHT`/`DARK`
vars in `index.html` and as `theme_color`/`background_color` keys in
`vite.config.ts`. Hoisting them to a shared constant, or writing `#181A15`, makes
the regex miss and the gate print `NOT FOUND`."

**What the PRD says or omits:** NFR-6 makes `bun run check:contrast` the gate for
colour, and SM-4 makes all four gates green the secondary metric. This constraint
is the one way the browser-surface half of that gate silently stops measuring
(it fails safe by printing `NOT FOUND`, but an ordinary refactor trips it).
Neither `prd.md` nor `addendum.md` records it.

**Suggested disposition:** one line in `addendum.md` §4 (delivery/tooling
constraints) pointing at `mobile-chrome-sprints.md` step 11. Not PRD material.

---

## F8 — LOW — `viewport-fit=cover` is a filed rejected alternative missing from `addendum.md` §3

**Sprint file:** `docs/sprints/mobile-chrome-sprints.md`, step 12: "**Do not add
`viewport-fit=cover`.** Out of scope and actively wrong here … it would then need
`env(safe-area-inset-top)` padding on `ChassisShell` interacting with `h-dvh` —
unverifiable from this machine. Filed here so the next person does not rediscover
it as an idea."

**What the PRD says or omits:** `addendum.md` §3 is the rejected-and-deferred
alternatives index and carries nine entries, none of them this one. The sprint
file explicitly filed it to stop rediscovery, which is precisely §3's purpose.

**Suggested disposition:** one row in `addendum.md` §3 — "`viewport-fit=cover` +
safe-area padding | Rejected; changes the problem rather than solving it, and the
`h-dvh` interaction is unverifiable without a device |
`docs/sprints/mobile-chrome-sprints.md` step 12."

---

## F9 — LOW / informational — FR-41's "backup endpoint" is WebSocket-only in code

**Source:** `bugfix-sprints.md` M14 ("No RPC failover. §2 promises one hardcoded
public endpoint per network **plus one hardcoded backup**") was closed in S7.
`src/lib/xrpl/networks.ts` now carries `wsUrl` + `wsUrlBackup` per network; `rpcUrl`
has no backup field.

**What the PRD says:** FR-41 — "Each Network has a hardcoded primary and a
hardcoded backup endpoint, with failover between them." True for the WebSocket
path, which is what the client uses; the HTTP `rpcUrl` has a single value.

**Suggested disposition:** informational only — the sprint record and the code
agree with each other, and FR-41's intent is met. If FR-41 is ever the basis for a
story, say "WebSocket endpoint" rather than "endpoint". Not a gap under this task's
definition.

---

## F10 — LOW-MEDIUM — FR-2's "controlled by the app" collides with what `C2` actually shipped

**Sprint file:** `docs/sprints/bugfix-sprints.md` § "Notable deviations from the
plan as written": "**C2 grew.** … the controlled seed *input* fields held the
secret in state too, so both were converted to uncontrolled refs. `SeedReveal`
now takes a getter and writes to the DOM from an effect, which keeps the secret
out of both React state and render-time ref reads."

**What the PRD says:** FR-2's second bullet — "Seed entry fields are controlled by
the app and never retain plaintext after the import completes." In a React
codebase governed by NFR-2, *controlled* is a term of art and names precisely the
implementation `C2` had to remove: a controlled input holds its value in React
state, which is the guardrail-#3 breach that sprint closed.

**Suggested disposition:** reword FR-2's bullet to say what shipped — seed entry
fields are **uncontrolled** (ref-backed), never hold plaintext in React state, and
retain nothing after import. Low severity because the intent is clear from NFR-2,
medium-adjacent because a downstream story written literally from FR-2 would
reintroduce the exact defect.

---

## F11 — LOW — `interface-sprints.md` records its own finding inventory as incomplete

**Sprint file:** `docs/sprints/interface-sprints.md` § Coverage: "The review
reported 15 findings against a cap of 15… the cap did absorb the LOW tier, so this
plan is not a complete inventory of polish work, only of what cleared the
reporting bar."

**What the PRD says or omits:** `prd.md` §6.1 states "Every one is implemented",
and SM-6 asserts every surface passes keyboard-only and screen-reader use. Neither
`prd.md` nor `addendum.md` records that the interface review's own inventory was
truncated by a reporting cap, so an unknown quantity of LOW-tier interface work was
never filed at all. Not a defect claim — a known-unknown the record owns and the
PRD does not.

**Suggested disposition:** one line in `addendum.md` §5 or §7. Not PRD material.

---

## Verification table (task items 2, 3, 4)

Verdicts are against the documentary record and the repository tree as of
2026-09-15. Nothing was re-executed — in particular row 3f rests on the sprint
file's own recorded probe, not on a rebuild performed here.

| # | Claim under test | Source of truth | Verdict | Note |
|---|---|---|---|---|
| 2a | `prd.md` OQ1 — the empty dashed notice band is "raised and explicitly not answered" in `mobile-chrome-sprints.md` | `mobile-chrome-sprints.md` § "Out of scope, reported not fixed" | **CONFIRMED** | Verbatim: "a question this sprint did not ask and did not answer"; the one-sixth-of-viewport cost is also in the source |
| 2b | `prd.md` OQ2 — Android home-screen install unverified, "follows from the precedence rule, not from observation" | `mobile-chrome-sprints.md` § Verification, last row | **CONFIRMED** | Source wording is near-identical; also `addendum.md` §5 |
| 2c | `prd.md` OQ3 — CI deploy uses an account-wide API key, recorded as residual risk in `cicd-sprints.md` | `cicd-sprints.md` § "Known-not-done"; `docs/decisions.md` §8.10 | **CONFIRMED** | "`BUNNYNET_API_KEY` is an account-wide key… bunny's CLI offered no obvious way to mint one. Recorded as residual risk in §8.10" |
| 2d | `prd.md` OQ4 — RTL recorded as unreviewed rather than dismissed, no owner, no revisit condition | `interface-sprints.md` § Verification prerequisites, § Out of scope, § "Still not verified" | **CONFIRMED** | Stated three times; no owner or trigger anywhere |
| 2f | `prd.md` OQ5 — nothing defines the precondition for the first real Mainnet funding | no sprint source claimed | **CONFIRMED (no source to refute)** | Internal to `prd.md` §7/§9.6; the only precondition anywhere in the record is the manual Testnet pass, which OQ5 already names |
| 2e | `prd.md` OQ6 — `app-versioning-and-updates.md` (V1–V4) **and** `in-app-notices.md` (N1–N4) still present shipped decisions as open | both epic files | **PARTIAL / half REFUTED** | See **F5**. V1–V4 are struck through under the heading "All four are now answered (2026-09-02)". N1–N4 are genuinely still open-styled |
| 3a | Three protected branches `dev` → `stage` → `prod` | `cicd-sprints.md` S14, status block, and § "Verified, not assumed" | **CONFIRMED** | Protection itself is not visible in the tree — GitHub rulesets live server-side; the evidence is the recorded `GH013` rejection of a direct push to `prod` plus the blocked `dev`→`prod` PR. `ci.yml:9-11` shows only that all three branches are gated by CI. `prod` is the default branch, deliberately no `main` |
| 3b | A `promotion-source` check enforcing tree equality rather than a branch name | `docs/decisions.md` §11; `ci.yml:128` | **CONFIRMED** (addendum correct; sprint file stale) | `git diff --quiet origin/<source> <head-sha>`, with `fetch-depth: 0` and an explicit refspec fetch. `cicd-sprints.md` still describes the superseded name check — see **F4** |
| 3c | Four CI gates | `ci.yml` jobs `lint`, `build`, `test`, `contrast` (+ `promotion-source`) | **CONFIRMED** | `build` includes `tsc -b`; `promotion-source` is a fifth required check but not a quality gate |
| 3d | Both environments deploying from CI to bunny.net | `deploy.yml:7` (`branches: [stage, prod]`); `cicd-sprints.md` § Live endpoints | **CONFIRMED** | Two pull zones, 6467751 (prod) / 6467652 (stage) |
| 3e | Release identity via a static release manifest | `deploy.yml:50` "Generate release manifest"; `cicd-sprints.md` (`releases.json`, US-7); epic V3 | **CONFIRMED** | Same-origin static JSON, deliberately not the GitHub Releases API |
| 3f | Byte-identical rebuilds | `cicd-sprints.md` § "Verified, not assumed"; `docs/decisions.md` §8.6 | **CONFIRMED** | "Two clean builds → byte-identical across all 17 files"; the `new Date()` defect that broke it was found and fixed in-sprint |
| 3g | Residual risk CD-6 (CDN origin vs. "no backend exists to compromise") | `cicd-sprints.md` CD-6 | **CONFIRMED** | Carried in `prd.md` §9.3 and `addendum.md` §4, including the unmitigated remainder (a user who accepts without checking) |
| 3h | Residual risk: account-wide `BUNNYNET_API_KEY` | `cicd-sprints.md` § Known-not-done | **CONFIRMED** | Also `prd.md` OQ3 |
| 3i | Residual risk: hashed assets cached `max-age=0` | `cicd-sprints.md` § Known-not-done | **CONFIRMED** | "No working per-path cache lever exists in this API surface — see §8.7. Safe, wasteful, revisit if bunny fixes it" |
| 4a | `bugfix-sprints.md` § Coverage says "All 10 epics are implemented" when there are twelve | `bugfix-sprints.md:152` | **CONFIRMED** | Verbatim. The count was correct on 2026-09-01 and the last two epics closed 2026-09-02, so this is genuine drift and `addendum.md` §7 reports it accurately |
| 4b | `notices-sprints.md` still says N2 "Blocks S17" when S17 is complete | `notices-sprints.md:74`, `:170`; `in-app-notices.md:148` | **PARTIAL** | The literal phrase "**Blocks S17**" is in the **epic** file, which is what `addendum.md` §7 actually cites — accurate there. `notices-sprints.md`'s own table lists N2 against a live `Blocks` column reading `S17`, and S17's header still says "Blocked on: N1 …, N2, N3", so the sprint file carries the same drift in a different form. Both are stale against that file's own status block ("N1–N4 decided in `docs/decisions.md` §9") |
| 5 | Any sprint **decision** contradicting the PRD | all five files | **NONE FOUND** | Checked: M12/§5.1 auto-lock (immediate on coarse pointer, 30s desktop) = FR-11; M13 Web Push permanently deferred = §5; M14 failover = FR-41 (see F9); FSL-1.1-ALv2 and `xrpl-bench` = §9.5; `prod` as default branch = §9.3's delivery model; E2E-out-of-CI = SM-4's four gates and §6.2; N1–N4 as built = FR-53–FR-56; the dark-floor manifest colour = no PRD visual requirement by design |

---

## Items checked and found correctly carried (no action)

Recorded so they are not re-reported:

- `bugfix-sprints.md` L12 — "the live testnet integration pass is not automated,
  still worth doing manually before any release" → `prd.md` §6.2 and
  `addendum.md` §5.
- `interface-sprints.md` — RTL, automated axe audit, emulated-rather-than-real
  200% zoom → `prd.md` §6.2 / OQ4 and `addendum.md` §5.
- `interface-sprints.md` § "Found during execution" — the multi-wallet lesson →
  `addendum.md` §5 as a standing rule.
- `mobile-chrome-sprints.md` — live colour-scheme `change` listener unverified,
  Android install unverified → `addendum.md` §5, `prd.md` OQ1/OQ2.
- `cicd-sprints.md` § Explicitly out of scope — Cloudflare, GitHub MCP, dependency
  automation, E2E in CI → `addendum.md` §3.
- `interface-sprints.md` § Out of scope — `canSend` disable-until-valid →
  `addendum.md` §3.
- `notices-sprints.md` NA-5/NA-8 — sonner removed, unlayered CSS island deleted →
  `addendum.md` §3 and `DESIGN.md`.
- The dark browser-tab row in `mobile-chrome-sprints.md` § Verification
  ("verified indirectly… the token matching the literal, not an observed status
  bar") is adequately covered by `addendum.md` §5's colour-scheme bullet plus
  `interface-sprints.md`'s emulated dark render; not filed as a gap.
