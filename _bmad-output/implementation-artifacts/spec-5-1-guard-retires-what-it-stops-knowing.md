---
title: 'Story 5.1 follow-up — the guard retires what it stops knowing'
type: 'bugfix'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3013e832add0659ee30775d46590ca837091d3a6'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 5.1 closed the guard on what the Send screen *does not know*, but
four states it once knew are never retired. The post-unlock re-read fetches
`exists` and `hasTrustLine` and drops them on the floor, checking only
`requireDestTag`. `confirming` is never cleared when the dialog's computed `open`
goes false, so a successful "Check again" reopens the spend confirmation with
nobody asking. A refusal is stamped with `(network, destination, asset)` only, so
"enter the tag the recipient gave you" stays on screen after the tag is entered.
And freshness rests on a single `setTimeout`, which a slept tab can outlive.

**Approach:** Every statement the guard puts on screen retires when the thing it
describes stops being true — a refusal on its own cause, not on an unrelated
input triple; the confirm step on the guard that opened it; and the freshness
clock on the tab's return as well as on its timer.

## Boundaries & Constraints

**Always:**
- A refusal retires on the condition that caused it. `tag-required` retires when a
  tag is present; `guard-closed` retires when the form is ready again. The
  `(network, destination, asset)` stamp stays as the outer bound.
- The confirm dialog's `confirming` state and its computed `open` never disagree:
  when the guard withdraws the dialog, the intent to confirm goes with it.
- The freshness clock only ever moves forward, and rendering still never reads
  `Date.now()` directly — the reading is taken by an effect, as it is today.
- A destination fact the operator was *shown* may not silently change under them
  between the displayed check and the submission.
- **Decided:** the post-unlock re-read refuses on `exists` or `hasTrustLine` only
  when the re-read *contradicts the answer the operator was shown* — shown
  activated and now not, shown a trust line and now none. It does not refuse on
  a fact that was already false on screen: sending to an unactivated address is
  how an account is activated, and this wallet supports that. Neither fact joins
  `canSend`; both keep warning without blocking.

**Never:**
- No new runtime dependency, no new colour token, no change to the panel
  vocabulary. Reuse `QueryErrorState` and the existing `Alert` tones.
- Do not widen `DESTINATION_CHECK_FRESHNESS_MS` or make going stale trigger a
  read — story 5.1's frozen decision stands: the app does not silently re-read
  and does not poll.
- Do not touch stories 5.2–5.5, and do not route these failures to the
  Annunciator; they belong inline on the form.
- No polling and no interval. The tab-return reading is event-driven.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Tag entered after a tag-required refusal | Refusal shown, operator types a valid tag | The refusal disappears; the form is sendable again | N/A |
| Amount fixed after a guard-closed refusal | Refusal shown, operator corrects the amount so it fits | The refusal disappears | N/A |
| Check recovers after the dialog was withdrawn | Dialog hidden by a stale check, "Check again" succeeds | The form is sendable; the confirm dialog does **not** reopen on its own | N/A |
| Tab returns after the timer was throttled | Check expired while the tab was hidden or asleep | On return, the guard is closed and the out-of-date panel is shown | N/A |
| Re-read contradicts a fact the operator was shown | Displayed check said activated / trust line present; re-read says otherwise | Not submitted; the changed fact is named | Inline refusal, no fee spent |
| Re-read agrees with what was shown | Destination unactivated, and it was unactivated on screen too | Submitted — activating an account is a legitimate send | N/A |

</frozen-after-approval>

## Code Map

- `src/pages/tabs/SendTab.tsx` — the whole change.
  - `:124-160` guard derivation: `preflight`, `destCheckMatchesInput`,
    `checkedAt`, `checkExpiresAt`, `destCheckFresh`, `destCheckOk`,
    `destCheckStale`, `destCheckPending`.
  - `:162-170` the single `setTimeout` effect writing `observedNow`.
  - `:57-72` `preflightReport` state — the stamp to widen.
  - `:216-300` `doSend`: the `busy` re-entry return, the guard branch, the
    post-unlock `fetchDestinationInfoOnce`, the `requireDestTag`-only check.
  - `:433,:443` the two warning panels — read `exists` / `hasTrustLine`; they
    gate nothing today and must keep warning without blocking.
  - `:578` `<Dialog open={confirming && (destCheckOk || busy)}>` — the disagreement.
- `src/hooks/useAutoLock.ts:58,75` — the repo's `visibilitychange` idiom; reuse
  its shape, not its logic. Note `BACKGROUND_GRACE_MS` is also 30 000 ms, so a
  tab hidden longer than the freshness window locks the app anyway.
- `src/lib/xrpl/query-reads.ts:29-95` — `DESTINATION_CHECK_FRESHNESS_MS`,
  `DestinationInfo` (carries the triple), `fetchDestinationInfoOnce`. Do not
  change the constant or the probe's `staleTime`.
- `src/pages/tabs/__tests__/send-destination-error.test.tsx` — the suite. Reuse
  `query({ ageMs })`, `info({...})`, `settleClock()`, `reviewAndConfirm()`, and
  the `mockImplementationOnce` promise-release shape for a held unlock.
- `_bmad-output/implementation-artifacts/spec-5-3-fee-read-not-zero.md:166-169` —
  the four action items; tick them when done.

## Tasks & Acceptance

**Execution:**
- [x] `src/pages/tabs/SendTab.tsx` — retire each refusal on its own cause, keeping the triple as the outer bound — a message that outlives its reason is a false statement about the form.
- [x] `src/pages/tabs/SendTab.tsx` — clear `confirming` when the dialog's computed `open` goes false and no send is in flight — so a recovered check cannot reopen a spend confirmation nobody asked for.
- [x] `src/pages/tabs/SendTab.tsx` — take a freshness reading on `visibilitychange` → visible as well as on the timer, and have the timer's own reading use the later of its scheduled moment and the real clock — a slept tab must not return to a guard that is open on an expired check.
- [x] `src/pages/tabs/SendTab.tsx` — refuse when the re-read contradicts a destination fact the operator was shown, comparing the probe's answer against the displayed one rather than against a constant — an unactivated address that was unactivated on screen is a legitimate activation send.
- [x] `src/pages/tabs/__tests__/send-destination-error.test.tsx` — cover every I/O matrix row; mutation-check each new assertion, per this repo's standard.

**Acceptance Criteria:**
- Given a refusal on screen, when the operator fixes the condition that caused it, then the refusal disappears without any other input changing.
- Given the confirm dialog was withdrawn by the guard, when the check succeeds again, then the dialog stays closed until the operator opens it.
- Given an expired check and a tab that has just become visible, when the form renders, then the guard is closed and the out-of-date panel is shown, with no read of its own.
- Given every existing assertion in `send-destination-error.test.tsx`, when this change ships, then all of them still pass — the already-working case must not regress.

## Implementation Notes

All four defects are in `src/pages/tabs/SendTab.tsx`; the suite is
`src/pages/tabs/__tests__/send-destination-error.test.tsx`.

**Refusal retirement.** `PreflightReason` is now a named union, and
`preflightReasonStillHolds` switches on it exhaustively — a reason added later
without saying when it stops being true is a compile error. `tag-required`
retires on `tagValid && destTag.length > 0`; `guard-closed` retires on
`canSend`, which is hoisted above the derivation for it (it reads
`isSelfSend`, not `wallet`, so it sits safely before the `if (!wallet)`
return, and nothing inside `canSend` or `fundsError` reads `preflight`, so the
dependency stays one-way). The `(network, destination, asset)` stamp is
unchanged and remains the outer bound.

Three reasons deliberately retire on the stamp alone:

- `failed` — its cause is a read that did not succeed, while the form's own
  observer may still be showing a good earlier answer for the same triple.
  Retiring it on `destCheckOk` would erase the report in exactly the case it
  exists for, and the existing test *does not submit when the re-read fails,
  and reports it inline* proves it: it leaves `useDestinationInfo` successful,
  so `destCheckOk` is true while the refusal is being asserted.
- `not-activated` / `no-trust-line` — the probe writes into the *same* cache
  entry the form observes, so the contradicted fact becomes the displayed one
  within the same tick. Retiring on the fact would take the refusal off screen
  before it could be read, leaving a payment that did not happen unexplained.
  Their cause is the disagreement at that attempt, not the current value.

**The confirm step.** `confirming: boolean` became `confirmingFor: number |
null` — the intent pinned to the `dataUpdatedAt` of the check that formed it —
and `confirmOpen` is derived: `confirmingFor !== null && (busy || (destCheckOk
&& confirmingFor === checkedAt))`. The first shape written was the literal
task wording (an effect clearing `confirming` when the computed `open` went
false); `bun run lint` rejects it under `react(set-state-in-effect)`, whose own
guidance is to derive during render instead. The pin does that and is stronger:
the intent retires with the reading it was formed against rather than being
chased a render later. Recovery from either closing cause — aged out, or an
errored refetch — requires a *successful* fetch, which always bumps
`dataUpdatedAt`, so the withdrawn intent can never be revived by the check
coming back.

One consequence of deriving `open` was made explicit rather than left to
chance: on a throw from the unlock or the submit call, `doSend`'s `catch` now
clears `confirmingFor` itself. Without that the dialog's fate depended on
whether the probe had bumped `dataUpdatedAt` — closing in the app, staying open
under the suite's static mocks. The toast states the failure; re-confirming a
payment after one is an act the operator takes again.

**The freshness clock.** Two writers, both taking readings only — no fetch, no
interval, `DESTINATION_CHECK_FRESHNESS_MS` untouched. The existing timeout now
writes `Math.max(prev, checkExpiresAt, Date.now())`, and a `visibilitychange`
listener (the `useAutoLock` shape, not its logic) writes `Math.max(prev,
Date.now())` when the tab becomes visible. The clock therefore only moves
forward, and rendering still never calls `Date.now()`.

The visibility path is reachable *despite* `BACKGROUND_GRACE_MS` also being
30 000 ms: a tab frozen at t=25 s and visible again at t=45 s was hidden for
20 s — under the autolock grace, so the app does not lock — while the check is
45 s old and its expiry timeout never ran. That precision is in the code
comment so the grace constant is not later read as making the listener
redundant.

**The contradiction check.** `doSend` compares the probe against the answer the
operator was shown, taken from the render closure: `destInfo?.exists === true
&& !latest.exists`, and `destInfo?.hasTrustLine === true && latest.hasTrustLine
=== false`. `=== true` states the "was it shown?" half explicitly, so XRP
(where `hasTrustLine` is undefined) and an address already unactivated on
screen both pass through. Neither fact joins `canSend`; both keep warning
without blocking. Two new `Alert variant="warning"` panels state each refusal —
same tone and vocabulary as the `tag-required` panel beside them, no new token.


## Spec Change Log

## Review Triage Log

| # | Finding (layer) | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | The contradiction guard disarms itself: after a refusal the probe's answer becomes the displayed one, so a second Confirm submits (blind-hunter + edge-case) | `medium` | Behaviour confirmed by reading — but it *follows* the frozen decision, which refuses only a contradiction and explicitly permits sending to an address shown unactivated. Not an intent gap: the frozen text settles the second press. What is wrong is the copy, "Confirm the address with the recipient before sending again", which implies an enforcement that does not exist. | patch (copy) |
| 2 | After that refusal the standing warning and the refusal panel stack as two `role="alert"` panels about one fact (blind-hunter + edge-case) | `medium` | Confirmed: `destCheckOk` stays true and `destInfo.exists` is now false, so both render. Same root cause as #1 — the displayed fact catching up. | patch |
| 3 | `not-activated` / `no-trust-line` retirement is unpinned, and the suite structurally cannot observe it (verification-gap; blind-hunter filed the same blind spot) | `medium` | Pre-verified: retiring them on the current fact leaves 261/261 green, because `useDestinationInfo` is a static mock that never reflects the probe's write-through. | patch |
| 4 | The clock's forward-only floor is unverified (verification-gap) | `medium` | Pre-verified: replacing both callbacks with plain `Date.now()` leaves 261/261 green. A backward wall-clock step then reopens the guard on an expired check. | patch |
| 5 | The `catch`'s `setConfirmingFor(null)` has no test (verification-gap) | `medium` | Pre-verified: deleting it leaves 261/261 green. A rejected unlock leaves a live spend control over a failure. | patch |
| 6 | `tag-required` retires on `destTag.length > 0` while the refusal is written on `tagValue === undefined` (blind-hunter) | `medium` | Confirmed by direct evaluation: `destTag = ' '` gives `tagValue = 0`, so the two predicates disagree. The divergence is this change's. | patch |
| 7 | …and the same whitespace sends `destinationTag: 0` to a recipient that requires a tag (blind-hunter) | `false` | **Retracted.** Graded `high` and deferred on the arithmetic alone (`Number(' ') === 0`), without checking reachability. `destTag` has two writers — `useState('')` and an `onChange` that applies `.replace(/\D/g, '')` (`SendTab.tsx:641`) — so whitespace never reaches state: `' '` stores as `''` and yields `tagValue === undefined`, the refusing branch. The deferred-work entry written for this was removed. | rejected |
| 8 | The two contradiction guards differ in strictness one line apart (blind-hunter) | `low` | Confirmed. Safe only because the `exists` guard runs first and `query-reads.ts:90` leaves `hasTrustLine` undefined when the account does not exist — an ordering plus a `queryFn` detail, neither stated at the guard. | patch |
| 9 | The Dialog comment cites "the effect above" that does not exist (blind-hunter + edge-case) | `low` | Confirmed: open state is derived during render; lint rejected the effect shape. | patch |
| 10 | The `visibilitychange` comment claims to cover a slept laptop (blind-hunter) | `low` | Confirmed: a resume with the tab already visible fires no `visibilitychange`. The mechanism is right for tab switching; the comment overstates its reach. | patch |
| 11 | `spec-5-3`'s one remaining unticked item has no disposition, and this change's new behaviour is unrecorded there (blind-hunter) | `low` | Confirmed. Fix edits another story's spec, not this build's. | patch |
| 12 | `confirmOpen` gates on `destCheckOk`, not `canSend`, so the dialog can stand over a form the submit path refuses (edge-case) | `false` | Deliberate and documented: the dialog stays so a press produces a *reported* refusal instead of a silently vanishing dialog. Pinned by the existing test `does not submit when the form guard is closed and the control is activated anyway`. | rejected |
| 13 | `guard-closed` retiring on `canSend` lets a recovering background read erase the explanation unread (edge-case) | `false` | Real tension, but it is exactly what the frozen Always mandates: "`guard-closed` retires when the form is ready again." The only fix edits this build's frozen spec. | rejected |

## Verification

**Commands:** all four run green after the final state of the change.

| Command | Result |
|---|---|
| `bun run lint` | exit 0, including `check-query-keys`, `check-sw-register`, `check-layering` |
| `bun run build` | exit 0, `tsc -b` clean |
| `bun run test` | exit 0 — 263 passed, 28 files (253 on the baseline commit; `send-destination-error.test.tsx`: 59, was 49 — all 49 pre-existing assertions still pass) |
| `bun run check:contrast` | exit 0, no new token measured |

**Mutation checks (run by this session, each mutation applied to
`SendTab.tsx`, the suite run, then reverted).** Every one failed exactly one
test, and the test it failed is the one that covers it:

| Mutation | Test that failed |
|---|---|
| `confirmOpen` drops the `confirmingFor === checkedAt` pin (i.e. the old boolean behaviour) | does not reopen the confirm step when a withdrawn check recovers |
| `case 'tag-required': return true` | retires the tag-required refusal once the tag it asked for is entered |
| `case 'guard-closed': return true` | retires the guard-closed refusal once the form is ready again |
| the `visibilitychange` reading deleted | closes the guard when the tab comes back to an expiry its timer never fired |
| the activation contradiction check deleted | does not submit when the re-read contradicts the activation it showed |
| the trust-line contradiction check deleted | does not submit when the re-read contradicts the trust line it showed |
| activation check **broadened** to `if (!latest.exists)` | submits when the re-read agrees the destination was never activated |
| trust-line check **broadened** to `if (latest.hasTrustLine === false)` | submits when the re-read agrees the recipient has no trust line |
| `not-activated` / `no-trust-line` retire on the current fact instead of the stamp | both *does not submit when the re-read contradicts…* tests |
| the standing "Destination not activated" warning not suppressed under its refusal | does not submit when the re-read contradicts the activation it showed |
| the standing "Recipient can't hold this token" warning not suppressed under its refusal | does not submit when the re-read contradicts the trust line it showed |
| the visibility reading replaces rather than floors (`setObservedNow(Date.now())`) | never lets the freshness clock run backwards |
| the `catch`'s `setConfirmingFor(null)` deleted | takes the confirm step away when the unlock throws |

The last two are broadenings rather than removals on purpose: the two
"re-read agrees" rows pass today, so reverting what they cover leaves them
green. Refusing on the fact rather than on the contradiction is the mutation
that makes them fail, and it is the one the Decided clause forbids.

**Three things are not pinned by a test, each for a stated reason.**

- The *timer* callback's `Math.max(prev, checkExpiresAt, ...)` — both the
  `checkExpiresAt` term and the `prev` floor. Under `@sinonjs/fake-timers` a
  timeout always fires with the mocked `Date` set to its own scheduled moment,
  and `prev` can never exceed that moment at the instant it fires, so
  `setObservedNow(Date.now())` is indistinguishable there. The forward-only
  floor *is* pinned on the visibility callback, which is the reading a
  backwards clock can actually reach (*never lets the freshness clock run
  backwards*). The term guards a clock reading behind its own timeout — a
  coarsened `Date.now()`, as under Firefox's `privacy.resistFingerprinting`.
- `preflightReasonStillHolds`'s `tag-required` case reads `tagValue ===
  undefined`, the predicate the submit path itself uses. The previous form
  (`!(tagValid && destTag.length > 0)`) differs only on input the tag field
  cannot produce — its `onChange` strips every non-digit, so a whitespace-only
  value never reaches state — which is why swapping the two leaves the suite
  green. The change is correctness of derivation, not reachable behaviour; the
  whitespace defect behind it is recorded in `deferred-work.md`.

**Browser pass: NOT RUN — the two new panels are unseen.**

`docs/agents/verifying-your-work.md` wants a real browser for a visual change,
and two new `Alert` panels are one. They are structural siblings of the
`preflight === 'guard-closed'` panel already on this screen, with the same
variant, the same `AlertTitle`/`AlertDescription` shape and no new token, so
the risk is wording and wrap at 320 px rather than tone or contrast. The block
is the one story 5.3 recorded: wallet setup calls
`navigator.credentials.create()`, which never resolves in the headless browser
available here, so the Send screen cannot be reached. Closing this needs a
virtual authenticator (CDP `WebAuthn.addVirtualAuthenticator`) or a human.

**Manual checks:**
- Each new assertion mutation-checked: see the table above.
