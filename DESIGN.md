---
name: XRPL Wallet
description: A bench instrument panel for one XRP Ledger account — two real panel finishes, engraved legends, one reserved commit colour.
colors:
  # ---- Pale lab enamel (light finish, hue 250) ----
  enamel-chassis: "oklch(0.918 0.01 250)"
  enamel-ink: "oklch(0.215 0.016 250)"
  enamel-plate: "oklch(0.972 0.005 250)"
  enamel-key: "oklch(0.255 0.018 250)"
  enamel-key-legend: "oklch(0.97 0.004 250)"
  enamel-recess: "oklch(0.878 0.012 250)"
  enamel-ink-muted: "oklch(0.47 0.016 250)"
  enamel-scribe: "oklch(0.7 0.016 250)"
  enamel-control-edge: "oklch(0.598 0.02 250)"
  enamel-readout: "oklch(0.205 0.014 250)"
  enamel-readout-ink: "oklch(0.975 0.004 250)"
  enamel-readout-muted: "oklch(0.74 0.014 250)"
  commit-enamel: "oklch(0.545 0.155 42)"
  commit-enamel-legend: "oklch(0.99 0.004 60)"
  lamp-alert-enamel: "oklch(0.545 0.205 27)"
  lamp-caution-enamel: "oklch(0.78 0.155 72)"
  lamp-live-enamel: "oklch(0.52 0.135 150)"
  lamp-alert-enamel-legend: "oklch(0.985 0.003 27)"
  lamp-caution-enamel-legend: "oklch(0.2 0.02 72)"
  lamp-live-enamel-legend: "oklch(0.985 0.003 150)"
  text-alert-enamel: "oklch(0.495 0.2 27)"
  text-caution-enamel: "oklch(0.455 0.09 72)"
  text-live-enamel: "oklch(0.45 0.12 150)"
  # ---- Dark rack steel (dark finish, hue 125) ----
  steel-chassis: "oklch(0.214 0.009 125)"
  steel-ink: "oklch(0.945 0.005 125)"
  steel-plate: "oklch(0.268 0.010 125)"
  steel-key: "oklch(0.36 0.016 125)"
  steel-key-legend: "oklch(0.965 0.004 125)"
  steel-recess: "oklch(0.322 0.014 125)"
  steel-ink-muted: "oklch(0.735 0.014 125)"
  steel-scribe: "oklch(0.47 0.018 125)"
  steel-control-edge: "oklch(0.56 0.022 125)"
  steel-readout: "oklch(0.108 0.008 125)"
  steel-readout-ink: "oklch(0.975 0.004 125)"
  steel-readout-muted: "oklch(0.735 0.014 125)"
  commit-steel: "oklch(0.66 0.17 42)"
  commit-steel-legend: "oklch(0.18 0.02 42)"
  lamp-alert-steel: "oklch(0.69 0.185 25)"
  lamp-caution-steel: "oklch(0.79 0.155 72)"
  lamp-live-steel: "oklch(0.7 0.14 150)"
  lamp-alert-steel-legend: "oklch(0.165 0.01 25)"
  lamp-caution-steel-legend: "oklch(0.19 0.02 72)"
  lamp-live-steel-legend: "oklch(0.165 0.01 150)"
  text-alert-steel: "oklch(0.72 0.17 25)"
  text-caution-steel: "oklch(0.8 0.13 72)"
  text-live-steel: "oklch(0.76 0.13 150)"
typography:
  readout:
    fontFamily: "Azeret Mono, ui-monospace, Cascadia Mono, monospace"
    fontSize: "clamp(2.25rem, 11vw, 5rem)"
    fontWeight: 500
    lineHeight: 1.02
    letterSpacing: "-0.035em"
    fontFeature: "'tnum' 1, 'zero' 1"
  mark:
    fontFamily: "Azeret Mono, ui-monospace, Cascadia Mono, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.375
    letterSpacing: "-0.025em"
    fontFeature: "'tnum' 1, 'zero' 1"
  data:
    fontFamily: "Azeret Mono, ui-monospace, Cascadia Mono, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.025em"
    fontFeature: "'tnum' 1, 'zero' 1"
  legend:
    fontFamily: "Barlow Semi Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.14em"
  nameplate:
    fontFamily: "Barlow Semi Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.22em"
  key:
    fontFamily: "Barlow Semi Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.09em"
  body:
    fontFamily: "Barlow Semi Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.375
    letterSpacing: "normal"
  caption:
    fontFamily: "Barlow Semi Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.375
    letterSpacing: "normal"
rounded:
  sm: "calc(0.125rem - 1px)"
  md: "0.125rem"
  lg: "calc(0.125rem + 1px)"
  xl: "calc(0.125rem + 3px)"
  lamp: "9999px"
spacing:
  hairline: "0.125rem"
  tight: "0.375rem"
  snug: "0.5rem"
  plate: "0.75rem"
  region: "1rem"
  pre-auth: "1.5rem"
components:
  button-default:
    backgroundColor: "{colors.enamel-key}"
    textColor: "{colors.enamel-key-legend}"
    typography: "{typography.key}"
    rounded: "{rounded.md}"
    padding: "0 1rem"
    height: "2.25rem"
  button-commit:
    backgroundColor: "{colors.commit-enamel}"
    textColor: "{colors.commit-enamel-legend}"
    typography: "{typography.key}"
    rounded: "{rounded.md}"
    padding: "0 1rem"
    height: "2.25rem"
  button-destructive:
    backgroundColor: "{colors.lamp-alert-enamel}"
    textColor: "{colors.lamp-alert-enamel-legend}"
    typography: "{typography.key}"
    rounded: "{rounded.md}"
    padding: "0 1rem"
    height: "2.25rem"
  button-danger:
    backgroundColor: "{colors.enamel-plate}"
    textColor: "{colors.text-alert-enamel}"
    typography: "{typography.key}"
    rounded: "{rounded.md}"
    padding: "0 1rem"
    height: "2.25rem"
  button-outline:
    backgroundColor: "{colors.enamel-plate}"
    textColor: "{colors.enamel-ink}"
    typography: "{typography.key}"
    rounded: "{rounded.md}"
    padding: "0 1rem"
    height: "2.25rem"
  button-sm:
    typography: "{typography.legend}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "2rem"
  input-field:
    backgroundColor: "{colors.enamel-chassis}"
    textColor: "{colors.enamel-ink}"
    typography: "{typography.data}"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.625rem"
    height: "2.25rem"
  card-plate:
    backgroundColor: "{colors.enamel-plate}"
    textColor: "{colors.enamel-ink}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem 1rem"
  card-title-placard:
    textColor: "{colors.enamel-ink-muted}"
    typography: "{typography.legend}"
  readout-well:
    backgroundColor: "{colors.enamel-readout}"
    textColor: "{colors.enamel-readout-ink}"
    typography: "{typography.readout}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem 1rem"
  tabs-trigger:
    textColor: "{colors.enamel-ink-muted}"
    typography: "{typography.legend}"
    padding: "0.375rem 0.75rem 0.5rem"
  tabs-trigger-active:
    textColor: "{colors.enamel-ink}"
    typography: "{typography.legend}"
  badge-stamp:
    backgroundColor: "{colors.enamel-key}"
    textColor: "{colors.enamel-key-legend}"
    typography: "{typography.legend}"
    rounded: "{rounded.sm}"
    padding: "1px 0.375rem"
  alert-annunciator:
    backgroundColor: "{colors.enamel-plate}"
    textColor: "{colors.enamel-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem 0.625rem"
  alert-annunciator-title:
    backgroundColor: "{colors.lamp-caution-enamel}"
    textColor: "{colors.lamp-caution-enamel-legend}"
    typography: "{typography.legend}"
    rounded: "{rounded.sm}"
    padding: "0.125rem 0.375rem"
  lamp:
    backgroundColor: "{colors.lamp-live-enamel}"
    rounded: "{rounded.lamp}"
    size: "0.5rem"
  status-legend:
    textColor: "{colors.lamp-live-enamel}"
    typography: "{typography.legend}"
    gap: "0.375rem"
---

# Design System: XRPL Wallet

## Overview

**Creative North Star: "The Bench Panel"**

The wallet is a measurement instrument for one account, and its surfaces are the parts of an instrument: a chassis (the page), engraved legend plates screwed onto it (cards), an inset readout well cut into the face (the balance), and indicator lamps that report live state. It refuses the centered card stack that rearranges itself whenever state changes — reading order is fixed at every width, and the six functions read as a flat selector row rather than a navigation that grows and shrinks.

Light and dark are two real panel finishes, not one palette inverted: pale lab enamel at hue 250 and dark rack steel at hue 125, two different materials with different hues, different plate logic, and independently measured contrast. Neutrals carry chroma because no real panel is chroma-zero. The finish switches on `prefers-color-scheme` only; there is no `.dark` class and no theme toggle anywhere in the build. The one element that does not flip is the readout well: it is dark in both finishes, because a bench instrument's display is dark in a lit room, and that is what keeps the light finish an equal citizen instead of a washed-out inversion.

Density is panel-dense, not marketing-page generous: plate padding is 0.75–1rem, the legend face is condensed, and one saturated colour — the commit orange at hue 42 — is held in reserve for the single class of control that moves funds. Depth is built from real structure: bevels, drop shadows, and genuine inset shadow stacks. There is deliberately no faux-metal gradient, no brushed texture, and no drawn "engraving" — the panel's own risk was engraving that is drawn rather than earned, so every recess and every raised edge is carried by light logic instead of decoration.

**Key Characteristics:**
- Two independent finishes (enamel hue 250 / steel hue 125), never an inversion of one palette.
- A single dark readout well in both finishes, carrying the primary reading at panel scale.
- Machined 0.125rem radius everywhere except the indicator lamp disc.
- One reserved commit colour, on one control class, at one call site.
- Barlow Semi Condensed for cut legends; Azeret Mono, tabular, for every numeral, address, and hash.
- Live state is a lamp plus its word — never a stamped fill, never colour alone.
- Contrast is measured by script (50 pairs, both finishes), not judged by eye.

## Colors

Low-chroma industrial neutrals with hue, punctuated by four saturated signal hues that are rationed rather than distributed.

### Primary

- **Commit Orange** (hue 42, `{colors.commit-enamel}` / `{colors.commit-steel}`): the reserved colour. It appears on exactly one control class — the key that moves funds — and in the shipped build on exactly one call site, the send button in `SendTab`. It is not a decorative "primary": the ordinary key is the dark panel cap. Its scarcity is the signal; if commit orange is on screen, money is leaving.
- **Panel Key** (`{colors.enamel-key}` / `{colors.steel-key}`): the ordinary momentary pushbutton — a dark cap with a light legend in the enamel finish, a raised dark cap in the steel finish. Deliberately not shadcn's light-slab inversion in dark mode: the key logic is identical in both finishes so nothing competes with commit for salience.

### Secondary

- **Readout Graphite** (`{colors.enamel-readout}` / `{colors.steel-readout}`): the display window. Dark in both finishes; in steel it is cut deeper than the panel around it. Its foreground and a muted variant for engraved legends inside the well are the only text colours used on it.

### Tertiary

Four signal hues, each with a *fill* token (for lit lamps and stamped plates, always paired with its own `-foreground`) and a *text* token (the same hue dropped in lightness until it clears 4.5:1 on the plate and on the tinted alert surface). A fill token is never used as a text colour.

- **Alert Red** (hue 27 / 25): fill for the confirm key inside a destructive dialog and for the alert annunciator legend; text form for controls that merely open one.
- **Caution Amber** (hue 72): fill for the caution annunciator legend and the Mainnet "Real funds" stamp; text form for caution prose and for hovered links. Also the selection highlight, mixed at 38%.
- **Live Green** (hue 150): fill for a success annunciator legend; text form for the live lamp on the readout.
- All four are clear of the steel finish's own hue (125) at panel chroma, so a lit lamp never reads as a lighter patch of chassis.

### Neutral

- **Lab Enamel / Rack Steel Chassis** (`{colors.enamel-chassis}` / `{colors.steel-chassis}`): the page ground, and the ground behind recessed fields.
- **Legend Plate** (`{colors.enamel-plate}` / `{colors.steel-plate}`): every card, dialog, select menu, notice, and history row. Lighter than the chassis it is screwed to, in both finishes.
- **Scribe Rule** (`{colors.enamel-scribe}` / `{colors.steel-scribe}`): the machined line between panel regions — the global border colour. Decorative structure only, held to a documented 1.5:1 visibility floor rather than to WCAG 1.4.11.
- **Control Edge** (`{colors.enamel-control-edge}` / `{colors.steel-control-edge}`): the boundary that identifies a field as a field. This one *is* WCAG 1.4.11 and is measured at 3:1 against both the plate and the chassis. It is also the scrollbar thumb.
- **Muted Ink** (`{colors.enamel-ink-muted}` / `{colors.steel-ink-muted}`): engraved placard legends, descriptions, unselected selector legends.

### Named Rules

**The Reservation Rule, three levels.** Commit orange belongs to the control class that moves funds and to nothing else. Saturated destructive fill belongs to the confirm key *inside* a dialog. A control that merely opens that dialog uses the `danger` treatment — plate ground with alert-red text and an alert-red edge — never a fill.

**The Annunciator Rule.** Alerts never wash their field. A notice sits on plate ground and lights a legend-sized plate as its title, so commit orange remains the only saturated *field* on the panel while a caution still reads louder than prose. The lit legend plate is the permitted exception, and it uses measured fill/`-foreground` pairs.

**The Lamp-Plus-Word Rule.** Live state is an indicator lamp beside its own visible label. Never a stamped fill, never colour alone. A stamped badge is for a fixed label; a lamp is for "this thing is currently in state X."

**The Measured-Not-Judged Rule.** `scripts/check-contrast.mjs` parses tokens straight out of `src/index.css` and measures 25 pairs per finish, 50 total. Adding a colour token without adding its pairs is incomplete work. Do not hand-tune a value here without re-running it.

**The No-Chroma-Zero Rule.** Every neutral carries hue. `oklch(… 0 0)` is banned as a token value in both finishes — it is the one thing no real panel is.

## Typography

**Display Font:** Azeret Mono (variable, 100–900; fallback `ui-monospace`, `Cascadia Mono`, `monospace`) — the *data* face, and on this panel the data is the display.
**Body Font:** Barlow Semi Condensed (400/500/600; fallback `ui-sans-serif`, `system-ui`, `sans-serif`).
**Label Font:** Barlow Semi Condensed, uppercase and tracked — the engraved legend.

Both faces are self-hosted from `src/fonts/` with `font-display: block`, never fetched from a CDN: no screen that touches key material may depend on a third party, and a `swap` flash across a balance readout is unacceptable.

**Character:** An industrial grotesque in the DIN lineage — the lineage panel legends are actually cut in — set against a squarish measurement monospace. The condensed sans does the cutting and labelling; the mono does the counting. Monospace here is for measurement and comparison, which is exactly what an address cross-check needs.

### Hierarchy

- **Readout** (Azeret Mono 500, `clamp(2.25rem, 11vw, 5rem)`, line-height 1.02, tracking −0.035em): the primary reading in the well. Clamped rather than stepped so it cannot wrap at 320px and still reads from across a desk. Exactly one per screen.
- **Scale Mark** (Azeret Mono 400, 1rem rising to 1.125rem at `sm`, tracking tight): the subordinate readings hanging under the readout's rule — spendable, reserved.
- **Data** (Azeret Mono 400, 0.8125rem, tracking tight): every field value, address, hash, amount, fee, and currency code. Inputs default to this face.
- **Key Legend** (Barlow Semi Condensed 600, 0.8125rem, uppercase, tracking 0.09em): button caps. 0.6875rem at `sm` size, 0.875rem at `lg`.
- **Placard Legend** (Barlow Semi Condensed 600, 0.6875rem, line-height 1.1, tracking 0.14em, uppercase): the system's workhorse label — card titles, field labels, definition terms, readout legends, tab triggers.
- **Nameplate** (Barlow Semi Condensed 600, 0.75rem, tracking 0.22em, uppercase): the maker's mark in the header and on the pre-auth screens. On a panel the maker's mark is the smallest thing on it.
- **Body** (Barlow Semi Condensed 400, 0.875rem, line-height ~1.375): explanatory prose inside plates.
- **Caption** (Barlow Semi Condensed 400, 0.75rem): card descriptions and inline meta.

### Named Rules

**The Barbell Rule.** The ramp has two ends and a deliberate hole in the middle: one enormous readout and everything else clustered between 0.6875rem and 0.875rem. There is no mid-scale heading tier, because there are no display headings on this panel.

**The Legend/Value Inversion Rule.** The label is small and cut; the VALUE carries the scale. `CardTitle` renders as an engraved placard, not as a heading face. This is the direction, not a defect — do not "fix" it by growing card titles.

**The Tabular-By-Construction Rule.** Tabular figures and slashed zero are set on the data face itself (`.font-data`), not per call site, so a live-updating balance can never shift its own digits under the reader's eye. Money arrives as a pre-formatted string; no numeral in this app is proportional.

**The Screen-Names-Itself Rule.** The document's `<h1>` names the active panel and is visually hidden, because the selected function already states the screen on screen. The header nameplate is a constant and is therefore never the heading.

## Layout

Two container models, both full-viewport-height.

The **chassis** (`src/pages/Main.tsx`) is a centered column capped at 64rem (`max-w-5xl`) running `min-h-dvh`, with machined vertical edges from `md` up (`border-x` in the scribe colour) so the face reads as a mounted instrument rather than a page. It stacks a header rule, the six-function selector, and the active panel; content padding is 1rem horizontal, 0.75rem top, 1.5rem bottom. Blank lower area is panel face, not missing content.

The **pre-auth column** (Onboarding, Unlock) is capped at 28rem (`max-w-md`), vertically centered, with 1.5rem padding and a 1.5rem stack gap — the one place the system is generous, because there is one decision per screen.

**Spacing rhythm** is a short ladder actually used by the build: 0.125rem hairlines, 0.375/0.5rem for intra-control gaps, 0.75rem for plate padding and plate-to-plate gaps, 1rem for region padding and section gaps, 1.5rem only in the pre-auth column. Plates use `0.75rem 1rem 1rem`; the readout well uses the same `0.75rem 1rem 1rem` and steps up to `1.25rem 1.5rem 1.75rem` from `sm`.

**Responsive behaviour lives in the primitives, never at the call site.** Two breakpoints are in play: `sm` (640px) and `md` (768px). The function selector is two rows of three below `sm` and six equal columns from `sm` up, with no fixed height so it can never clip its triggers — every function is reachable at 320px without scrolling and no label is shortened. The header's controls take their own full-width row below `sm` rather than compressing. Content grids are single-column below `sm` and two-column above (`sm:grid-cols-2`). Reading order is identical at every width.

## Elevation & Depth

Structural, not ambient. This system has no elevation ladder and no "cards float" convention; instead each device states its physical plane with light. A plate is raised (a light top edge plus a tight drop). A well or a field is cut in (an offset, blurred inset with a lit lower lip). A key has real travel (a bright inner top edge at rest that becomes an inner shadow when pressed, plus a 1px downward translate). Only the dialog uses a large soft shadow, because it is the one element genuinely off the panel's face.

### Shadow Vocabulary

- **Plate bevel** (`box-shadow: 0 1px 0 0 color-mix(in oklab, var(--foreground) 6%, transparent), 0 1px 3px -1px color-mix(in oklab, var(--foreground) 12%, transparent)`): every legend plate — cards, history rows, select menus, dialogs, and (since S16) the docked annunciator's notice rows.
- **Well recess** (`inset 0 2px 5px -1px rgb(0 0 0 / 0.55), inset 0 0 0 1px rgb(0 0 0 / 0.25), inset 0 -1px 0 0 rgb(255 255 255 / 0.07), 0 1px 0 0 color-mix(in oklab, var(--card) 55%, transparent)`): the readout well, the seed reveal, tooltips, the fee summary. Four layers: the cut, its wall, the lit lower lip, and the panel edge catching light just outside it.
- **Field recess** (`inset 0 1px 2px 0 rgb(0 0 0 / 0.14)`): inputs, select triggers, the network range selector (0.16), alert bodies (0.10).
- **Key at rest** (`inset 0 1px 0 0 rgb(255 255 255 / 0.14–0.24), 0 1px 2px 0 rgb(0 0 0 / 0.28–0.30)`): filled keys. Plate-ground keys use a stronger inner highlight (0.4–0.5) and a lighter drop.
- **Key pressed** (`inset 0 1px 2px 0 rgb(0 0 0 / 0.4)`, drop removed, `translate-y: 1px`): the cap sinking onto the panel.
- **Lamp glow** (`0 0 0 1px color-mix(in oklab, var(--foreground) 22%, transparent), 0 0 6px 0 currentColor`): a bezel ring plus a bounded glow in the lamp's own colour.
- **Swung-out module** (`0 8px 28px -8px rgb(0 0 0 / 0.45)`): dialog content only.

### Named Rules

**The Earned-Recess Rule.** A recess is an inset shadow with offset and blur, never a flat colour swap. If a surface reads as "cut in," it must carry the shadow stack that makes it so.

**The Diffuse-Light Rule.** All shadows are soft and small-offset, lit from directly above. No hard offset shadows: this is a machined panel, not a neobrutalist poster.

**The Real-Structure Rule.** Depth comes from bevels, recesses, and travel. No faux-metal gradients, no brushed textures, no drawn engraving effects.

## Shapes

Radius is machined, not pilled: 0.125rem (`--radius`) with a four-step scale that moves by single pixels (sm −1px, md, lg +1px, xl +3px). A panel's corners are chamfers. Every plate, key, field, dialog, menu, well, and stamped badge takes 0.125rem or its ±1px neighbours; nothing in the system is more rounded than that.

The one intentional full-round element is the **indicator lamp** — a 0.5rem disc at `9999px`, plus the smaller dot inside an annunciator legend. A lamp is round because lamps are round; it is a light, not a control.

Borders are the second half of the form language. Every element that is a plate, a key, or a field carries a 1px edge: plates and stamped badges on the scribe colour, fields and menus on the control-edge colour, filled keys on their own fill colour. The chassis itself is edged from `md` up. Region separation is a plain 1px `border-b` / `border-x` in the scribe colour — the `.panel-scribe` two-tone groove device was removed 2026-09-02 (see Known Gaps) for having zero call sites.

## Components

### Buttons

The panel's keys. Every variant is a physical cap: a light top edge, a shadow under it, an engraved uppercase legend, and 75ms of real travel on press.

- **Shape:** machined corners (0.125rem), always with a 1px edge.
- **Default (`default`):** the ordinary key — dark panel cap with a light legend, hover to 90% fill. Heights 2rem (`sm`) / 2.25rem (default, 1rem side padding) / 2.75rem (`lg`) / 2.25rem square (`icon`).
- **Commit (`commit`):** commit orange fill with its measured legend colour. The only variant permitted to touch that token. One call site in the shipped build.
- **Destructive (`destructive`):** saturated alert-red fill, reserved for the confirm key inside a dialog.
- **Danger (`danger`):** plate ground, alert-red text, alert-red edge at 55%, hover tints the plate 10%. For controls that lead to a destructive dialog without being one.
- **Outline / Secondary:** plate or recess ground with a strong inner highlight; the neutral choices on a plate.
- **Ghost / Link:** no cap at all — a bare legend cut into the panel. `link` drops the uppercase and tracking and hovers to caution amber.
- **Focus:** nothing. The browser's own two-tone ring is the indicator, in every variant.

### Chips

Stamped tags (`Badge`): square-cut 1px-edged plates, placard legend, 1px/0.375rem padding. Semantic variants use fill/`-foreground` pairs. The build ships one meaningful use — the caution-amber "Real funds" stamp when the network is Mainnet. Use `StatusLegend`, not a badge, for live state.

### Status Legend (live state)

`StatusLegend` (`ui/lamp`) is the device behind the "lamp plus an adjacent
visible word" rule: a lit 0.5rem disc, `gap-1.5`, then the word in the legend
face at 0.6875rem/600, tracked 0.1em, in the tone's `--text-*` token. The word
is always present and always specific, so the state never rests on the lamp's
colour; the lamp only makes it findable at a glance down a list of rows.

Tone drives both the disc and the word from one map, and `className` overrides
the word alone — the lamp carries its own colour through `currentColor`. That
divergence has exactly one call site and one reason: on the readout well's dark
ground the `--text-*` tokens would not hold contrast, so the word takes
`--readout-muted` while the lamp stays lit green.

Reach for a bare `Lamp` only where the word is already on screen for another
reason, such as a select item marking the chosen position.

### Cards / Containers

Engraved legend plates.

- **Corner Style:** machined (0.125rem).
- **Background:** plate colour, always lighter than the chassis behind it.
- **Shadow Strategy:** the plate bevel from Elevation.
- **Border:** 1px scribe rule.
- **Internal Padding:** header `0.75rem 1rem 0.5rem`, content `0 1rem 1rem` — panel-dense, so a whole position fits in one screen.
- **Title:** an engraved placard, rendered as a real heading element (`h2` by default, `as` to fit the outline). Small and cut; the value it labels carries the scale.

### Inputs / Fields

- **Style:** genuinely cut into the plate — chassis-coloured ground, 1px control-edge boundary at a measured 3:1, field-recess inset shadow, machined corners, 2.25rem tall.
- **Face:** the data face by default, since nearly every field here receives an address, amount, currency code, or seed. Placeholders switch to the legend face at normal tracking.
- **Focus:** untouched. The UA ring is the indicator; `outline-none` is banned repo-wide.
- **Error / Disabled:** `aria-invalid` swaps the edge to the destructive fill colour; disabled drops to 55% opacity with `not-allowed`.
- **Select trigger:** the same recessed field in the legend face, with a small muted chevron; its menu is a plate on the control edge.

### Navigation

The function selector: a flat row of legends cut into the chassis, sitting on the strip's own bottom scribe rule, with the selected function marked by a 2px lit detent rule beneath it. Placard legend at 0.6875rem/0.11em tracking, muted at rest, foreground ink on hover and when active. The detent is deliberately the foreground ink and **not** commit orange — a navigation detent does not move funds.

Two variants, both owned by the primitive: `nav` (the six functions — `grid-cols-3` below `sm`, `grid-cols-6` from `sm` up, no fixed height) and `inline` (a compact filter row, e.g. History's sent/received).

### The Readout Well (signature)

One inset display window carrying the primary reading at panel scale, dark in both finishes. Structure, top to bottom: an engraved legend in the well's muted ink with an optional lamp-plus-word at the opposite corner; the reading itself in clamped tabular mono with an optional unit set as a tracked legend on the baseline; then the derived readings as **scale marks** hanging beneath a single hairline rule inside the same well.

Those marks are subordinate readings *of the same quantity*, which is exactly why they sit under one rule in one well instead of becoming their own tiles. This is not the hero-metric template — big number, small label, three supporting stat cards, accent colour — and must not be refactored into it. An optional footer slot carries at most one small key.

### The Range Selector

Mode is set by a positional switch, never a dropdown: both positions are visible at rest inside a recessed field-ground track, so which network you are on *and* what the alternative is are readable without opening anything. Radiogroup semantics, arrow keys native. The selected position takes the panel key's fill plus its inner highlight and `aria-checked`; the unselected position keeps full-strength ink on the plate, because an unselected position is available, not disabled.

### Alerts (inline) and the Annunciator (docked, S16)

**Alert** (`ui/alert`) is the inline device: plate ground, recessed body, machined corners, 1px edge in the tone's hue at 55–60%. The **title** is a small lit legend plate carrying the tone's measured fill and foreground, with a dot inside it, and the tone is always stated in the title's words. No thick coloured left rule; no washed field. Body text uses the tone's text token, never its fill token.

**The Annunciator (`components/Annunciator.tsx`) is the same device, docked at the base of the chassis, not held above it.** Every screen — `Main`, `Unlock`, `Onboarding` — reserves this band via the shared `ChassisShell` (docs/decisions.md §9.1). It lights the same legend from the same tone map (`ANNUNCIATOR` and `NOTICE_TONE`, exported from `ui/alert`), so an inline notice and a docked notice report a state in identical colours. Because it sits in the panel's own plane like every other device, it takes the ordinary plate bevel shadow (`.panel-plate`) rather than a raised one — there is nothing left in this app that floats above the chassis. Its lit legend is the **state word** — Confirmed / Caution / Error / Notice — because a notice's message is a whole sentence, and a lit sentence is a washed field by another name.

The legend plate's shape is one exported constant (`ANNUNCIATOR_LEGEND`), shared by `AlertTitle` and the Annunciator's notice rows, so the two devices cannot visually drift apart.

**Quiet, several-at-once, and where it lives.** With nothing to report the annunciator is a genuinely unlit plate — no ghost of a dismissed notice (docs/decisions.md §9.3, N2). With several notices outstanding it shows the most severe one plus a count of the rest, expanding to the full bounded list on request, so an outstanding error is never buried under successes and the band never grows without bound (§9.4, N3). It replaced a sonner-backed floating toast in S16 — the previous "opts out of sonner's unlayered stylesheet" workaround no longer applies to anything in this repo, since the dependency is gone.

## Do's and Don'ts

### Do:

- **Do** treat light and dark as two materials. Add tokens to both `:root` (enamel, hue 250) and the `prefers-color-scheme: dark` block (steel, hue 125), with values chosen per finish rather than derived by inverting lightness.
- **Do** run `bun run check:contrast` after touching any colour, and add the new token's pairs to the script's 25-per-finish set. A token without pairs is incomplete work.
- **Do** keep commit orange on the fund-moving control class only, and keep saturated destructive fill on the in-dialog confirm key only. Use the `danger` treatment for anything that merely opens that dialog.
- **Do** report live state with `StatusLegend` — a lamp plus an adjacent visible word — and change the accessible name when the state changes. Do not hand-roll the pair; that is how six call sites came to carry the same string with one silent variation.
- **Do** set every numeral, address, and hash in the data face, and pass money in as a pre-formatted string.
- **Do** keep card titles as small engraved placards and let the value carry the scale.
- **Do** put responsive behaviour inside the primitive, not at the call site.
- **Do** build depth from bevels, recesses, and key travel — a real inset shadow stack for anything that reads as cut in.
- **Do** leave the browser's focus ring alone, including on skip-link landing targets.

### Don't:

- **Don't** ship a chroma-zero neutral. Every grey in this system has hue.
- **Don't** style `:focus` or `:focus-visible`, and never write `outline-none`.
- **Don't** round controls, plates, fields, or containers beyond the machined 0.125rem scale — no pills, no `rounded-lg` web chrome. The indicator lamp disc is the one intentional full-round element.
- **Don't** wash an alert's field in its tone colour. Light a legend-sized plate instead; commit orange stays the only saturated field.
- **Don't** use a fill token (`--destructive`, `--warning`, `--success`) as a text colour, or a `--text-*` token as a fill. They are separately measured.
- **Don't** spend commit orange on navigation, selection detents, links, or emphasis.
- **Don't** fake a recess with a flat colour swap, and don't add hard offset shadows — this world's light is soft and directly overhead.
- **Don't** add faux-metal gradients, brushed textures, or drawn engraving effects.
- **Don't** break the readout into separate stat cards, or give a screen a second panel-scale number.
- **Don't** treat `--border` as a control boundary: it is a decorative scribe rule at a 1.5:1 visibility floor. Field and control edges use `--input`, measured at 3:1.
- **Don't** declare motion the build cannot run. There is no animation library installed; enter/exit animation classes resolve to nothing and were removed rather than left declared-but-absent.
- **Don't** add a `.dark` class or a theme toggle. The finish follows `prefers-color-scheme` only.

## Known Gaps / Next Moves

Recorded honestly; the owner chose to ship as it stands.

- **Chassis density at large viewports — partially spent, 2026-09-02.** At 1440×900 the face below the plate row was roughly 375px of empty ground. The S16 annunciator (docs/decisions.md §9) now occupies a fixed band of it at the base of the chassis on every screen, but that band is small and mostly unlit at rest (N2) — the composition still does not fill the instrument the way a fifth register of real content would. Unfinished ambition remains: the next move is content, not more chrome.
- **`.panel-scribe` — RESOLVED and removed 2026-09-02.** The device had zero call sites, so it was defined vocabulary rather than a system rule. Region separation is, and remains, a plain 1px `border-b` / `border-x` in the scribe colour — which is what every verified screenshot actually shows. Deleted from `src/index.css`'s component layer in the same change that touched that file for S16.

  **If the chassis-density gap above is ever funded, the scribed groove is the device to reach for** — a real depth register is exactly what that work needs, and re-introducing it deliberately, with call sites, is different from leaving it lying around unused.
- **Hardcoded white on the QR plate.** `QrCode.tsx` sets `bg-white` on its plate so scanners have the contrast they need. It is a build-carried necessity, not a palette token, and is deliberately not recorded above.
