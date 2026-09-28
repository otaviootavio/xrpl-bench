# Epic 5 Context: A figure on screen was actually read

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Five places in the wallet show, or accept as permission, a number that was never
successfully read for the thing currently on screen. Two of them are guards on a
money-moving action — a destination-tag check that a stale or errored read still
satisfies, and an affordability check that runs against a fabricated fee of zero
— and the first of those loses funds unrecoverably. The other three are figures that
vanish without explanation, mislabel a requested amount as a delivered one, or
stay behind because the screen that wrote never discarded the whole set. When
the epic is done, every number on screen came from a read that succeeded for the
input on screen now; anything else renders as *unavailable*, never as absent,
never as stale, never as a confident wrong figure. The wallet gains no new
capability here — it stops being able to tell the operator something untrue.

## Stories

- Story 5.1: A destination check that failed cannot permit a send
- Story 5.2: A failed reserve read is reported, not silently subtracted
- Story 5.3: A fee that could not be read does not become a fee of zero
- Story 5.4: An amount not known to be delivered renders as an upper bound
- Story 5.5: Invalidating account-scoped data goes through one named group

## Requirements & Constraints

- **A guard on a money-moving action fails closed.** It is satisfied only by a
  read that succeeded *for the input currently on screen*. An errored read, data
  retained from an earlier input, and a read outside its freshness window all
  fail it. Absence of a prohibition is never permission. Every transaction
  submission counts as money-moving; there is no second category.
- **A guard lives inside the submit path**, not only on the control. An
  `aria-disabled` button is the required presentation for an unavailable control,
  but it does not prevent activation — dimming alone leaves the action unguarded.
- **Retained data is never rendered as current.** While a read is in error, no
  figure, no derived total and no liveness indicator from an earlier success may
  remain on screen.
- **A failure and an empty result are different facts** and never share a
  rendering. A screen may claim a collection is empty only when its read
  succeeded and came back empty.
- **A failed read is reported where the data would have been**, with a way to
  retry — not by removing the figure. A screen with fewer numbers on it than
  before is the defect, not the fix. Reads that did succeed keep rendering:
  a failed reserve read must not take the XRP balance down with it.
- **A displayed payment amount is the delivered amount.** Anything that is not a
  positive delivered amount renders the requested figure only when labelled as an
  upper bound, and that label must carry meaning beyond colour.
- **Every screen that discards cached account data discards the same set**, so a
  write cannot refresh three figures and leave a fourth current-but-never-
  refreshed.
- No behaviour change visible to the user beyond the failure reporting each
  story specifies. The already-working case — a successful check blocking a
  tagless send with the reason in visible text — must not regress.
- Standing conditions: branch off `dev` (there is no `main`); `bun run lint`,
  `bun run build`, `bun run test` and `bun run check:contrast` all green before
  merge; no `Number()`, `parseFloat` or `toFixed` touches a monetary value; no
  secret enters state, a store, the URL, or anything serializable.

## Technical Decisions

- **One factory owns every query key**, for reads *and* for invalidations. An
  account-scoped key takes the active wallet and the active network; a read that
  is genuinely network-scoped or device-scoped is a *named* function on the
  factory so the exception is visible.
- **The factory owns the invalidation loop.** The account-scoped group is
  exposed as a function that performs the invalidation; call sites pass no query
  key at all. A shape that hands a set back for call sites to iterate is
  explicitly rejected — it creates variable-bound keys the static guard script
  cannot see, making the layer more correct and less enforced at once.
- **Failure surfaces are chosen by cause.** A failed *read* of data with a place
  on screen renders inline through the single `QueryErrorState` component. Only
  things the user *did*, or things that *arrived on their own*, go to the
  notice band via `notify`.
- Selection state (active wallet, active network) has one owner in the store and
  reaches every query through the key factory.
- An imperative one-shot read inside a submit handler uses `fetchQuery` with the
  factory key of the equivalent hook, so a pre-flight probe and the displayed
  value cannot disagree.
- **A rule that governs what a screen may show gets a screen-level test that
  fails when the rule is removed** — not a test that merely passes today.

## UX & Interaction Patterns

- Inline failure reporting sits in the place the missing data would have
  occupied and offers a retry. It does not expire on a timer, and never exposes
  the underlying transport error — that is no more meant for a person than a raw
  result code is.
- An unavailable control is `aria-disabled` with its reason in visible text,
  never hidden.
- A failed read is never presented as a pending one, and a failure that bears on
  a money-moving action surfaces before the confirm step, not after submission.
- Colour never carries meaning alone — the upper-bound label needs text.

## Cross-Story Dependencies

- Story 5.1 goes first and is the expensive fix: a tagless payment to an address
  that began requiring a tag between two reads is unrecoverable. Stopping after
  one story still leaves the epic worth having.
- Stories 5.1 and 5.3 are two instances of the same rule on the same screen and
  both touch the submit path; expect them to interact.
- Story 5.5 is a key-factory change and so resembles the later enforcement epic's
  work, but it lives here because its *harm* is this epic's: without it, Epic 5
  would ship a guarantee it does not keep. It builds directly on the single key
  factory established earlier and on the invalidation sites already migrated to
  it.
