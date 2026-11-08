---
name: XRPL Bench — Offline Signing (delta)
description: Visual delta for Wallet kinds, the Transmitter Wallet, the two QR routes, the Transmit step and the key warnings. Inherits the repo-root DESIGN.md (The Bench Panel) and the 2026-10-19 chooser delta in full; adds no colour, face or radius token.
status: final
updated: 2026-11-07
inherits:
  - DESIGN.md (repo root)
  - _bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/DESIGN.md
contract: _bmad-output/specs/spec-offline-signing/SPEC.md
# No new colour tokens. Every {colors.*} below is defined in the repo-root
# DESIGN.md, so `bun run check:contrast` gains no pairs from this delta. If a
# build adds a token, it adds the token's pairs in the same change
# (Measured-Not-Judged Rule).
typography:
  # One composed role. It is the readout face, used for one word: the Network
  # the offline device signs for. It is not a second readout tier; it IS the
  # screen's one readout (Barbell Rule kept).
  signing-network:
    fontFamily: "{typography.readout.fontFamily}"
    fontSize: "{typography.readout.fontSize}"
    fontWeight: 500
    lineHeight: 1.02
    letterSpacing: "-0.035em"
    note: "Network label exactly as NETWORKS[n].label (Mainnet / Testnet / Devnet). No text-transform."
components:
  kind-stamp:
    backgroundColor: "transparent"
    textColor: "{colors.enamel-ink}"
    typography: "{typography.legend}"
    rounded: "{rounded.sm}"
    padding: "1px 0.375rem"
    note: "Badge variant `outline`: control-edge border, ink legend. Words: Online / Offline / Transmitter. A fixed label, so a stamp, never a lamp."
  was-online-stamp:
    backgroundColor: "{colors.lamp-caution-enamel}"
    textColor: "{colors.lamp-caution-enamel-legend}"
    typography: "{typography.legend}"
    rounded: "{rounded.sm}"
    padding: "1px 0.375rem"
    note: "Badge variant `warning` (the 'Real funds' pair). Words: Was online. Always followed by its one sentence in caption text; the stamp never stands alone."
  signing-network-well:
    backgroundColor: "{colors.enamel-readout}"
    textColor: "{colors.enamel-readout-ink}"
    typography: "{typography.signing-network}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem 1rem"
    note: "readout-well. Line 1 'You are signing for' in {typography.mark} on {colors.enamel-readout-muted}; line 2 the Network in {typography.signing-network}. One accessible string."
  qr-handoff-plate:
    backgroundColor: "{colors.enamel-plate}"
    textColor: "{colors.enamel-ink}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem 1rem"
    note: "card-plate holding: placard title, Network stamp row, the white QR plate (QrCode, bg-white, unchanged), the scan count caption, and the plate's lines."
  scan-plate:
    backgroundColor: "{colors.enamel-plate}"
    textColor: "{colors.enamel-ink}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem 1rem"
    note: "card-plate holding QrScanner (camera key and paste field, unchanged) and a line naming what is expected."
  tx-field-list:
    typography: "{typography.data}"
    textColor: "{colors.enamel-ink}"
    note: "dl inside a plate. Term in {typography.legend} muted; value in {typography.data}. One row per field and flag, in words."
  consequence-block:
    typography: "{typography.body}"
    note: "A plate: plain lines as a list in body text, each WARNING line as an inline Alert (caution) with its own acknowledgement checkbox below it."
  earlier-signing-record:
    backgroundColor: "{colors.enamel-recess}"
    typography: "{typography.data}"
    rounded: "{rounded.md}"
    note: "A recessed dl (field-recess shadow) inside the retry plate: Sequence, transaction hash, LastLedgerSequence, time signed."
---

# XRPL Bench — Offline Signing, Visual Delta

> Delta. The repo-root `DESIGN.md` is the visual system and stays authoritative;
> nothing here overrides it. This file names the few new devices the offline
> signing screens need, all composed from existing tokens. Where a mock in
> `mockups/` disagrees with this file or with `EXPERIENCE.md`, the spines win.

## Brand & Style

Unchanged: The Bench Panel. The feature adds a second instrument to the bench.
An offline phone and an online phone sit side by side, and every screen on each
says which instrument it is and which Network both are set to. The round is
deliberate (OS-SM-C1). The screens are not made quicker by dropping a confirm,
and nothing on them is decorative.

## Colors

No new token. Three rationing decisions, all owner-confirmed on 2026-11-07:

- **Commit orange is spent only where funds leave.** That is the Transmitter
  Wallet's **Send** key at the Transmit step. It shows every round, after the
  checks, and the scan never sends by itself. It is also on the "Send it to
  the ledger?" key when "Show the signed transaction before sending" is on. On
  an Online Wallet with the setting off, it stays where it is today: the Send
  dialog's confirm. The offline **Sign** key is a `default` key. It makes a
  valid blob but sends nothing. All of this was decided by the owner on
  2026-11-07 (memlog). There is still one commit key per screen, never two.
- **Wallet kind is not a colour.** The kind stamp is the neutral `outline`
  badge with the kind's word. Online, Offline and Transmitter look the same
  except for the word.
- **"Was online" is a caution stamp.** It uses the existing `warning` fill pair,
  the one "Real funds" already uses, and always has its sentence beside it.

Refusals use the alert tone. Warnings, including W1–W5, the risky-field
warnings and the consequence-text WARNING lines, use the caution tone. Both are
the existing inline `Alert`, and the tone word is in the lit legend.

## Typography

One composed role, **signing-network**. It is the readout face set on one
word, the Network. It appears in exactly one place: the offline review before
the Signing Check, on both routes. There the Network **is** the screen's
readout, and the amount and fee move into the field list below the well. The
Barbell Rule holds: one panel-scale reading per screen, and no mid-size
heading.

The fixed string "You are signing for Mainnet" is one accessible string. It is
typeset on two lines: "You are signing for" in the mark face, muted, then the
Network in the readout face. No `text-transform`, so the words are those
approved.

Addresses, hashes, Sequences, ledger indexes, fees and amounts on every new
screen use the data face, as everywhere else.

## Layout & Spacing

Inherited ladder; no new spacing token.

- **Every route screen is a task screen** (`TaskScreen`) inside the wallet
  chassis: one column, `max-w-lg`, the plates stacked in reading order. The
  same order at 320px and on a desk.
- **A QR plate puts the code first in its plate**, under the title and Network
  row, centred, drawn at `qrDrawSize()`. Explanatory lines go under the code,
  never beside it, so the code stays large at 320px.
- **The two devices are separate screens.** The side-by-side frames in
  `mockups/` are for review only. No screen depends on the other being visible.

## Elevation & Depth

No new shadow. The earlier-signing record is a recessed list (field recess),
because it is a record held on the device, not a control. The signing-network
well uses the existing well recess.

## Shapes

Inherited. The machined 0.125rem radius applies to every new plate, stamp and
QR frame. The QR's white plate keeps its square corners.

## Components

- **Kind stamp** (`{components.kind-stamp}`). On the chooser card's Network row,
  first, before the Network label: `[Offline] MAINNET [Real funds]`. Also in the
  Local settings heading row. Wraps; never truncated.
- **Was-online stamp** (`{components.was-online-stamp}`). After the kind stamp
  on an Offline card, and at the top of the "Wallet kind" plate in Local
  settings, each with its one sentence in caption text (OS-FR-7).
- **Signing-network well** (`{components.signing-network-well}`). The readout
  well, legend "Network" top left, no lamp: the offline device cannot know a
  live state. Below the well's hairline rule, as scale marks: the window (P-13)
  and the valid-until ledger (P-51). The values are in the data face.
- **QR hand-off plate** (`{components.qr-handoff-plate}`). Title (the payload's
  name), a row with the Network label and its stamp, the code, the scan count
  caption ("Scan 1 of 3"), then the lines. On the signed plate the lines are
  the not-sent and valid-until lines (OS-FR-11).
- **Scan plate** (`{components.scan-plate}`). Today's `QrScanner` (camera key,
  paste fallback), with one line naming the payload it accepts. What it
  rejects is an inline error Alert under it. The scanner stays mounted, so a
  second try needs no extra press.
- **Transaction field list** (`{components.tx-field-list}`). One row per field
  and per flag. A risky row carries an inline caution Alert directly under it,
  inside the list. A refused row stops the list and shows the refusal Alert in
  its place. Nothing after it is shown as signable.
- **Consequence block** (`{components.consequence-block}`). Texts A–E. Plain
  lines are a bulleted list in body text. Each WARNING line is its own caution
  Alert, and the acknowledgement checkbox (P-6 in EXPERIENCE.md) follows it when the spec
  requires an acknowledgement. Text C's three steps are an ordered list. The
  words are copied from `consequence-texts.md`: no reflow into other
  sentences, no summary line in their place.
- **Earlier-signing record** (`{components.earlier-signing-record}`). Recessed
  dl with the P-52 terms: Sequence, the transaction hash (full, wrapping, data
  face), the valid-until ledger and the time signed (local time).
- **Keys.** Inherited variants. `commit` per §Colors. "Change to an online
  wallet" and "Turn off the master key" open their confirm with a `danger`
  key. Each opens a task screen, not a dialog. The typed phrase field sits
  inline, and the final key stays `aria-disabled` until the phrase is typed.
  It is the existing master-key pattern moved onto the task screen. The
  Signing Check follows. "Change to an offline wallet" uses an `outline` key
  and a plain confirm on its task screen.
- **Other new plates** (Delegates, Key state, Synced address, Before sending,
  Signed by this wallet, the Transmitter's check results) are a plain
  `card-plate` with a `dl` under the root rules. They have no device of their
  own. A plate title never holds an address: the address is a `dl` row in the
  data face.

## Do's and Don'ts

### Do:

- **Do** show the Network on every route screen of both devices: a Network row
  on every QR and scan plate, and the signing-network well before signing.
- **Do** put the kind in words on every card and in every Local settings
  heading.
- **Do** keep each WARNING line of an approved text as its own caution Alert,
  with the "WARNING:" words kept inside its body.
- **Do** spend commit orange on a send key only.

### Don't:

- **Don't** colour-code Wallet kinds, and don't use a lamp for a kind. A kind
  is a fixed label.
- **Don't** render, on an Offline Wallet, a value that the online screen
  *reads* (balance, spendable, a trust-line list, the fee estimate). In its
  place the offline screen shows P-1. Values that arrived in Data to Sign or
  an Unsigned Transaction (Sequence, Fee, LastLedgerSequence) are shown as
  numbers on the signing review.
- **Don't** put a second panel-scale number on the signing review. The Network
  is its readout.
- **Don't** place the QR code beside text at any width.
- **Don't** reword, shorten or merge any approved string, and don't change its
  characters in the DOM. The inherited key legend and placard may set it in
  uppercase by CSS `text-transform`, because that face is the system's. An
  approved string longer than a key legend or title, such as a sentence in a
  text block or an Alert body, is never uppercased.
