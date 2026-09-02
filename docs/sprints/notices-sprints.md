# Notice Annunciator Sprint Plan

Derived from a placement review of the notification layer (2026-09-02), run
after the `polish` and `extract` passes that rebuilt the toast onto the panel's
own vocabulary. Those passes fixed what a notice *looks* like. This plan is
about where it *is*, which turned out to be the larger problem.

Implements [`../user-stories/in-app-notices.md`](../user-stories/in-app-notices.md).

Finding IDs use the `NA-` prefix, keeping them distinct from `C*/H*/M*/L*`
(bugfix), `IF-*` (interface) and `CD-*` (cicd). Sprint numbering continues at
**S16** so IDs stay unique across all four files.

**No `Block`.** `NA-1` is a real defect with a real consequence — a persistent
error can hide the one indicator that says the funds are real — but it does not
meet the bar `IF-H1`–`IF-H4` met in `interface-sprints.md`: no task is blocked,
nothing is clipped at a supported viewport, and no contrast floor is breached.
It should not wait behind other work either.

> **STATUS: S16 and S17 both verified-complete 2026-09-02.** N1–N4 decided in
> `docs/decisions.md` §9. The chassis shell is shared by `Main`, `Unlock`, and
> `Onboarding` via `ChassisShell`; sonner is removed and `notify.tsx` is
> store-backed with all 27 `toast` call sites unchanged; the docked
> `Annunciator` implements the quiet state (N2), the severity-plus-count
> display for several notices (N3), and Unlock/Onboarding's own treatment in
> the same pass, since building the complete device once was more direct than
> building it twice. All four gates (`lint`, `build`, `test`,
> `check:contrast`) are green.
>
> **The visual acceptance criteria were checked with a real browser** (a
> Playwright MCP session driving headless Chrome against `bun run dev`,
> including a virtual WebAuthn authenticator to get through passkey
> registration in `Onboarding`) **and two real defects surfaced in the
> process, both fixed in this pass:**
>
> 1. The `aria-live="polite"` wrapper only covered the primary notice row and
>    the collapsed "+N more" toggle — the expanded list of secondary notices
>    lived in a sibling `<div>` outside the live region. A notice arriving
>    while already expanded would render silently to a screen reader. Fixed
>    by moving the expanded list inside the live region (`Annunciator.tsx`).
> 2. A real validation-error message (an unbroken base58 alphabet listing with
>    no spaces — `"Unknown letter…Allowed: rpshnaf39w…"`) overflowed the
>    notice plate's right edge at 320px instead of wrapping. `min-w-0` on the
>    flex parent was not enough; the text node itself needed
>    `overflow-wrap: anywhere` (Tailwind's `break-words`). Fixed on the
>    message/description container in `NoticeRow`.
>
> Confirmed at 320px and 1440px, both panel finishes (light/dark via
> `page.emulateMedia`), 200% zoom (viewport halved to `640×400`, which is the
> correct way to test a `dvh`-based layout — CSS `zoom` on `<html>` is not,
> since it scales the box model without shrinking the viewport `dvh` resolves
> against), one/two/three simultaneous notices with the `max-h-48` overflow
> list, dismiss-one-leaves-the-others, the quiet state (genuinely blank, no
> ghost of the last dismissed notice), the Mainnet "Real funds" badge staying
> visible and unobstructed through a persistent error (NA-1's original
> complaint), both nav rows fully present at 320px (NA-2's original
> complaint), a success notice auto-dismissing at 5s, and the `Unlock` →
> reset-device → `Onboarding` (choice/import-seed/vault-setup/backup-confirm)
> → `Main` path end to end.

---

## Decisions required before implementation

Four, carried from the epic. `N1` and `N4` decide the shell and therefore S16's
shape; `N2` and `N3` live inside the annunciator and can be answered while S16
is in flight.

| # | Question | Blocks |
|---|---|---|
| **N1** | Does the chassis shell move up to `App`, so `Unlock` and `Onboarding` share one notice area? | **S16** |
| **N4** | Notice area at the base of the chassis, or under the header? | **S16** |
| **N2** | What the area shows when there is nothing to say. | S17 |
| **N3** | Behaviour when several notices are outstanding. | S17 |

Full statements, recommendations and reasoning are in the epic's *Open
decisions* table. They are recorded there rather than duplicated here.

---

## Findings

| ID | Finding |
|---|---|
| **NA-1** | **A persistent notice can hide the Mainnet "Real funds" badge.** Notices are `position: fixed` at `top-center`; nothing in the app is sticky, so a notice sits over `AppHeader` at any scroll position. Errors and warnings never auto-dismiss by design (`docs/decisions.md` §6.5), so the badge stays hidden until the user dismisses the notice. The header also carries the wallet and network selects, so the controls that change *which account this is about* are covered at the same time. |
| **NA-2** | **At 320px the stack also covers the nav.** The six-function `TabsList` is two rows of three below `sm` (§6.13). A notice stack at the top covers the header and both rows, which is the entire chrome of the app at the narrowest supported viewport. |
| **NA-3** | **The notice is the only device in the app that floats over the instrument.** Every other surface in `DESIGN.md` — plate, well, scribe, lamp, annunciator — sits in the panel's plane. A bench panel has no floating notice; it has a fixed annunciator area that is dark until something lights it. This is the world-level reason the answer is a docked area rather than a different `position` value, and it is what makes this an epic rather than a one-line fix. |
| **NA-4** | **The opposite edge is not a free alternative.** Moving the notice to the bottom trades one collision for a worse one: `SendTab`'s commit key and Balances' faucet button both sit low in their panels and scroll into the lower viewport. Covering the control that moves funds is worse than covering the header. Any fixed overlay collides with something; only a docked area collides with nothing. |
| **NA-5** | **sonner is the wrong dependency for a docked notice.** It is fixed-positioned by design, and its stylesheet is injected unlayered at runtime — which is why the toast needed `unstyled: true` and an unlayered CSS island in `index.css` to reach the design system at all. Both workarounds are documented in `DESIGN.md`. Docking it means fighting both at once, and its animation and stacking model assumes absolutely-positioned children inside a fixed container. |
| **NA-6** | **`Unlock` and `Onboarding` render instead of `Main`, not inside it.** Seven notices are raised from those two screens. A notice area built into `Main`'s shell would not exist on either. This is `N1`, and it is the decision that changes S16's shape rather than its detail. |
| **NA-7** | **The empty chassis face is unfinished ambition, not a constraint.** The 2026-09-01 finish record shipped a known-open finding: roughly 375px of empty chassis below the plate row at 1440×900, with the panel vocabulary defining four devices and the built pages leaning on two. A docked notice area spends that space on a fifth device rather than leaving it as a gap the record has to keep acknowledging. |
| **NA-9** | **`docs/decisions.md` §6.5 states its mechanism in sonner's terms.** The rule itself — errors and warnings never auto-dismiss, state changes are announced in a polite live region — is unaffected by this epic and must survive it exactly. But §6.5 explains *why the rule lives in `notify.ts`* as a workaround for `<Toaster toastOptions>` applying one duration to every type, and calls `closeButton` "required, not cosmetic". Both sentences describe a dependency this plan removes. §6.5's file reference is also already stale: the file is `notify.tsx` since 2026-09-02. |
| **NA-8** | **Removing sonner deletes the unlayered CSS island.** `index.css` currently ends with the one rule in the file that sits outside a cascade layer, restoring the focus ring sonner suppresses and holding the plate shadow through `:focus-visible`. It exists only because sonner does. When sonner goes, the island goes — and `DESIGN.md`, which documents it as load-bearing, changes in the same commit. |

---

## Sequencing rationale

Two sprints, split at the point where the risk changes:

1. **S16** — the shell and the device, together. The shell change is the
   irreversible part: it converts the app from a scrolling document into a
   fixed-height shell, which touches how every screen scrolls. The annunciator
   ships with it rather than after it, because a sprint that reserves an empty
   band while notices still float over the panel would ship a meaningless strip
   and fix nothing.
2. **S17** — density, the quiet state, and the screens outside `Main`. All three
   are refinements of a working device, and all three are blocked on decisions
   that can be answered while S16 is in flight.

**The point of no return is the shell, not the device.** `min-h-dvh` →
`h-dvh` with the content scrolling in its own region changes mobile URL-bar
collapse, scroll position across tab switches, and the skip link's landing
target. Decide `N1` and `N4` before starting; discovering either mid-sprint
means rebuilding the shell.

---

## Sprint 16 — The chassis shell and the annunciator

**Goal:** no notice covers anything, ever.
**Findings:** NA-1, NA-2, NA-3, NA-4, NA-5, NA-7, NA-8, NA-9.
**Blocked on:** N1, N4.

- Convert the chassis to a fixed-height shell: header pinned, notice area
  pinned, panel content scrolling in its own region between them. The notice
  area is present at all times, so its arrival never reflows the panel.
- Name the blast radius before touching it. `min-h-dvh` → `h-dvh` plus
  `overflow-y-auto` on `main` changes: mobile URL-bar collapse behaviour, scroll
  position when switching tabs, and the skip link's landing target
  (`Main.tsx`, `tabIndex={-1}` on `#main-content`). Check each deliberately
  rather than discovering them in review.
- Build the annunciator as the panel's fifth device, from vocabulary that
  already exists: `ANNUNCIATOR_LEGEND` and `ANNUNCIATOR` for the lit legend,
  `NOTICE_TONE` for the tone, `StatusLegend` for the quiet state, `panel-plate`
  for the ground. It is not a new visual language.
- Keep the annunciator rule: a legend-sized lit plate, never a washed field, and
  `--commit` stays the only saturated field on the panel.
- Remove sonner. Its whole footprint is `App.tsx` and `lib/notify.tsx`; **all
  twenty-five call sites keep the `toast` API unchanged** and must not be edited.
  Delete the unlayered rule at the end of `index.css` in the same commit, and
  update the two `DESIGN.md` passages that document it and the raised-plate
  shadow (NA-8).
- Amend `docs/decisions.md` §6.5 in that same commit (NA-9). The rule does not
  change; its stated mechanism does. Rewrite the paragraph that explains the
  rule as a sonner workaround, drop the `closeButton` sentence, and correct the
  stale `notify.ts` path. Leaving an authoritative document describing a
  dependency the codebase no longer has is the exact drift this project already
  had to correct once in `DESIGN.md`.
- Single-notice behaviour only. Several-at-once, the quiet state, and the
  screens outside `Main` are S17 and are allowed to be crude here — but not
  broken.
- Preserve §6.5 exactly: errors and warnings never auto-dismiss, arrival is
  announced through a live region, and the state reaches the accessible name as
  real DOM text.

**Done when** no notice, at any scroll position, at 320px and 1440px, in both
panel finishes, overlaps the header, the six-function nav, or any control — and
a deliberately raised persistent error leaves the Mainnet "Real funds" badge
visible and the commit key in the same place it was before the error arrived.
§7.2 must still hold at 320px: six functions in two rows of three, no label
shortened, nothing scrolled out of view.

---

## Sprint 17 — Density, quiet state, and the screens outside `Main`

**Goal:** the device holds up on a bad minute and on every screen.
**Findings:** NA-6.
**Blocked on:** N1 (again, for `Unlock`/`Onboarding`), N2, N3.

- Implement the overflow rule chosen in N3, with a bounded height. Severity must
  stay legible: an outstanding error is never buried under three successes.
- Implement the quiet state chosen in N2. Whatever it shows, it must not
  fabricate reassurance — a permanent "nominal" that measures nothing is the
  panel telling a lie, and this product ranks correctness about money above
  everything.
- Give `Unlock` and `Onboarding` their notice treatment per N1, keeping the
  eight existing notices' copy exactly as it stands (one on `Unlock`, seven on
  `Onboarding`).
- Verify the long strings at 320px: the `tec*` result codes must not break
  across lines, and both expired-transaction sentences must wrap sensibly.
- Verify 200% zoom, which `PRODUCT.md` records as a supported condition rather
  than an edge case.

**Done when** three simultaneous persistent notices — one of each tone — are all
reachable at 320px with the nav still fully present and no label shortened, and
the wrong-PIN notice on `Unlock` behaves the way a notice does everywhere else.
