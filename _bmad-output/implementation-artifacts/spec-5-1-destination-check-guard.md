---
title: 'Story 5.1 — a destination check that failed cannot permit a send'
type: 'bugfix'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '93f41b5f591905b14816c4ffd8ea4778574f458b'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `SendTab.tsx:68` closes the send guard only on an *errored* read with
no retained data. Three states still read as permission: a failed refetch that kept
an earlier answer, a read not completed for the address now in the field, and a
successful answer older than its freshness window (`useDestinationInfo.ts:33`
carries `staleTime: 30_000`). Each ends in the same unrecoverable loss — a tagless
payment to an address that requires a tag (G-10, AD-13).

**Approach:** Invert the guard from "no error seen" to "a read succeeded for the
input on screen and is still fresh", and re-run that check inside the submit path
through `queryClient.fetchQuery` on the factory key, so the permission that
authorises the payment is a read, not the absence of one.

## Boundaries & Constraints

**Always:**
- The guard is satisfied only by a read that succeeded for the `(network,
  destination, asset)` triple currently on screen, within its freshness window.
  Absence of a prohibition is not permission (AD-13).
- The guard runs inside the submit path, immediately before the payment is
  submitted — after `unlockWalletForSigning`, which can take seconds — and also
  gates the confirm step, so no dialog opens on a check that will be refused.
- The pre-flight re-read uses `queryClient.fetchQuery` with
  `queryKeys.destinationInfo(...)` (decisions.md §5.4).
- Every state the guard closes on has its own visible, accurate reason: a check
  that succeeded 40 seconds ago did not *fail* and must not say it did (AD-15).
- The freshness window is its own named constant, not a reuse of `staleTime`.
- **Decided:** a check that has aged past the window says so in its own words and
  offers "Check again". The app does not silently re-read on going stale, and does
  not poll to keep the answer warm.
- **Decided:** the Review button keeps native `disabled`. The `docs/decisions.md`
  §6.4 `aria-disabled` breach at `SendTab.tsx:279` is recorded in
  `deferred-work.md`, not fixed here — `canSend` composes seven conditions and
  each would need its own visible reason.

**Never:**
- No new runtime dependency, no new colour token, no change to the panel
  vocabulary. Reuse `QueryErrorState` and the existing `Alert` tones.
- Do not touch stories 5.2–5.5, and do not route this failure to the Annunciator;
  it belongs inline on the form.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Check succeeded, fresh, no tag required | `isSuccess`, input matches, age < window | Send permitted, as today | N/A |
| Check succeeded, fresh, tag required, field empty | `requireDestTag: true` | Blocked, reason in visible text — unchanged | N/A |
| Read errored, no retained data | `isError`, `data` undefined | Blocked; "Destination check failed" with retry, as today | Inline |
| Read errored, earlier answer retained | `isError`, `data` present | Blocked — the retained answer does not satisfy the guard | Inline |
| Read not completed for this address | address edited, query in flight or idle | Blocked while unknown; "Checking destination…" | Not an error |
| Answer older than the freshness window | `isSuccess`, age ≥ window | Blocked; text says the check is out of date, not that it failed | Inline |
| Asset switched after a successful check | triple no longer matches | Blocked until re-checked — `hasTrustLine` means something else now | Inline |
| Submit-path re-read fails | `fetchQuery` rejects inside `doSend` | Payment not submitted; failure reported; no fee spent | Inline |
| Submit-path re-read returns `requireDestTag` newly true | flag set between reads | Payment not submitted; the new requirement is shown | Inline |

</frozen-after-approval>

## Code Map

- `src/pages/tabs/SendTab.tsx:68` — `destCheckFailed`, the defect. `:148-160`
  `canSend`; `:155` the `!destInfo?.requireDestTag` condition; `:216` the tag
  label's three-way copy; `:279` the Review button and `setConfirming(true)`;
  `:100` `doSend`, which today guards only `!wallet || !vaultKey` and awaits
  `unlockWalletForSigning` before submitting.
- `src/hooks/useDestinationInfo.ts` — the hook; `queryFn` reads
  `fetchAccountState` and, for issued assets, `fetchAccountLines`. `:33`
  `staleTime: 30_000`. Its `DestinationInfo` payload does not record which input
  it answered for, which is why the triple comparison is impossible today.
- `src/lib/xrpl/query-reads.ts:21` — `fetchAccountStateOnce`, the blessed
  pre-flight shape to copy: `queryClient.fetchQuery` + a factory key. Callers at
  `Onboarding.tsx:102`, `SettingsTab.tsx:74`.
- `src/lib/xrpl/query-keys.ts:57` — `destinationInfo(network, destination, asset)`,
  destination-scoped by design. No new key or named exception is needed.
- `src/components/wallet/QueryErrorState.tsx` — the inline failure surface to
  reuse; already used by `SendTab.tsx`.
- `src/pages/tabs/__tests__/send-destination-error.test.tsx` — module-mocks
  `@/hooks/useDestinationInfo` and `@tanstack/react-query`, so there is no real
  QueryClient and no `dataUpdatedAt` today; the mock factory must grow both.
- **Reuse, do not change:** `queryKeys`, `QueryErrorState`, the `Alert` tones,
  the not-activated and no-trust-line warnings, and the tag-required copy.

## Tasks & Acceptance

**Execution:**

- [x] `src/hooks/useDestinationInfo.ts` — have the payload carry the `(network,
      destination, asset)` triple it answered for, and export shared query
      options so the hook and the pre-flight probe cannot drift apart.
- [x] `src/lib/xrpl/query-reads.ts` — add the destination-info one-shot in the
      `fetchAccountStateOnce` idiom, forcing a read no older than the window.
- [x] `src/pages/tabs/SendTab.tsx` — replace `destCheckFailed` with a positive
      `destCheckOk` over the four conditions; name the freshness constant here or
      beside the hook; feed `canSend`; add the out-of-date panel with its own
      wording and a "Check again" control.
- [x] `src/pages/tabs/SendTab.tsx` — guard the confirm step and re-check inside
      `doSend` immediately before submitting, after the unlock.
- [x] `src/pages/tabs/__tests__/send-destination-error.test.tsx` — pin each
      closing condition separately (errored-with-retained-data, input mismatch,
      stale), the submit-path re-check, and the unchanged success cases.

**Acceptance Criteria:**

- Given a successful check followed by a failed refetch that retains the earlier
  answer, when the send is attempted, then it is blocked.
- Given the freshness window has elapsed on a successful check, when the guard is
  evaluated, then it is not satisfied — and the test proves it with a controlled
  clock, not a real wait.
- Given the Review button is activated by a means that bypasses its disabled
  state, when `doSend` runs, then the payment is not submitted without a fresh
  successful check.
- Given the destination requires a tag and the field is empty, when the form
  renders, then the send is blocked with the reason in visible text, as today.
- Given `bun run lint`, `bun run build`, `bun run test` and
  `bun run check:contrast`, when each runs, then all four exit 0.

## Implementation Notes

**The shared query options live in `lib`, not in the hook.** The task line asks
`useDestinationInfo.ts` to export them; exporting them from there would make
`lib/xrpl/query-reads.ts` import from `src/hooks`, against AD-1's one-way
dependency chain (`pages` → `components` → `hooks` → `lib`) — and
`check-layering` would not catch it, since it only guards `lib`/`store` against
`components`/`pages`. So `destinationInfoQueryOptions`, the `DestinationInfo`
payload and `DESTINATION_CHECK_FRESHNESS_MS` sit in `query-reads.ts` beside
`fetchAccountStateOnce`, the hook spreads the options, and the hook re-exports
the type. The outcome the task asks for — one definition of key, freshness and
`queryFn`, shared by the hook and the probe — is unchanged.

**Freshness is read from state, not from a clock call in the render body.**
oxlint's `react(purity)` rule rejects a clock read in the render body, and
`react(set-state-in-effect)` rejects a synchronous `setState` inside an effect.
The form therefore keeps an `observedNow` state, seeded by React through
`useState(Date.now)` and thereafter written only by a `setTimeout`
armed at the check's expiry (`Math.max(0, …)`, so a check that was already old
when it arrived from the cache is settled on the next macrotask). It arms one
timer per successful check, fires once, reads no ledger and moves no data — it
is the re-render that stops the screen claiming a permission it no longer has,
not a poll and not a silent re-read.

**One frame's window on a re-selected old answer, deliberately left.**
`observedNow` starts at mount time (`useState(Date.now)`, so the clock is read
by React, not by the render body), which closes the guard on the first render
for an answer restored from the cache already stale. It then only advances when
a timer fires, so re-selecting an answer that aged out while it was off screen
(check at T, address edited away at T+10 clearing the timer, edited back at
T+40) renders one frame with the guard open before the re-armed
`Math.max(0, …)` timer closes it on the next macrotask. Sub-frame,
self-correcting, and not money-reachable: the submit-path `fetchQuery` carries
`staleTime = DESTINATION_CHECK_FRESHNESS_MS`, so a 40-second-old entry forces a
real read before anything is signed. Recorded rather than engineered away,
because closing it means reading the clock during render — the thing that made
the guard untestable.

**The confirm step is gated on `destCheckOk`, not on the control that opened
it.** A guard in the Review button's `onClick` would have been unreachable and
untestable: React drops a mouse event on a `disabled` control before any handler
runs. The dialog's own `open` therefore carries the check, so a check that fails
or ages out while the dialog is up takes the dialog down with it. `canSend` is
deliberately not that condition — it goes false on `busy` the moment the send
starts, which would close the dialog mid-send.

**The submit-path refusal is stored with the triple it is about** and read back
only while that triple still matches, rather than cleared from each field's
`onChange`. A network switch passes through no field handler, and a refusal
about testnet displayed on mainnet is not a smaller truth but a false one. The
same comparison also retires it on a destination, tag or asset change, and the
derived read avoids a `setState` in an effect, which oxlint rejects.

**"Checking destination…" keeps its old trigger as well as the new one.** It now
shows whenever the read has not completed *for what is in the field now*, and
still shows on any `isFetching` — including a background refetch of an answer
that is still fresh. Dropping the second would have been an unrecorded
behaviour change beyond the failure reporting this story specifies.

**The guard drives the tag label as well as `canSend`.** Leaving the label's
middle branch keyed to `isError` would have re-created the original defect in a
new costume: a stale or mismatched check would still have read "(optional)",
which is the sentence that loses the money. With no valid address in the field
at all, the label keeps its original "(optional)" wording — nothing has been
asked of the ledger yet and no send is possible.

**Retained data is no longer rendered at all while the read is in error.** The
not-activated and no-trust-line warnings read `destQuery.data` directly, so an
errored refetch left warnings derived from an earlier answer on screen
(`docs/decisions.md` §12, rule 2). Both are now gated on `destCheckOk`. Their
wording is untouched.

**The submit path's two refusals report inline and close the dialog.** A
`fetchQuery` rejection inside the existing `try` would have reached the generic
`catch` and become a toast — the Annunciator, which this story's boundaries
forbid. Both refusals (read failed, tag newly required) set their own inline
state, close the confirm dialog and return before anything is submitted; each
says in its own words that nothing was sent and no fee was spent. The same
happens when the guard is closed at the moment the confirm control is
activated: the dialog closes so the reason already on the form is visible,
rather than a press that silently does nothing.

**The confirm dialog is held open for a submit already authorised.** Gating it
on `confirming && destCheckOk` alone tore it down mid-send: the expiry timer is
independent of `busy`, so a check aging out during `unlockWalletForSigning`
pulled "Sending…" off the screen while the payment was in flight, leaving the
operator with no sign one had been submitted — the inverse of this story's own
rule about a screen saying what it knows. The condition is
`confirming && (destCheckOk || busy)`, so the dialog still disappears the moment
a check stops holding *before* a send starts, and stays put once one is under
way. Found after the review pass, so it carries no triage row; pinned by a test
that fails when `|| busy` is removed.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | The submit-path probe's freshness window is asserted only against a mocked `fetchQuery`; raising the shared `staleTime` would let a minutes-old cached answer authorise a payment with every gate green | **medium** | Pre-verified by the verification-gap layer. `send-destination-error.test.tsx:16-18` module-mocks `@tanstack/react-query`, so `fetchQuery` is a bare `vi.fn` with no cache; the only assertion on it is `objectContaining({ queryKey })`. | patch |
| 2 | Nothing executes the `queryFn` that stamps the `(network, destination, asset)` triple the guard compares against; dropping a field blocks every send with all four gates green | **medium** | Pre-verified. The screen test hand-builds the payload in its own `info()` factory, so the producer never runs. | patch |
| 3 | `useDestinationInfo` is absent from `query-key-wiring.test.tsx`, the suite written precisely to catch a key swap that leaves lint, build and tests green | **medium** | Pre-verified. That suite covers four hooks and the `fetchAccountStateOnce` probe pair; swapping `destinationInfo` for `accountState` passes `tsc` and every gate. | patch |
| 4 | `preflight` is cleared on the destination, tag and asset edits but not on a network switch, so "this address now requires a destination tag" persists while describing a different ledger | **medium** | Verified: the three clears are `onChange` handlers; `network` comes from the store. A false statement on screen — §12's cardinal sin — though the send itself is blocked, since the key change closes the guard. | patch |
| 5 | `preflight === 'failed'` and `destQuery.isError` are independent, so a rejected probe renders two destructive panels with overlapping copy and two retry controls | **medium** | Verified: `fetchQuery` errors the shared cache entry the mounted observer watches, so both conditions hold at once. Nothing picks a winner. | patch |
| 6 | The `if (!canSend \|\| !destCheckOk)` refusal at the top of `doSend` is the only refusal that states nothing — it closes the dialog and returns | **medium** | Verified: it sets no reason state, unlike both `preflight` refusals. The comment's claim that the form behind is already reporting holds for the panel, but the operator who pressed "Confirm and send" gets only a vanishing dialog. | patch |
| 7 | `observedNow` initialises to `0`, so the guard is open for the whole first render on a cached answer of any age, and no test pins mounting with an already-expired entry | **low** | Verified. Recorded deliberately in Implementation Notes and not money-reachable — the submit path's `fetchQuery` carries the window — but the mount case is untested, which is the half worth closing. | patch |
| 8 | `let latest` in `doSend` is an evolving implicit `any` | **low** | Verified. A later change to `fetchDestinationInfoOnce`'s return type would widen silently rather than fail at the guard. | patch |
| 9 | The test `does not open the confirm step on a check the submit path would refuse` clicks a button whose `disabled` is true, so React suppresses `onClick` and the assertion holds with the new inline guard removed | **medium** | Verified at `send-destination-error.test.tsx:342-352`. Same vacuous-assertion class the repo hit in Epic 1 and in spec 3's finding #6. | patch |
| 10 | `unlockWalletForSigning` is mocked to resolve the *destination* address as the signing wallet | **low** | Verified in the test setup. Nothing asserts on it, but it describes a state the app cannot be in and reads as a self-send. | patch |
| 11 | The `destQuery.isFetching` half of the "Checking destination…" condition is never exercised; every fixture hardcodes `isFetching: false` | **low** | Verified. Implementation Notes call keeping that trigger deliberate, yet removing it fails nothing. Cheap to pin while the file is open. | patch |
| 12 | `sprint-status.yaml` has the story at `in-progress` while the spec frontmatter says `in-review` | **low** | Verified. Workflow bookkeeping, not code: step-03 syncs `in-progress` and the sync to `review` belongs to the presentation step. | patch |
| 13 | The submit-path re-read consumes only `latest.requireDestTag`; the fresh `exists` and `hasTrustLine` are discarded, so a de-activated destination or a removed trust line submits and burns a fee | **medium** | Verified, and raised independently by all three layers. But both facts were warnings and never members of `canSend` before this change; turning them into refusals is a behaviour change past this story's intent. Fee lost, not funds. | defer |
| 14 | The pre-flight `fetchQuery` has no timeout or abort, and `Cancel` is `disabled={busy}`, so a stalled read leaves the modal in "Sending…" with no way out and the decrypted signing wallet held in a local | **medium** | Verified, and narrower than filed: the client has a 10s connect timeout (`client.ts:43`) and `App.tsx:24` sets `retry: 1`, not the default 3 — so it is bounded, not open-ended. A request after connect still has no timeout. Fix needs a race or abort path. | defer |
| 15 | A backgrounded tab or suspended device clamps the expiry `setTimeout`, so the guard can stay open on an arbitrarily old check | **low** | Real in principle, but not reachable for money: the submit path re-reads with the window as its `staleTime` regardless of what the screen shows. The fix adds a `visibilitychange` listener — more than a direct correction for a bounded display defect. | reject |
| 16 | Gating the not-activated and no-trust-line warnings on `destCheckOk` means a stale check hides the specific reason an address is unsuitable | **low** | By design and stated: the send is blocked and the out-of-date panel says why. Restoring the warnings on stale data would render a non-current answer as current. Fix adds a branch. | reject |
| 17 | The stale panel's "Check again" has no in-flight state, so a click gives no feedback | **false** | Refuted: `destQuery.isFetching` renders "Checking destination…" directly above the panel for the duration of the refetch, so the re-check is reported — on a different element than the reviewer looked at. | reject |
| 18 | `!destCheckOk` in `doSend`'s refusal is redundant, since `canSend` already contains it | **low** | True but deliberate, and the comment above it already says the conditions are re-asserted. The fix is a deletion that removes defence-in-depth against exactly the `canSend` refactor the finding itself names, on a money path. | reject |
| 19 | The task line says `useDestinationInfo.ts` exports the shared options and names the freshness constant, but both live in `query-reads.ts` | **false** | The deviation is recorded in Implementation Notes with its AD-1 reason, and the only fix available would be to edit this build's spec — rejected by rule. | reject |

## Verification

**Commands:**
- `bun run lint` — expected: exit 0, including `check-query-keys` and `check-layering`.
- `bun run build` — expected: exit 0.
- `bun run test` — expected: exit 0, with the new conditions failing before the fix and passing after.
- `bun run check:contrast` — expected: exit 0.

**Ran, all four green** (2026-09-16): `bun run lint`, `bun run build`,
`bun run test`, `bun run check:contrast`. The destination read also gained
cases in `src/hooks/__tests__/query-key-wiring.test.tsx` against a real
`QueryClient` — the key it lands on, the probe reusing that entry, the triple
stamped on the payload, and the freshness window forcing a read — each
confirmed to fail under the corresponding one-line mutation. The new conditions were
confirmed red before the fix: restoring the old `isError && !data` guard fails 8
of the new assertions, and removing the submit-path re-read fails 3 more.

**Manual checks — partial, and the gap is stated rather than papered over.**

| Observation | Result |
|---|---|
| All four new/changed panels at 320px, light finish | Rendered and read in a real browser. Nothing clipped, both titles wrap, both retry controls reachable. |
| The same panels at 640px (1280px at 200% zoom), dark finish | Rendered and read. Both finishes legible; the tone difference is carried by the title text, not by colour alone. |
| The panels **inside the live Send form**, reached by unlocking a real wallet | **Not done.** Onboarding never gets past "Setting up…" in headless Chromium on this machine — the passkey/key-derivation step does not resolve — so the Send tab could not be reached. The observation above was made by mounting the four panels, with their exact copy, in the same `Card`/`CardContent` vocabulary through a throwaway Vite entry that has since been deleted. What it does **not** prove is how they sit among the form's other elements, or the order they appear in when more than one is live at once. |
