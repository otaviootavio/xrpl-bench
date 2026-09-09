# Scenario: you are making a visual change

Tokens, components, layout, colour, type, copy, motion.
Reasoning: `DESIGN.md` (the system), `docs/decisions.md` §6–§7 (the decisions),
`.impeccable/surfaces/src-pages-main-tsx.md` (the direction contract).

**`DESIGN.md` is the authority on visual decisions. Read it first.** This file
covers only how to behave while editing.

## The world, in one paragraph

The wallet is a bench instrument panel: a chassis (the page), engraved legend
plates (cards), an inset readout well (the balance), indicator lamps (state).
Light and dark are two different materials — pale lab enamel at hue 250, dark
rack steel at hue 125 — not one palette inverted, and the readout well is dark
in both because an instrument's display is dark in a lit room.

## Always

- **Run `bun run check:contrast` after any colour change**, and extend it when
  you add a token. It parses tokens straight out of `src/index.css` and measures
  25 pairs per theme. A token it does not measure is a token outside the rule.
- **Build from the panel vocabulary**, not ad-hoc borders: `.panel-plate`,
  `.panel-well`, `.panel-legend`, `.panel-lamp`. (`.panel-scribe` was removed
  2026-09-02 for having zero call sites — see `DESIGN.md`'s Known Gaps.)
- **Put responsive behaviour in the primitive, not the call site.** `TabsList`
  owns its own breakpoints; a call site passing conflicting Tailwind classes is
  the anti-pattern §6.8 was written about.
- **Keep the legend/value inversion.** A `CardTitle` is a small engraved
  placard and the *value* carries the scale. This is deliberate. Do not "fix" a
  title back to a display heading.
- **Report a failing colour pair; fix it with a token for the missing role.**
  Borrowing a token because its value looks right is the failure mode that
  produced `text-warning` at 2.15:1.

## Never

- **Never** use a fill token (`--destructive`, `--warning`, `--success`,
  `--commit`) as a text colour on a plate. Text uses `--text-*`.
- **Never** spend `--commit` on anything but a control that moves funds. It is
  one Button variant with one call site. A navigation detent, an active state, a
  decorative accent — all forbidden. Its scarcity is the whole signal.
- **Never** use a saturated fill for a control that merely *opens* a confirm
  dialog. That is what the `danger` variant is for; the fill belongs to the
  moment of commitment.
- **Never** style `:focus` or `:focus-visible`, and never write `outline-none`.
  The browser's two-tone ring is the indicator, because it is the only one that
  holds up on every surface a control can land on without being re-measured.
- **Never** convey state by colour alone. Live state is a lamp *plus its word*.
- **Never** add a chroma-zero token. `oklch(… 0 0)` is the one thing no real
  panel is made of, and it was the incumbent surface's signature.
- **Never** add animation without a `prefers-reduced-motion` guard, and never
  ship a class from an animation library that is not installed — §6.10 deleted
  a set of `animate-in` classes that resolved to nothing.
- **Never** hide a control to convey that it is unavailable. Render it
  `aria-disabled` with its reason in *visible* text.
- **Never** uppercase user-authored text. `text-transform` on a wallet label the
  user typed misrepresents their string and can make a screen reader read it as
  an acronym.

## Ask first

- Replacing factual copy, or adding a claim the product cannot back.
- Any change to the visual world itself rather than a change *within* it. The
  world was chosen with the owner through a direction round; departing from it
  is a redesign, not a refinement.

## Before you call a visual change done

Run the mechanical detector once over the changed files, fix what is mechanical,
and read [verifying-your-work.md](verifying-your-work.md) — a screenshot is not
evidence until you have opened it.
