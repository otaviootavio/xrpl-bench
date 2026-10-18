---
id: SPEC-mobile-dialogs
companions:
  - issue-map.md
  - ../../../DESIGN.md
  - ../../../docs/agents/verifying-your-work.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Mobile Dialogs and Task Screens

UI change against `origin/dev` e07fd9a. Source: Impeccable audit (12/20) and critique. Issue numbers 1–19 and their P-severities are traceable IDs; `issue-map.md` holds the full table.

## Why

A pain. Users on phones find dialogs hard to see and use: `DialogContent` (`src/components/ui/dialog.tsx`) is one centred, translate-positioned, scroll-inside box used for confirms and multi-step tasks alike. It suits confirms and fails tasks — the primary action sits 300–1000px below the fold at 320×568, the keyboard can hide submit, iOS zooms on 13px fields, and Back leaves the app. The wallet holds real Mainnet funds, so the dangerous-action flows (master key off) also need stronger design.

## Capabilities

Each CAP is one build slice, shipped in order S1→S5. Dialog verdicts are decisions, not options:
- **Screen:** Add wallet (reuse onboarding `CreateWalletFlow` as a route), Edit checks, Sign with two devices, Let another wallet sign.
- **Bottom sheet on mobile:** App PIN prompt, master-key on/off, import warning, Add trust line, Edit trust line limit, Send review.
- **Stays a dialog:** Reset this device, Reveal seed confirm, Wallet seed display, Remove wallet, Remove all wallets, Close trust line.

- **CAP-1** (S1; issues 3, 8, 11, 12)
  - **intent:** `dialog.tsx` offers a mobile bottom-sheet variant with a sticky footer, so a sheet's title, close and commit action stay reachable.
  - **success:** At 320×568 and 375×667, with the on-screen keyboard open, each sheet's title, close and submit are visible without scrolling the page; the sheet uses `dvh` and safe-area insets; scrolling content shows a visible cue; opening the PIN prompt never leaves a confirm open beneath it; Send review's commit button is visible without scrolling.
- **CAP-2** (S2; issues 1, 2, 10)
  - **intent:** Add wallet, Edit checks, Sign with two devices and Let another wallet sign are routed screens, not dialogs.
  - **success:** At 320×568 and at 200% text zoom, each screen's primary action is reachable within one scroll of the form it submits (no ~3-screen scroll to Save); the two-device role buttons wrap and cause no horizontal overflow at 320 and 375px; Add wallet and onboarding render the same `CreateWalletFlow`.
- **CAP-3** (S3; issues 4, 6, 13)
  - **intent:** On coarse pointers, text controls are legible without zoom and every control is tappable.
  - **success:** Inputs and buttons compute to ≥16px on coarse pointers (no iOS focus zoom) and viewport zoom is never disabled; close buttons, buttons and radios have ≥44px hit areas; dialog field labels are not 11px.
- **CAP-4** (S4; issues 5, 7, 9)
  - **intent:** Opening and leaving a dialog, sheet or screen never loses the user's place or their typed work.
  - **success:** Closing any of the 11 dialogs/sheets returns focus to the control that opened it; browser/hardware Back closes the open overlay (or screen) and does not leave the app; a tap outside a working overlay does not dismiss it or discard typed state; confirms with nothing typed may still dismiss on outside tap.
- **CAP-5** (S5; issue 14)
  - **intent:** Turning the master key off reads and behaves as the destructive act it is.
  - **success:** The action uses the destructive button style, shows an alert plate with the Regular Key address, and on Mainnet requires a typed acknowledgement before it can commit.
- **CAP-6** (S5; issue 15)
  - **intent:** Create-wallet asks first what matters, then offers the rest on request.
  - **success:** The flow opens with Network and Seed Method only, then a Recommended summary; Node, Signature type and Auto-lock sit under Customise and keep their pre-selected answers; no step shows ~20 radios at once; the flow passes the existing create-wallet-flow tests or their updated equivalents.
- **CAP-7** (S5; issues 16, 17, 18)
  - **intent:** New screens speak the panel vocabulary, and Settings shows a clear action hierarchy.
  - **success:** The new screens use the shared radio/select primitives and `font-legend` uppercase short legends (no native radios, raw `<select>`, plain `h2`, or sentence-case legends; status legends are a word or two, not capitalised sentences); the Settings wallet row has one primary action with the rest grouped; "Use on Mainnet" is not a single-click action; "Remove all wallets…" fits within 320px.
- **CAP-8** (S5; issue 19)
  - **intent:** No `:focus` styling remains unless a documented exception covers it.
  - **success:** `select.tsx:79` no longer uses `focus:` (uses the primitive's highlighted-state attribute instead); the skip link's `focus:` use is limited to reveal, with the documented exception above; a repo grep for `focus:` and `outline-none` shows only documented exceptions.

## Constraints

- No secret enters state, storage, URL or history state — including any history entry added for Back handling.
- Money stays strings/`BigInt`; never `Number()` a drops value.
- Nothing styles `:focus` or `:focus-visible`; `outline-none` is banned.
- `bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast` stay green after every slice.
- Viewport zoom is never disabled; coarse-pointer sizing is responsive behaviour inside the primitive, not at call sites (DESIGN.md).
- A slice is done only after a real-browser pass with screenshots opened, recorded in its Verification section, per `docs/agents/verifying-your-work.md`.
- Slices ship one per build in order S1→S5; S2 depends on S1's primitives.

## Non-goals

- No new wallet features, exchange/custodial features, or changes to signing, key, or Check logic.
- Not redesigning confirms that stay dialogs beyond CAP-3/CAP-4 behaviour.
- No desktop layout redesign; the centred dialog remains on non-mobile.
- No change to the passkey-signing contract (`spec-passkey-signing`).

## Success signal

On a 320×568 phone, a user can add a wallet, edit checks, sign with two devices and approve a send without horizontal scrolling, zooming, a hidden submit button, or losing typed input to a stray tap or Back — and the manual checks below pass on real iOS and Android.

## Manual checks (not verified by the audit)

- Real iOS Safari and Android Chrome: keyboard vs sheet/title/close/submit (issue 3), focus zoom (4), safe-area and `dvh` (11), hardware Back (7).
- Passkey flows through the new Add wallet, Edit checks and signing screens.
- Camera QR scanner inside the moved/changed flows.

## Assumptions

- "Mobile" means coarse pointer and/or narrow viewport; the sheet-vs-dialog breakpoint follows the existing responsive tokens (input does not give one).
- Back handling uses history entries carrying no secret or form data.

## Decisions (resolved from former open questions)

- **Skip link (issue 19):** keep it. Document one exception in `decisions.md` and DESIGN.md: the skip link may use `focus:` classes to reveal itself (position/visibility only), never to draw a ring or outline. Reason: a skip link cannot reveal on focus without the pseudo-class; the ban targets focus indicators.
- **Send review (issue 12):** the sheet closes when the passkey/PIN signing prompt opens, so exactly one overlay is open at a time. Signing step stays its own overlay.
- **"Recommended" (CAP-6):** the pre-selected answers in `spec-passkey-signing/check-rules.md` (Testnet, Stored Seed, Ed25519, passkey if PRF else App PIN, 5 min auto-lock). On Mainnet, Signing Check is passkey if PRF else App PIN, and Open Check/auto-lock floors apply.
- **Add wallet route:** `/wallets/new`, rendering the same `CreateWalletFlow` as onboarding; only the exit path differs (onboarding continues to the app, Settings returns to Settings). Adapt the name if the router has a convention.
