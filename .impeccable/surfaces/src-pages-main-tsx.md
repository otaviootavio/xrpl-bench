---
version: 1
slug: "src-pages-main-tsx"
primary_target: "src/pages/Main.tsx"
related_targets: []
---

# Surface: wallet main app (`src/pages/Main.tsx`)

Mode: **Operate**. Dominant job: Check — read the position in two seconds.

## Direction contract

**THESIS:** The wallet is a measurement instrument for one account. It refuses the centered card stack that rearranges itself whenever state changes.

**OWN-WORLD:** Two real panel finishes — pale lab enamel (light), dark rack steel (dark) — never one palette inverted. Neutrals carry hue; chroma-zero is banned. Engraved legend plates, tabular numerals at full contrast, indicator lamps for state, one reserved commit orange used only where funds move.

**STORY:** Reads the position at a glance, trusts it because every figure links to the ledger that produced it, and spends only past a lamp-lit consequence.

**FIRST VIEWPORT:** Upper register is one readout: XRP balance at panel scale, tabular, with spendable and reserved as scale marks under the same rule — not separate cards. An engraved plate holds the grouped address. Network is a range selector. Six functions read as a flat selector row. Reading order is fixed at every width.

**FORM:** Bench instrument panel; candidate 4 of 7; seed 62c39974.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Finish record — 2026-09-01

Code-led build (no image generation available in the harness, so no comp round
and no critique-reference comp). Finish review run by `impeccable-finish-reviewer`
on a real funded testnet account with two wallets present, captured at 1440,
390 and 320 in both panel finishes.

**Round 1 — disposition `fix`,** 8 material findings. All 8 applied in one batch.
Two conflicted with existing project rules and were resolved rather than obeyed
blindly: the tab-strip finding contradicted `docs/decisions.md` §6.8, so the
change is recorded as §7.2 with its reasoning; and the popover finding's
uppercase treatment was reverted for user-entered wallet labels, since
transforming someone's own string misrepresents it.

**Round 2 — verdict `fix`,** 7 of 8 scored resolved. Three regressions
introduced by the fix batch were found and corrected in the same session:
the Account plate stretching to a taller sibling, the unselected range-selector
position reading as disabled, and — the one that mattered — warning advisories
losing salience when the field wash was removed. That last was an
over-correction: protecting the `--commit` reservation had flattened "this
payment will fail to activate" to the weight of body copy on a wallet whose
owner ranks correctness about money above everything. Resolved by making alerts
**annunciators** (a small lit legend plate) rather than washed fields, which
keeps both the salience and the reservation.

**Open, and deliberately shipped as-is** (owner's call, ceiling handed over per
the finish contract after the second verdict):

> **The readout dominates but does not yet own the frame.** At 1440x900 the
> chassis face below the plate row is roughly 375px of empty ground, and the
> readout is a band in the upper third. The panel vocabulary defines four
> devices (`.panel-plate`, `.panel-well`, `.panel-scribe`, `.panel-lamp`) and
> the built pages lean on two. The named next moves: render spendable and
> reserved as positions on a graduated rule rather than two numbers under a
> hairline, so the reserve reads as a proportion of the balance the way an
> instrument would show it; add a third and fourth depth level; let the readout
> claim more vertical space at desktop. This is unfinished ambition, not a
> defect — nothing measurable is failing.

Verified at handover: `check:contrast` 50/50 pairs both finishes, `tsc -b`
clean, `test` 29/29, `detect.mjs --json` empty, `build` succeeds. No shipping
rasters were produced by this run (the only new binary assets are four
self-hosted `woff2` faces, whose origin is recorded in `src/index.css`).
