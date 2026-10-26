---
name: XRPL Wallet — Wallet Chooser (delta)
description: Visual delta for the wallet chooser home screen, the per-wallet configuration sections and the header Wallets control. Inherits the repo-root DESIGN.md (The Bench Panel) in full; adds no colour, type-face or radius token.
status: draft
updated: 2026-10-19
inherits: DESIGN.md (repo root)
# No new colour tokens. Every {colors.*} reference below is defined in the
# repo-root DESIGN.md. `bun run check:contrast` therefore gains no pairs from
# this delta; if a later revision adds a token, it adds its pairs in the same
# change (repo DESIGN.md, Measured-Not-Judged Rule).
typography:
  # One new role, composed from existing faces. It exists because a wallet name
  # is user-authored text: it must NOT take the uppercase tracked placard legend
  # (docs/agents/ui-and-design-system.md, Never: uppercase user-authored text).
  wallet-name:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
    note: "Sentence case as typed. No text-transform. Wraps (break-words); never truncated with an ellipsis that hides the distinguishing end of a name."
components:
  wallet-card:
    backgroundColor: "{colors.enamel-plate}"
    textColor: "{colors.enamel-ink}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem 1rem"
    note: "card-plate from the repo DESIGN.md. Plate bevel shadow. Title is an h2 set in {typography.wallet-name}, not in the placard legend."
  wallet-card-locked:
    backgroundColor: "{colors.enamel-plate}"
    textColor: "{colors.enamel-ink}"
    note: "Name, lock-state legend, one body line, one Open key. Nothing derived from the Account or the Network (AD-26)."
  wallet-card-open:
    backgroundColor: "{colors.enamel-plate}"
    textColor: "{colors.enamel-ink}"
    note: "Adds one network row per view of the Seed: network word, stamp where one applies, address through AddressLink, Open and Remove keys."
  wallet-network-row:
    backgroundColor: "{colors.enamel-chassis}"
    textColor: "{colors.enamel-ink}"
    typography: "{typography.data}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
    note: "A recess, not a nested card: field-recess inset shadow from Elevation & Depth. Carries the address in the data face."
  wallet-lock-legend:
    textColor: "{colors.text-live-enamel}"
    typography: "{typography.legend}"
    gap: "0.375rem"
    note: "status-legend from the repo DESIGN.md. Open = lamp tone live + the word Open. Locked = lamp tone neutral + the word Locked."
  stamp-real-funds:
    backgroundColor: "{colors.lamp-caution-enamel}"
    textColor: "{colors.lamp-caution-enamel-legend}"
    typography: "{typography.legend}"
    rounded: "{rounded.sm}"
    note: "badge-stamp, warning variant, exactly as NetworkPlate renders it today. Text 'Real funds'. Devnet: 'Not stable'."
  header-wallets-key:
    backgroundColor: "{colors.enamel-plate}"
    textColor: "{colors.enamel-ink}"
    typography: "{typography.key}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    note: "button-outline, size default, with a leading arrow icon (aria-hidden) and the visible word 'Wallets'. 2.75rem under (pointer: coarse), supplied by the Button primitive."
  config-section:
    backgroundColor: "{colors.enamel-plate}"
    textColor: "{colors.enamel-ink}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem 1rem"
    note: "card-plate with a placard title (card-title-placard, h2). One concern per plate."
---

## Brand & Style

Nothing about the instrument changes. The chooser is a second *face* of the same panel: where the wallet shell is the measurement of one account, the chooser is the rack that holds several instruments. Each wallet is one engraved legend plate screwed to the chassis, in the repo's world (The Bench Panel; two real finishes; one reserved commit colour). This file specifies only the devices that did not exist: the wallet card in three states, the network row inside it, the per-wallet configuration plates, and the header's Wallets key.

The posture is "quiet rack". A locked card is deliberately the least informative plate on the panel (name only, by AD-26). An open card gains exactly the rows the lock has paid for. No card ever carries a balance, a chart, or a promotional line: the chooser makes no ledger read (EXPERIENCE.md, Component Patterns), so there is nothing live to display.

## Colors

No new tokens. Usage rules for existing ones, on the new devices:

- **Plate and chassis** — the card is `{colors.enamel-plate}` / `{colors.steel-plate}`; the network row recessed inside it is `{colors.enamel-chassis}` / `{colors.steel-chassis}`. Both finishes follow the repo rule that a plate is lighter than the ground it sits on.
- **Live Green** — only through `StatusLegend` (lamp plus word) for the word **Open**. Never a green card edge, never a green fill.
- **Caution Amber** — only the existing "Real funds" and "Not stable" stamps on the network row. A locked card carries no amber, because a locked card does not know its network (AD-26).
- **Commit Orange** — **never** on this screen. Nothing here moves funds. The Open key is the ordinary panel key; Add wallet is the ordinary panel key. The Reservation Rule is unchanged.
- **Alert Red** — only the `danger` treatment on Remove (plate ground, alert-red text and edge), and the saturated `destructive` fill only on the confirm key inside the remove dialog.

## Typography

Existing roles only, plus `{typography.wallet-name}` (above). Mapping:

| Element | Role |
|---|---|
| Chooser screen title (h1, "Wallets") | the TaskScreen title treatment already shipped: legend face, uppercase, tracked, `text-base`. Visible, not `sr-only` (see Components). |
| Wallet name (h2 on the card) | `{typography.wallet-name}` |
| Lock-state legend | `{typography.legend}` via `StatusLegend` |
| Network word ("Mainnet", "Testnet", "Devnet") | `{typography.legend}`, same as NetworkPlate |
| Address | `{typography.data}` through `AddressLink` |
| One-line card text, dialog text, errors | `{typography.body}` / `{typography.caption}` |
| Keys (Open, Rename, Lock, Remove, Wallets) | `{typography.key}` — uppercase by the primitive, therefore **no key label may contain a wallet name**; the name goes in `aria-label`/context, never in the visible legend |

The Barbell Rule holds: there is no readout on the chooser and none is added. The chooser has no panel-scale number.

## Layout & Spacing

- The chooser lives in the existing chassis (`ChassisShell`, `max-w-5xl`), content padding `1rem` horizontal as on every shell screen.
- Cards in a single column below `sm`, two columns from `sm` (`sm:grid-cols-2`), per the repo's content-grid rule. **Order is the stored order of the wallet list and never changes with state.** The Active wallet does not move to the top; a lock opening or closing does not move a card. This is the repo's "reading order is fixed at every width" rule applied to a list.
- Inside a card: header row (name left, lock-state legend right), optional Active legend under the name, body (locked line or network rows), action row. Gaps `{spacing.snug}` between actions, `{spacing.plate}` between regions. Action row wraps (keys may wrap their text, `min-h-11` on coarse pointers) rather than push the card wider than 320px, the same device `ROW_ACTION` uses in Settings today.
- Network rows are `{spacing.snug}` apart inside the card.
- The page footer of the chooser carries the **Add wallet** key (full width below `sm`) and the Settings key is in the header. No floating action button: the panel has nothing that floats.
- Per-wallet configuration is a `TaskScreen`-width plate column (`max-w-lg`), sections stacked at `{spacing.region}`. Not a tab strip.

## Elevation & Depth

Inherited. Card = plate bevel. Network row = field recess (earned inset, not a colour swap). Dialogs (rename, remove, reveal, Use on Mainnet) are the swung-out module, as today. No new shadow.

## Shapes

Machined `{rounded.md}` everywhere. The lamp disc inside `StatusLegend` is the only round element. The header Wallets key and every card key are ordinary keys: no pills, no avatar circles, no coloured initials. A wallet has no icon or avatar; its identity is its name (this is also why the name must be unmistakable).

## Components

### Wallet card (new)

One plate per **Seed** (see EXPERIENCE.md for why the unit is the Seed, with one network row per view). Anatomy, top to bottom:

1. **Header row** — wallet name (h2, `{typography.wallet-name}`, `break-words`), and at the opposite corner the lock-state legend (`StatusLegend`, lamp plus word, EXACTLY the shipped device).
2. **Active legend** (only on the Active wallet) — the word "Active" in `{typography.legend}`, muted ink, no lamp. In words, not colour; not repeated as a second lamp.
3. **Body** — varies by state:
   - *Locked:* one body-face line, "Locked.", muted ink.
   - *Open:* one **network row** per view of the Seed (below).
4. **Action row** — keys in a wrapping group labelled for assistive tech with the wallet name: **Open** (default key, locked cards only; on open cards each network row owns its own Open), **Configure** (outline; open cards only), **Rename** (outline), **Lock** (outline; open cards whose lock has an Open Check only), **Remove** (`danger`).

State appearance:

| State | Lamp + word | Body | Keys present |
|---|---|---|---|
| Locked | neutral lamp, "Locked" | "Locked." | Open, Rename, Remove (`aria-disabled`, reason in visible text) |
| Open | live lamp, "Open" | network rows | per row: Open, Remove. Card: Configure, Rename, Lock (if the lock has an Open Check) |
| Active (modifier on either) | unchanged | unchanged | adds the "Active" legend; adds `aria-current="true"` to that wallet's Open key |

The neutral lamp is an *unlit* disc with its word beside it; the word is never optional (Lamp-Plus-Word Rule). Locked is therefore recognisable without colour.

### Network row (new, inside an open card)

A recess in `{colors.enamel-chassis}`: network word and stamp (left), address via `AddressLink` in `{typography.data}` (below the word), then the row's keys. Mainnet row: word "Mainnet" + `stamp-real-funds` ("Real funds"). Devnet row: word + stamp "Not stable" and the existing Devnet notice sentence below the row as visible text (`DEVNET_NOTICE`). Testnet row: word only. The network word is on **every** row, so a Mainnet row is distinguishable from a Testnet row by words in the same position, not by the presence of colour. Stamp and word keep their position in the row regardless of state.

### Header Wallets key (new)

In the shell header, replacing the Active wallet `Select` picker (see EXPERIENCE.md, Information Architecture). Outline key, left of the header's control cluster, leading arrow icon `aria-hidden`, visible legend "Wallets". Below `sm` the header's existing wrap rule applies: the controls take their own full-width row rather than compressing. Header cluster inside a wallet, left to right: **Wallets** key, wallet name (`{typography.wallet-name}`, wraps), `NetworkPlate`, **Configure** icon key, **Lock** icon key. The nameplate "XRPL Bench" stays the maker's mark (never the heading). Icon keys are 2.25rem square, 2.75rem on coarse pointers, each with an `aria-label`.

### Per-wallet configuration sections (new composition of existing parts)

A routed screen, composed of `config-section` plates under a `TaskScreen` title. Each plate is one concern; the existing components are moved, not redrawn: `ControlledNote`, `MasterKeyControl`, `TwoDeviceSign`, `WalletNodeSection`, the Use-on-network keys, Edit checks, Reveal seed. Plates, in fixed order:

1. **Checks** — read-only summary of this wallet's Open Check and Signing Check (words as the Edit-checks screen uses them), the **auto-lock** setting (this lock's minutes, edited through Edit checks, which asks the lock's Open Check), then the **Edit checks** key (outline). Auto-lock lives here, not in Settings (owner decision).
2. **Seed** — one sentence and the **Reveal seed** key (outline). Not `danger`: revealing is guarded by a confirm dialog whose confirm key is the `destructive` fill, per the Reservation Rule.
3. **Operating another account** — `ControlledNote` (when it applies), the **Let another wallet sign** key (when the wallet holds the Account Master Key), `MasterKeyControl`.
4. **Other networks** — one **Use on {Network}** key per network this Seed has no view on; when none remain, one body line saying so.
5. **Node** — `WalletNodeSection`.
6. **Two-device signing** — `TwoDeviceSign`.

A plate whose content does not apply to this wallet is **omitted only when the feature cannot exist for it at all** (e.g. the Let another wallet sign key on a wallet that does not hold the Account Master Key, as in Settings today). Where a control is merely unavailable *for now*, it renders `aria-disabled` with its reason in visible text (repo decisions §6.4).

## Do's and Don'ts

| Do | Don't |
|---|---|
| Give a locked card its lock-state word beside an unlit lamp | Signal "locked" by greying the card or dimming its text |
| Put the network word on every open network row, and the "Real funds" stamp beside it on Mainnet | Carry Mainnet by amber alone, by a coloured edge, or by card order |
| Keep card order fixed to the stored order | Move the Active card to the top, or sort by state |
| Set the wallet name in `{typography.wallet-name}`, sentence case as typed | Put a user-authored name in the uppercase placard legend or in a key legend |
| Keep every key on the card an ordinary key; `danger` on Remove only | Use commit orange anywhere on the chooser or the configuration screen |
| Render Remove `aria-disabled` with a visible reason on a locked card | Hide Remove on a locked card, or put the reason in a tooltip |
| Let the configuration screen be plates, one concern each | Turn configuration into a second tab strip or a wizard |
| Move existing components unchanged | Restyle `MasterKeyControl`, `WalletNodeSection` or `TwoDeviceSign` as a side effect |
| Leave the browser's focus ring alone on every new control | Style `:focus`/`:focus-visible` or write `outline-none` |
