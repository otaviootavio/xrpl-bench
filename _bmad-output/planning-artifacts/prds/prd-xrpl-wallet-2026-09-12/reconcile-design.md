# Input reconciliation — `DESIGN.md` vs. the PRD

Input: `/home/otavio/xxx/xrpl-wallet/DESIGN.md` (frontmatter token sidecar is
inline in the same file; `PRODUCT.md` §Brand calls it "DESIGN.md and its
sidecar"). Reconciled against `prd.md` and `addendum.md` in this run folder.

## Verdict on addendum §6

**The position holds.** "The PRD deliberately carries no visual requirements
beyond the accessibility NFRs" is accurate and defensible as written.

The filter applied: absence of DESIGN.md's text from the PRD is not a gap,
because `prd.md` §0's authoritative-document table names `DESIGN.md` binding for
"tokens, panel vocabulary, **named rules**." Every named rule in DESIGN.md is
therefore *pointed to* — the Reservation Rule, Lamp-Plus-Word, Annunciator,
Measured-Not-Judged, No-Chroma-Zero, Barbell, Legend/Value Inversion,
Tabular-By-Construction, Screen-Names-Itself, Earned-Recess, Diffuse-Light,
Real-Structure. None of them is a PRD gap. Nor is there any qualitative
product commitment in DESIGN.md that the PRD neither states nor reaches: the
consequence grammar DESIGN.md renders (commit orange rationed to the
fund-moving control class; `danger` for a control that merely opens a
destructive dialog; saturated fill only on the in-dialog confirm key) is the
visual expression of NFR-7 and §9.1, which the PRD does state.

What the reconciliation did find is narrower and more useful: **two wording
defects inside requirements the PRD already carries**, one **stale fact in the
addendum**, and one **gap in DESIGN.md itself**. Ranked by the only
discriminator that survives the pointer rule — does the PRD's own wording send
a downstream reader the wrong way?

### Agreement inventory (checked, no action)

NFR-5 ↔ "**Focus:** nothing. The browser's own two-tone ring is the indicator"
and "`outline-none` is banned repo-wide", including skip-link landing targets.
NFR-9 ↔ the function selector at `grid-cols-3`/`grid-cols-6` with no fixed
height, "every function is reachable at 320px without scrolling and no label is
shortened", and the readout clamped "so it cannot wrap at 320px". NFR-6's
colour-never-alone half ↔ the Lamp-Plus-Word Rule and the Annunciator Rule.
FR-39 ↔ the caution-amber "Real funds" stamp (measured fill + `-foreground` +
the word). FR-44 ↔ focus left alone, no hover-only affordance in the
vocabulary. FR-53/FR-55/FR-56 ↔ the docked Annunciator in the panel's own plane
on the ordinary plate bevel ("there is nothing left in this app that floats
above the chassis"), quiet when empty, most-severe-plus-count when several.
NFR-1 ↔ the Tabular-By-Construction Rule ("Money arrives as a pre-formatted
string; no numeral in this app is proportional"). §9.2 ↔ fonts self-hosted from
`src/fonts/`, never a CDN, because "no screen that touches key material may
depend on a third party". FR-25's `aria-disabled` direction ↔ the Range
Selector's "an unselected position is available, not disabled".

---

## Finding 1 — FR-34 says "badged"; the system reserves badges for fixed labels

**Severity: high** (the only outright contradiction found).

**DESIGN.md says.** § Chips: "The build ships one meaningful use — the
caution-amber 'Real funds' stamp when the network is Mainnet. **Use
`StatusLegend`, not a badge, for live state.**" The Lamp-Plus-Word Rule states
the division explicitly: "A stamped badge is for a fixed label; a lamp is for
'this thing is currently in state X.'"

**The PRD says.** FR-34: "A Trust Line frozen by its issuer is **badged** as
such wherever it appears."

A freeze is a live issuer-controlled state, not a fixed label, so the PRD's verb
names the one device DESIGN.md forbids for it. The build already follows
DESIGN.md, not the PRD: `src/components/wallet/TrustLineRow.tsx:35,38` and
`src/pages/tabs/BalancesTab.tsx:186` render `StatusLegend tone="alert"` /
`tone="caution"` with the words "Frozen by issuer" / "Frozen by you". A
downstream reader implementing FR-34 literally would add a `Badge`, violating a
binding named rule and diverging from shipped behaviour.

**Suggested disposition.** Reword FR-34 to the device-neutral or correct form —
e.g. "A Trust Line frozen by its issuer is reported wherever it appears with a
lamp-plus-word status legend (`DESIGN.md` § Status Legend)" — and note that
"frozen by you" and "frozen by issuer" are distinct states in the build. No new
visual requirement is added; the PRD stops naming the wrong one.

## Finding 2 — NFR-6 overstates the contrast gate's scope, and hides its one deliberate exception

**Severity: medium.**

**The PRD says.** NFR-6: "`bun run check:contrast` is the gate — **it evaluates
every pair the app renders in both themes, alpha composites included**, and
exits non-zero on failure."

**DESIGN.md says.** The Measured-Not-Judged Rule: the script "parses tokens
straight out of `src/index.css` and measures 25 pairs per finish, 50 total.
Adding a colour token without adding its pairs is incomplete work." And §Colors
→ Neutral, Scribe Rule: the global border colour is "decorative structure only,
held to a documented **1.5:1** visibility floor rather than to WCAG 1.4.11",
while Control Edge "*is* WCAG 1.4.11 and is measured at 3:1".

Verified against `scripts/check-contrast.mjs`: the gate is a curated
`pairsFor()` list — 26 pairs per finish on this revision, plus four
browser-surface literal checks — not an enumeration of everything rendered. Two
of those pairs (`scribe rule vs page`, `scribe rule vs card`) are intentionally
asserted at `VISIBLE = 1.5`, with an in-file comment explaining why 1.4.11 does
not apply. And at least one alpha composite the app really does render is absent
from the list: `aria-disabled:pointer-events-none aria-disabled:opacity-55`
(`src/components/ui/button.tsx:32`) — the treatment PRD §9.1 and FR-25 depend
on — has no measured pair. (Whether that composite passes 4.5:1 was not
computed here; the finding is that the gate does not check it, not that it
fails.)

The risk is directional: NFR-6 as written tells a reader the gate is exhaustive
and that every pair clears WCAG, which invites two wrong moves — trusting the
gate as complete coverage, and "fixing" `--border` up to 3:1 against a
documented deliberate floor.

**Suggested disposition.** Soften NFR-6 to the truth and point rather than
restate: "…`bun run check:contrast` is the gate — it measures the pair set the
script documents, in both finishes, alpha composites included, and exits
non-zero on failure. Two decorative pairs are held at a documented visibility
floor rather than WCAG 1.4.11; see `DESIGN.md` § Named Rules
(Measured-Not-Judged) and § Colors → Neutral." No count in the PRD.

## Finding 3 — `addendum.md` §7 states a false fact about `.panel-scribe`

**Severity: medium** (factual error in a drift report, in the file whose whole
job is to be accurate about drift).

**Addendum §7 says.** "The unused `Switch` primitive and the defined-but-unused
`.panel-scribe` are both still present with deletion pending."

**DESIGN.md says.** § Known Gaps: "**`.panel-scribe` — RESOLVED and removed
2026-09-02.** The device had zero call sites… Deleted from `src/index.css`'s
component layer in the same change that touched that file for S16." § Shapes
repeats it: "the `.panel-scribe` two-tone groove device was removed 2026-09-02".

Verified: `.panel-scribe` does not appear in `src/index.css`. The remaining
repo hits are historical prose only (`docs/decisions.md:456`,
`docs/agents/ui-and-design-system.md:24` which itself says "was removed",
`docs/agents/anti-patterns.md:112`, `.impeccable/`). The `Switch` half of the
bullet *is* correct: `src/components/ui/switch.tsx` exists and the only `Switch`
reference in `src/` is its own Radix import — no call site.

This also answers the "does DESIGN.md mention them" question directly:
DESIGN.md mentions `.panel-scribe` **only as removed and resolved**, and never
mentions the `Switch` primitive at all (there is no switch/toggle in the
component vocabulary — the Range Selector is a radiogroup, and § Don'ts bans a
theme toggle).

**Suggested disposition.** Split the addendum §7 bullet: keep the unused
`Switch` primitive as pending deletion; strike `.panel-scribe` and note it was
removed 2026-09-02 per `DESIGN.md` § Known Gaps. Optionally record DESIGN.md's
standing note that if the chassis-density gap is ever funded, the scribed groove
is the device to reintroduce deliberately — that is a designed next move, not
lingering dead code.

## Finding 4 — the `aria-disabled` treatment is a PRD requirement with no entry in DESIGN.md

**Severity: medium. This is a DESIGN.md gap, not a PRD defect — no PRD change is
proposed.**

**The PRD says.** §9.1: "A control that is temporarily unavailable is
`aria-disabled` with its reason in visible text — never hidden." FR-25 repeats
it for a frozen Trust Line: "the control is `aria-disabled` with the reason in
visible text."

**DESIGN.md says.** § Inputs / Fields → Error / Disabled documents only true
disablement: "disabled drops to 55% opacity with `not-allowed`." Buttons get no
disabled or unavailable entry at all, and the named rules are silent on the
distinction. The treatment exists in the build —
`aria-disabled:pointer-events-none aria-disabled:opacity-55
aria-disabled:shadow-none` (`src/components/ui/button.tsx:32`), exercised by
`src/components/wallet/__tests__/trust-line-row.test.tsx:55-56` with the comment
"Reachable by keyboard: `aria-disabled`, never the `disabled` attribute."

Because DESIGN.md is authoritative for the visual system, a designer or
implementer working from it alone reaches for `disabled` and silently breaks the
product's most load-bearing interaction rule (unavailable but focusable, reason
visible).

**Suggested disposition.** Add the pair to DESIGN.md — an `aria-disabled`
control keeps its cap and its place in the tab order at 55% with the shadow
removed and its reason in adjacent visible text; the HTML `disabled` attribute
is for fields that genuinely accept nothing. Consider adding the composited
`aria-disabled` label pair to `check-contrast.mjs` (which is what the
Measured-Not-Judged Rule would demand of any other composite).

## Finding 5 — pointer-adequate risks, recorded not filed

**Severity: low.** Neither is a gap; both are noted so a later reader does not
re-derive them.

- **FR-29 and the readout.** FR-29 requires balance and Spendable Balance as
  "distinct figures". DESIGN.md's Readout Well says those subordinate readings
  are **scale marks** under one hairline rule inside the same well, "*of the
  same quantity*", and bans the refactor that would otherwise look like
  compliance: "This is not the hero-metric template… and must not be refactored
  into it"; "Don't break the readout into separate stat cards, or give a screen
  a second panel-scale number." The two are compatible — distinct figures, one
  well — and §0's pointer carries the ban. No change; if FR-29 is ever
  reworded, "distinct" must not become "separate".
- **Appearance is not user-configurable.** DESIGN.md: "The finish switches on
  `prefers-color-scheme` only; there is no `.dark` class and no theme toggle
  anywhere in the build", and § Don'ts bans adding one. `prd.md` contains zero
  occurrences of theme / dark mode / appearance / colour scheme, so nothing
  contradicts it. Filing it as a PRD non-goal would be restating the record.
  Worth one line in §5 only if a future settings FR starts enumerating
  user-configurable appearance options.

## Informational — DESIGN.md internal staleness

**Severity: low, DESIGN.md-internal, outside the PRD's task.** The
Measured-Not-Judged Rule's tally and scope are stale against its own script:
`pairsFor()` now returns 26 pairs per finish (not 25), and the rule does not
mention the four browser-surface literal checks the mobile-chrome sprint added
(`index.html` light/dark `theme-color` vars, `vite.config.ts` manifest
`theme_color` and `background_color`, each required to equal the `--background`
it stands for). The PRD is right not to carry a count; DESIGN.md should either
drop its own or keep it current.
