# Interface Sprint Plan

Derived from the cross-discipline interface review (2026-09-01) of the whole
`src/` UI tree — accessibility, layout, writing, typography, colors, UI polish —
against `docs/decisions.md` §3 guardrails / §4 enforced patterns and
`docs/user-stories/INDEX.md`.

Companion to `bugfix-sprints.md`, which covered XRPL/functional correctness and
is complete. That review looked at whether the wallet does the right thing to
the ledger; this one looks at whether a person can actually operate it. The two
finding sets do not overlap, with one exception noted under **Relationship to
`bugfix-sprints.md`**.

Finding IDs (`IF-H*` / `IF-M*`) are canonical and carried through from that
review. The `IF-` prefix keeps them distinct from the `C*/H*/M*/L*` IDs already
used by `bugfix-sprints.md`. Sprint numbering continues at **S8** so sprint IDs
stay unique across both files.

> **STATUS: all five sprints completed 2026-09-01.** Every finding below is
> fixed. The decisions the plan asked for are recorded in `docs/decisions.md`
> §6. Verification, including two defects found during execution rather than
> during the review, is at the bottom of this file.

**Verdict carried over: `Block`.** Four findings are confirmed escalation
triggers (`IF-H1`–`IF-H4`) — a control clipped or overlapped at a supported
viewport, a focus indicator below its contrast floor, and body text below its
contrast floor. S8 and S9 clear all four. **All four are now fixed and
verified; the `Block` is lifted.**

---

## Sequencing rationale

Five sprints, ordered by *blast radius first, then dependency*:

1. **S8** — the three blocking triggers. All live in shared primitives and the
   base layer, so each fix clears a defect on every screen at once. Highest
   leverage in the plan; ship first and independently.
2. **S9** — color roles and contrast. Second because `IF-H4` needs new
   text-role tokens, and whether those tokens need dark-mode values is exactly
   the `IF-M9` decision — doing them apart means doing the token layer twice.
3. **S10** — assistive-technology exposure. Independent of S8/S9;
   parallelizable by a second person.
4. **S11** — content reachability and number rendering. Soft dependency on S8
   (`IF-M5` adds focusable tooltip triggers, which want a working focus ring).
5. **S12** — copy consistency and dead-code deletion. Last: lowest risk,
   touches no shared behaviour.

S10 can run concurrently with S8–S9. S11 should follow S8. S12 can land any
time.

---

## Verification prerequisites

**Read this before starting.** The review reached the empty and
not-activated states only — the test account was unfunded on testnet, so
several surfaces never rendered. Four findings are therefore filed from source
and token values rather than from a rendered instance: `IF-H4` (the
`text-warning` upper-bound note), `IF-M4` (the trust-line Close control),
`IF-M6` (the History amount column) and parts of `IF-M2`.

Before verifying any sprint below, put a testnet wallet into a populated state:

1. Fund it from the faucet on the Balances tab.
2. Create a trust line, so `TrustLineRow` renders with a real line — and a
   second with a non-zero balance, which is the state `IF-M4` is about.
3. Send a payment to another address, so History has rows, the amount column
   has content, and the `outcome` result box and `TxStatusBadge` variants render.
4. **Add a second wallet.** Several surfaces only render past a state
   threshold and are invisible on a single-wallet device — the header's wallet
   selector (`wallets.length > 1`), the Settings wallet list with a
   non-active row, the zero-balance trust-line notice, the "Load more" history
   control. Skipping this is exactly how the two defects in §"Found during
   execution" below were missed by the review itself.

Also still unverified at runtime and worth a pass while the app is in this
state: the Unlock screen and its backoff countdown, the import and
import-warning flows, and the populated address book.

Two checks the review could not run at all, neither of which any sprint below
depends on:

- **Automated accessibility audit** (axe or equivalent) — unavailable in the
  review environment. Worth adding to the harness; a natural follow-on to S10.
- **RTL mirror** — not inspected. The codebase uses physical Tailwind spacing
  utilities throughout, so this needs its own pass before any localization
  work. Deliberately not folded into these sprints; see **Out of scope**.

---

## Sprint 8 — Blocking viewport & focus failures

**Goal:** clear every escalation trigger that blocks a task at a supported
viewport or leaves keyboard users unable to see where they are.
**Findings:** IF-H1, IF-H2, IF-H3.

| ID | File | Fix |
|---|---|---|
| IF-H1 | `pages/Main.tsx:28`, with `components/ui/tabs.tsx:19` | `<TabsList className="grid w-full grid-cols-6">` forces six equal columns; at 320px each trigger is 47px while `whitespace-nowrap` + `overflow: visible` need 52px ("Balances") and 49px ("Settings"), so labels spill outside their own pill and collide with their neighbours. Replace the fixed grid with a flex row in an `overflow-x-auto` container, letting ~16px of the next tab peek past the edge as the scroll cue (per `better-layout`: hidden content needs a visible affordance). Do **not** fix this by shortening the labels — the six-column grid breaks again at the next locale. |
| IF-H2 | `components/ui/dialog.tsx:31` | `DialogContent` computes `max-height: none` / `overflow-y: visible`, and `w-full` makes it full-bleed below 512px. Measured at 640×360 (≡ 1280×720 at 200% zoom) with two ordinary inline validation errors showing: the dialog is 426px tall, its title sits at −8px, the X close button at −16px and the "Create trust line" submit at 368px in a 360px viewport, with neither the dialog nor the page scrollable — both the confirm and the dismiss are off-screen. Restore the two constraints upstream shadcn carries and this copy dropped: `max-h-[calc(100%-2rem)] overflow-y-auto` and `w-[calc(100%-2rem)]`. |
| IF-H3 | `index.css:90`; `components/ui/button.tsx:7`, `input.tsx:10`, `select.tsx:14`, `checkbox.tsx:10` | The base rule `* { @apply border-border outline-ring/50 }` recolors the UA focus ring to `--ring` at 50%, and the primitives then set `outline-none focus-visible:ring-2 focus-visible:ring-ring/50`, making that ring the only indicator. Measured against the surfaces it actually renders on: **1.54:1** on card, **1.52:1** on `bg-muted/40`, **1.50:1** on the warning alert, **1.49:1** on the tablist — against the 3:1 WCAG 2.4.11 floor. Computed style confirms `outline-style: none` at all 14 keyboard stops. Prefer the platform: drop `outline-ring/50` from the base rule and `outline-none` from the primitives so the browser's own high-contrast ring returns. Only if a custom ring is required, give it a token measuring ≥3:1 against all four surfaces above. |

**Done when:** all six tab labels are legible and non-overlapping at 320px; the
Add-trust-line dialog with two field errors keeps its title, close and submit
reachable at 640×360 and scrolls internally when taller than the viewport;
every control shows a focus indicator measuring ≥3:1 against its own backdrop,
including a Button inside a `variant="warning"` Alert.

**Risk — guardrail #8.** IF-H2 and IF-H3 both edit `components/ui/*`, which
exists in-repo precisely so it can be edited. Apply the upstream classes **by
hand and diff them**; do not re-run the shadcn CLI over these files, which
would revert the deliberate local customizations (`decisions.md` §3 #8, the
documented shadcn/AI-agent failure mode).

**Risk — IF-H3 scope.** Restoring the platform ring changes focus appearance on
every control in the app. Walk the keyboard path on all six tabs plus
Onboarding and Unlock afterward, not just one screen. `Onboarding.tsx:254`'s
Radix checkbox is in this path and its label forwarding was verified working in
the review — do not regress it.

---

## Sprint 9 — Color roles & theme reachability

**Goal:** stop borrowing fill tokens as text colors, and resolve whether dark
mode ships. **Findings:** IF-H4, IF-M9.

| ID | File | Fix |
|---|---|---|
| IF-H4 | `pages/tabs/HistoryTab.tsx:80`; `components/ui/alert.tsx:9`; `pages/tabs/SettingsTab.tsx:194` | `--warning`, `--success` and `--destructive` are *fill* tokens and pass in that role (`bg-warning text-warning-foreground` measures 9.23:1). Using them as text colors is `better-colors`' "semantic token used outside its role — never borrow by value". Measured failures against 4.5:1: `text-warning` on card **2.15:1**, `text-success` on card **3.71:1**, `text-destructive` on `bg-destructive/10` **3.99:1**. Add the missing text-role tokens (`--color-text-warning`, `--color-text-success`, and a darker `--color-text-destructive` for the tinted alert surface) and point these three call sites at them. For `HistoryTab:80` the cheaper option is `--foreground` plus the non-color carrier `better-accessibility` already requires — take that unless the amber is deliberate. |
| IF-M9 | `index.css:32-56` | A complete 24-token `.dark` block exists with `@custom-variant dark (&:is(.dark *))`, but nothing in `src` or `index.html` ever applies the `dark` class, so the whole theme is unreachable. Not harmless: it hides two pairs that fail the moment it is switched on — the destructive badge label at **2.77:1** and the same focus ring as IF-H3 at **1.87:1**. **Decide, don't defer:** either wire exactly one switching mechanism (a toggle that sets `.dark`, *or* `prefers-color-scheme` — never both, per `better-colors`) and fix those two pairs, or delete the block. Record the decision in `decisions.md` §5. |

**Done when:** every text/background pair the app renders measures ≥4.5:1
(≥3:1 for non-text), verified by re-running the review's measurement script; no
component references a `bg-*` fill token as a text color; and `.dark` is either
reachable and measured, or gone.

**Note — measure, don't repaint.** `better-colors` is explicit that a failing
pair is reported and left alone unless a change is asked for. These new token
*values* are a design decision, not a review output: pick them deliberately,
then re-measure. The review measured these with a throwaway script (oklch →
sRGB → WCAG 2.1, handling the `/10` and `/40` alpha composites) that lived in a
session temp directory and is now gone — write the equivalent into the repo, so
this check is repeatable rather than re-derived by hand each time.

**Sequencing note.** Do IF-M9 *first* within this sprint. If dark mode is
deleted, IF-H4's new tokens need only light values, which is materially less
work than defining and measuring both.

---

## Sprint 10 — Assistive-technology exposure

**Goal:** make structure, state and field purpose reachable by a screen reader.
Closes the guardrail #9 pass that `decisions.md` §4 requires before merge —
currently failing for the generic primitives, not only the bespoke ones.
**Findings:** IF-M1, IF-M2, IF-M7, IF-M4. *Parallelizable with S8–S9.*

| ID | File | Fix |
|---|---|---|
| IF-M1 | `components/ui/card.tsx:11`; `components/AppHeader.tsx:20` | `CardTitle` renders a `<div>`, so the accessibility-tree snapshot of Main shows **zero headings** — "XRP Balance", "Tokens", "Trust Lines", "Security" all surface as `generic`. The only `<h1>` in `src` is `Onboarding.tsx:158`. Give `CardTitle` an `as`/`asChild` escape hatch and render real `h2`/`h3` at the call sites; promote the app name to the page `<h1>`; add a "Skip to content" link as the first focusable element, since the header's two selects precede `<main>` on every tab. |
| IF-M2 | `App.tsx:62`; `components/wallet/AddressDisplay.tsx:22-23`, `SeedReveal.tsx:55-56`; `pages/tabs/HistoryTab.tsx:50` | No `aria-live`, `role="status"` or `aria-expanded` anywhere in `src`. Three consequences, one root cause — state changes never reach assistive tech: (a) sonner's `TOAST_LIFETIME` is 4000ms and unoverridden, so unlock failures and faucet errors, which have no inline equivalent, vanish in 4s — against `better-accessibility`'s rule that error toasts stay until dismissed; give errors `duration: Infinity` or render them inline. (b) Copy confirmation is an icon swap with `aria-label` unchanged at "Copy address" — announce it in a stable `role="status"` region rendered before its text updates, and reflect it in the accessible name. (c) The History row expander is a bare `<button>` with no `aria-expanded`. |
| IF-M7 | `pages/Onboarding.tsx:200,232,234`; `pages/Unlock.tsx:101`; `pages/tabs/SettingsTab.tsx:178` | Every credential field is `type="password"` with no `autocomplete` (verified: `#pin` returns `null`). Password managers will offer to save the 6-digit PIN and, on the two seed inputs, the wallet's recovery secret — putting key material into a store `decisions.md` guardrail #3 exists to keep it out of. Set `autocomplete="new-password"` on setup, `"current-password"` on unlock, and `"off"` on both seed inputs. |
| IF-M4 | `components/wallet/TrustLineRow.tsx:31`; `pages/tabs/TrustLinesTab.tsx:150` | The call site passes `onRemove` only when `l.balance === '0'`, so a user holding a token sees **no Close button and no explanation why**. The component's guarded `disabled` + `title="Balance must be zero to close this trust line"` branch is therefore dead code — and unreachable twice over, since `better-accessibility` rules out tooltips on natively `disabled` controls. Always render the control, use `aria-disabled` so it stays focusable, and put the reason in visible text beside it. |

**Done when:** the accessibility tree shows a coherent heading outline on all
six tabs with one `<h1>`; a screen reader announces copy success and every
error; the History expander reports its expanded state; no credential field is
untyped; and a trust line with a non-zero balance shows a Close control that
explains itself.

**Risk — IF-M7 and guardrail #3.** `autocomplete="off"` is a request, not a
guarantee; browsers may ignore it. It reduces exposure but does not make the
seed inputs safe to treat as ordinary fields — the uncontrolled-ref handling
that `bugfix-sprints.md` S2 put in place (`C2`) stays load-bearing and must not
be simplified away while touching these lines.

---

## Sprint 11 — Content reachability & number rendering

**Goal:** make truncated values reachable without a mouse, and stop money
jittering. **Findings:** IF-M5, IF-M6. *Soft dependency on S8.*

| ID | File | Fix |
|---|---|---|
| IF-M5 | `components/wallet/AddressLink.tsx:26,47` | `title={address}` / `title={hash}` is the only route to the untruncated value behind `truncateMiddle(value, 6, 4)`. `title` satisfies the letter of the truncation rule for mouse users but never fires for keyboard or touch — and on a self-custody wallet, checking a full address is the entire purpose of the row (`block-explorer-links.md` US-1). Reuse what the project already has: `TooltipProvider` is mounted at `App.tsx:60`, so wrap the link in the existing `Tooltip` primitive. Affects every counterparty in History, every wallet and address-book row in Settings, and every trust-line issuer. |
| IF-M6 | `pages/tabs/BalancesTab.tsx:79`; the amount column at `HistoryTab.tsx:63-69` | `tabular-nums` appears nowhere in `src`. The `text-3xl` headline balance re-renders on every live account update and on faucet funding, and proportional digits make it shift. Add `font-variant-numeric: tabular-nums` (Tailwind `tabular-nums`) to money values. The History column is `font-mono` so it holds width already — add it there for consistency, not urgency. |

**Done when:** every truncated address and hash exposes its full value by
keyboard and on touch, not only on hover; the headline balance holds its
position across a faucet funding and a live update.

**Risk — IF-M5 and hit areas.** Wrapping an inline link in a tooltip trigger
adds a focus stop inside dense rows. Check `better-accessibility`'s hit-area
rule afterward: extended hit areas must not overlap, and History and Settings
rows put these links next to other controls.

---

## Sprint 12 — Copy consistency & dead code

**Goal:** one vocabulary, and no classes that do nothing.
**Findings:** IF-M3, IF-M11, IF-M10, IF-M8.

| ID | File | Fix |
|---|---|---|
| IF-M3 | `pages/tabs/BalancesTab.tsx:114` vs `pages/Main.tsx:33` | The copy reads "…trust line(s) with zero balance — see Trust Lines tab", but the tab is labelled **Tokens** — it sends users to a tab that does not exist under that name, on a screen whose own card title is already "Tokens". Pick one term for the concept and use it in both places; the `(s)` also builds a plural from a fragment, which `better-writing` rules out for localization. |
| IF-M11 | `pages/tabs/BalancesTab.tsx:104`; `HistoryTab.tsx:42`; `TrustLinesTab.tsx:144`; `SettingsTab.tsx:221` | Four empty states that only shrug: "No token balances yet." / "No transactions yet." / "No trust lines yet." / "No saved addresses yet." An empty state should orient and offer the next action. These are the highest-leverage teaching moments in the product — a new user's Tokens tab is empty precisely because they do not yet know a trust line is required to hold a token, which is the single most non-obvious fact in `INDEX.md`. |
| IF-M10 | `components/AppHeader.tsx:21`, `:38-46` | `<Badge>{network}</Badge>` renders the raw store value `testnet` immediately beside a `<Select>` rendering `Testnet` — the same fact twice, in two casings, confirmed in the 320px screenshot. Drop the badge and let the select carry the network, or keep the badge for the mainnet caution only. Store copy in natural case and style with `text-transform` rather than shipping the enum value. **Decision needed:** whether the mainnet warning wants a distinct visual treatment at all; if so, `warning` is the truer semantic than the current `destructive`. |
| IF-M8 | `components/ui/dialog.tsx:16,31`; `components/ui/tooltip.tsx:15` | `animate-in`, `fade-in-0`, `zoom-in-95`, `animate-out`, `zoom-out-95` all resolve to nothing — neither `tailwindcss-animate` nor `tw-animate-css` is in `package.json` or imported by `index.css`, so dialogs and tooltips have no animation today. **Delete the classes.** Deletion is step 1 of the fix ladder; installing the dependency is step 5, and it would light up unguarded zoom and scale motion in an app with no `prefers-reduced-motion` guard anywhere in `src` — so the cheap fix is also the safe one. If animation is genuinely wanted later, it arrives with a reduced-motion guard, as its own scoped change. |

**Done when:** no copy references a surface by a name it does not have; each of
the four empty states names what the place is and offers one next action; the
network appears once in the header; and no undefined animation utility remains
in `components/ui/*`.

---

## Decisions this plan needs recorded

Following the precedent of `decisions.md` §5 — decided rather than left open,
so the doc and the code do not drift apart again:

| Sprint | Decision | Why it can't be deferred |
|---|---|---|
| S9 / IF-M9 | Does dark mode ship? Wire one switching mechanism, or delete the block. | Changes how much work IF-H4 is, and a half-built theme ships broken the day someone adds a toggle. |
| S9 / IF-H4 | The actual values for the new text-role tokens. | `better-colors` reports failing pairs and leaves the colors alone; picking values is a design call, not a review output. |
| S12 / IF-M10 | Does the mainnet-vs-testnet distinction need its own visual treatment, and is `destructive` or `warning` the right semantic for it? | Mainnet is the *normal* production network currently painted in the danger hue while testnet gets neutral gray — arguably deliberate, but it should be written down either way. |

---

## Out of scope

Considered during the review and deliberately **not** filed — recorded here so
they are not rediscovered and re-filed as findings:

- **`canSend` disabling "Review payment" until the form is valid**
  (`SendTab.tsx:135-142`). `better-accessibility` warns against disable-until-valid
  in general, but this is an irreversible-payment form whose own §4 mandates a
  confirm step; the inline errors with `aria-describedby` already do the work,
  and the button opens a dialog rather than submitting. Deliberate, and correct
  here.
- **The `"Setting up…"` busy-label swap** (`Onboarding.tsx:236`) — replaces the
  label rather than keeping it beside a spinner. Cosmetic; not worth a change.
- **The unused `Switch` primitive** (`components/ui/switch.tsx`). Dead since
  `bugfix-sprints.md` L-tier replaced the never-toggling "Lock now" switch with
  a Button. Harmless; delete opportunistically, not as sprint work.
- **`min-h-screen` rather than `min-h-dvh`** (`Main.tsx:24`) and **no
  `antialiased` on the root**. Both defensible defaults; neither reached the
  reporting bar.
- **RTL** — genuinely unreviewed rather than dismissed. The codebase uses
  physical spacing utilities throughout, so this needs a dedicated pass, and
  filing it as a sprint item here would imply a scope the review did not cover.
- **Deliberate project choices left alone:** the shadcn flat-token convention
  (semantic tokens with no primitives tier), the app's density and radius
  scale, and its plain-language voice. All consistent; a convention being
  documented is not evidence it is good, but none of these produced a
  measurable failure.

---

## Relationship to `bugfix-sprints.md`

One item genuinely overlaps. That plan's **L-tier** noted "'Lock now' is a
`<Switch>` that never toggles (`SettingsTab.tsx:225`, guardrail #9)" and fixed
it — `SettingsTab.tsx:251-255` now carries a Button with a comment explaining
why. This review confirms that fix landed correctly and files nothing against
it. The leftover unused primitive is under **Out of scope** above.

Everything else is new surface: that review read the XRPL and crypto layers,
this one read the rendered interface. Notably, `decisions.md` §4 requires a
keyboard-and-screen-reader pass on every bespoke crypto component before merge
(guardrail #9). The bespoke components largely hold up — `AmountInput` wires
`aria-invalid` and `aria-describedby` correctly, every icon-only button has an
accessible name, `QrCode` has real alt text. The failures are in the *generic*
primitives and the base token layer, which guardrail #9 does not name and which
no previous sprint audited. S8 and S10 close that gap.

---

## Coverage

All 15 findings map to a sprint with none dropped:

| Sprint | Findings | Domain focus |
|---|---|---|
| S8 | IF-H1, IF-H2, IF-H3 | Layout, Accessibility |
| S9 | IF-H4, IF-M9 | Colors |
| S10 | IF-M1, IF-M2, IF-M7, IF-M4 | Accessibility |
| S11 | IF-M5, IF-M6 | Typography |
| S12 | IF-M3, IF-M11, IF-M10, IF-M8 | Writing, UI polish |

The review reported 15 findings against a cap of 15. Nothing was excluded by
the cap and no escalation trigger went unreported — but the cap did absorb the
LOW tier, so this plan is not a complete inventory of polish work, only of what
cleared the reporting bar.

`Block` lifts when S8 and S9 are done and verified; S10–S12 are `MEDIUM` work
that does not gate a release.

---

## Completion record (2026-09-01)

All five sprints executed. `Block` lifted: `IF-H1`–`IF-H4` are fixed and each
was re-measured or re-photographed in a browser, not assumed.

### Verification after the final change

| Check | Result |
|---|---|
| `tsc -b` | clean |
| `oxlint` | clean, apart from the same 4 pre-existing `react/only-export-components` warnings on shadcn primitives |
| `vitest run` | **29 passing** across 5 files (was 27/4 — one new component suite, see below) |
| `bun run build` | succeeds; `dist/sw.js` still registers no RPC runtime caching, precache is static assets only (guardrail #6 holds) |
| `bun run check:contrast` | **new.** All token pairs pass in both themes |
| Console, clean load, all six tabs | zero errors, zero warnings |

### Per-finding evidence

| ID | How it was verified |
|---|---|
| IF-H1 | At 320px: tablist `scrollWidth` 452 vs `clientW` 288 and scrollable; all six triggers `clipped: false`; page `scrollWidth` 320 (no horizontal scroll); screenshot shows every label legible with "History" peeking as the scroll cue. At 1280px still six equal 102px columns. |
| IF-H2 | At 640×360 (≡ 1280×720 at 200% zoom) with two inline validation errors: dialog `top: 16, bottom: 344` inside a 360px viewport, `max-height: calc(100% - 32px)`, `overflow-y: auto`, scrollable. Scrolled to the submit and `document.elementFromPoint` returned "Create trust line" — hit-testable, not merely present. Dialog now inset (`left: 64` of 640) instead of full-bleed. |
| IF-H3 | Keyboard walk of 12 stops: every control reports `outline-style: auto` with a real width (was `none` at all 14 stops). Pixel-diffed the previously-invisible case — a focused Button on the amber alert — 1018 pixels change, forming a ring; dominant new colour `rgb(168 199 250)`. Measured: the light stroke is 1.59:1 on that surface but its dark companion `rgb(52 58 68)` is **10.60:1**, so the two-tone indicator clears 3:1 where a flat colour would not (recorded in decisions.md §6.3). |
| IF-H4 | `check:contrast` measures the previously-failing pairs at **5.19:1** (`text-warning` on card, was 2.15), **4.79:1** (`text-success`, was 3.71) and **4.80:1** (`text-destructive` on `destructive/10`, was 3.99). |
| IF-M1 | Accessibility tree on populated Balances: `H1: XRPL Wallet`, `H2: XRP Balance`, `H2: Tokens`; on Settings: `H1` + four `H2`s. Skip link is the first focusable element and `Enter` moves focus to `MAIN` (`activeIsMain: true`). |
| IF-M2 | `aria-expanded` toggled `false` → `true` on a real transaction row. Error toast persistence proved incidentally and convincingly: a `tecNO_PERMISSION` error toast was still on screen ~25s after it fired, well past sonner's old 4s default. |
| IF-M3 · IF-M10 · IF-M11 | Rendered text checked on each surface; header shows the network once (no lowercase `testnet` duplicate); all four empty states render their forward-pointing copy. |
| IF-M4 | Zero-balance branch verified live on a real testnet trust line: Close rendered, `aria-disabled="false"`, focusable, no `aria-describedby`. The non-zero branch **cannot** be produced through this app's UI (issuing an IOU is out of scope), so it is covered by a new component test instead — see below. |
| IF-M5 | Keyboard focus alone (no pointer) opens the tooltip showing the full address `rJjHYTCPpNA3qAM8ZpCDtip3a8xg7B8PFo`, wired through `aria-describedby`; `title` attribute is gone. |
| IF-M6 | Computed `font-variant-numeric: tabular-nums` on both the headline balance and the History amount column. |
| IF-M7 | `#pin` previously returned `autocomplete: null`; now typed. PIN unlock re-tested end to end after the change. |
| IF-M8 | No `animate-in`/`fade-in-0`/`zoom-*`/`outline-none`/`ring-ring` tokens remain anywhere in `src`. |
| IF-M9 | Emulated `prefers-color-scheme: dark`: body resolves to `oklch(0.145 0 0)` on `oklch(0.985 0 0)` and `--text-warning` switches to its dark value. Screenshot confirms the palette renders. |

### Found during execution, not by the review

Two defects of the same escalation class as `IF-H1`, both fixed and recorded in
`decisions.md` §6.12:

1. **The header did not fit 320px with two wallets.** The wallet selector only
   renders when `wallets.length > 1`, and the review's device had one wallet, so
   the row was never tested at title + 160px + 112px + 36px. The two selects
   were crushed together and the lock button clipped off the right edge.
2. **Settings wallet-row actions overflowed to 406px.** Three buttons on one
   non-wrapping line, again only reachable with a second, non-active wallet.

The lesson is about the verification method rather than the code, so it is now
a standing prerequisite above: **check a multi-wallet UI with more than one
wallet.** A single unfunded wallet renders none of the threshold-gated
surfaces.

### Notable deviations from the plan as written

- **`--success` (light) and `--destructive-foreground` (dark) also changed.**
  Not in the plan. `check:contrast`, written as S9's harness, immediately caught
  the light success badge label at **3.55:1** — the "Success" badge on every
  validated transaction, which the review had measured but the plan had not
  called out as a fill-token fix. Fixed by darkening the fill to
  `oklch(0.525 0.15 145)` (label now 4.85:1). The dark destructive label was
  the latent 2.77:1 pair §6.1 predicted would ship broken.
- **A contrast harness was added** (`scripts/check-contrast.mjs`,
  `bun run check:contrast`). The plan only said to port the throwaway script
  "if this check should be repeatable"; it clearly should — it found a real
  failure within a minute of existing.
- **Component testing was introduced** to cover `IF-M4`'s unreachable branch:
  `@testing-library/react` + `jsdom` as devDependencies, and
  `src/components/wallet/__tests__/trust-line-row.test.tsx`. This partly closes
  `bugfix-sprints.md`'s **L12**, which noted the absence of component tests.
  Vitest 4 removed `environmentMatchGlobs`, so DOM tests opt in per file with
  `@vitest-environment jsdom`.
- **All notifications were routed through a new `src/lib/notify.ts`.** The plan
  implied a `<Toaster>` prop; sonner cannot express per-type durations that
  way, so the rule had to live in a wrapper.
- **`<main>` got `tabIndex={-1}`.** Without it the skip link only moved the
  sequential-navigation start point rather than focus, which Safari does not
  honour.
- **`antialiased` and `min-h-dvh` were applied** despite being listed under
  "Out of scope". Both were one-token changes in files already being edited for
  a filed finding, so leaving them would have cost more than doing them. The
  unused `Switch` primitive is still present, as planned.

### Still not verified

- **RTL mirror** — unchanged and still unreviewed. The codebase remains on
  physical Tailwind spacing utilities; this needs its own pass before any
  localization work.
- **Automated accessibility audit** (axe or equivalent) — still unavailable in
  this environment. The keyboard walk and accessibility-tree checks above are
  narrower than one.
- **The `outcome` result box and the non-`tesSUCCESS` `TxStatusBadge`
  variants** — a validated payment and an `expired` result were never produced.
  The `claimed` (`tec*`) path did render live, via the `tecNO_PERMISSION`
  trust-line attempt.
- **A trust line with a non-zero balance in the real UI** — covered by unit
  test, not by a rendered ledger state, for the reason given under `IF-M4`.
- **Real browser zoom** — 200% was emulated as a halved viewport, which reflows
  identically but is not the browser's own zoom control.
