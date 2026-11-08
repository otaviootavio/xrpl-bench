---
title: 'Wallet kind on the record and the chooser card'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: '777ad0585193d78b70240309090f06ff987fc552'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-offline-signing/SPEC.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Wallet has no kind, so the app cannot tell an Online Wallet from an Offline or Transmitter Wallet, and every later offline signing story needs that base (CAP-1, OS-FR-1).

**Approach:** Add one kind to every Wallet record (absent reads as Online, no migration), show it in words as the first stamp on the chooser card's Network row and in the Local settings heading, and open each kind into its own screen set, chosen above every ledger hook.

**Owner decision (2026-11-08):** P-3, P-4, P-5 and P-62 in the UX EXPERIENCE.md are approved as written. Every other P-n stays a draft and is not shipped.

## Boundaries & Constraints

**Always:** Kind words are exactly Online / Offline / Transmitter in an `outline` Badge (kind-stamp), never a colour or lamp. Screen labels and titles are P-62 and P-3 verbatim, from one strings module with a test. An Offline Wallet mounts no ledger hook and never asks the pool for a client. A record with an unknown `kind` value is not shown (never read as Online). The selector's column layout stays inside `TabsList` (decisions §6.13).

**Never:** No draft string (P-1, P-42, P-45, P-48, P-49, P-56 …) and no filler such as "coming soon": a screen not built yet shows its approved title only. No creation path for Offline or Transmitter Wallets (stories 3, 4). No Was-online field or stamp (story 5). No Synced Transmitter screens or sync field (story 4). No "Wallet kind" plate or change key (story 5). Online Wallet screens unchanged.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Existing record | view without `kind` | `WalletMeta.kind === 'online'`, today's six tabs | N/A |
| Offline record | view `kind: 'offline'` | card `[Offline] TESTNET`, address link; open shows New transaction · Sign · Receive · Signed · Local settings | no ledger hook, no client |
| Transmitter record | view `kind: 'transmitter'` | card `[Transmitter] TESTNET`, "Not synced" in the address row; open shows Transmit · Local settings | no ledger hook |
| Unknown kind | view `kind: 'hot'` | Wallet not listed | fail closed |
| Locked card | any kind, lock closed | name, kind stamp, Network still shown | N/A |
| Task route on non-Online | `/wallets/:id/two-device` or `/control` | reset to the wallet shell | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/crypto/db.ts` -- `WalletView`: add optional `kind?: 'offline' | 'transmitter'`; export `WalletKind`. `isCompleteStoredWallet` unchanged.
- `src/lib/crypto/keystore.ts` -- `WalletMeta.kind`; `toMetas` maps absent → `'online'`, drops a view with an unknown value.
- `src/store/wallet-groups.ts` -- `LockedCard.kind` (explicit-fields locked branch too); rewrite the "five things" comment citing the UX owner ruling of 2026-11-08.
- `src/components/wallet/WalletCard.tsx` -- kind stamp first in the Network row; Transmitter address row = P-5.
- `src/components/ui/tabs.tsx` -- nav variant gains a `count` (6 default, 5, 2) per EXPERIENCE "Screens by type".
- `src/pages/Main.tsx` -- `Main` switches on kind into `OnlineWallet` (today's `OpenWallet`, unchanged), `OfflineWallet`, `TransmitterWallet`.
- `src/pages/WalletScreens.tsx` -- `two-device` and `control` reset unless kind is Online.
- `src/pages/tabs/WalletTab.tsx` -- kind stamp in the heading row; per-kind plate list (Offline: This wallet, Name, Address Book, Checks, Seed, Remove; Transmitter: This wallet with P-5 and no key rows, Name, Address Book, Checks without the signing row and Edit checks key, Node, Remove).
- New `src/lib/wallet-kind-words.ts` -- kind words, P-3, P-5, P-62 labels/titles.
- New `src/pages/kind/` panels -- Offline Receive (reuse `AddressDisplay` + `QrCode`, NOT `ReceiveTab`), title-only panels for the rest.
- Reference test: `src/__tests__/locked-no-ledger-request.test.tsx` (pattern for the Offline no-read test).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/crypto/db.ts`, `keystore.ts` -- kind on the view and meta -- the base (OS-FR-1)
- [x] `src/store/wallet-groups.ts`, `WalletCard.tsx` -- card stamp and P-5 -- kind in words
- [x] `src/lib/wallet-kind-words.ts` + test -- approved words, one place
- [x] `src/components/ui/tabs.tsx` -- count variant -- 5 and 2 layouts
- [x] `src/pages/Main.tsx`, new kind panels, `WalletScreens.tsx`, `WalletTab.tsx` -- per-kind screens
- [x] Tests (cite OS-FR-1): keystore kind mapping incl. unknown; cards locked/open per kind; Offline open wallet issues no client call and mounts no live hook; Transmitter shows two tabs; per-kind Local settings plates; non-Online task route resets

**Acceptance Criteria:**
- Given an existing record, when the app loads, then nothing is written and it behaves exactly as today.
- Given an Offline or Transmitter Wallet, when it is opened, then only its own screen set renders, and an Offline one never requests a ledger client.
- Given any width from 320px to desktop and either theme, when a 5- or 2-screen selector shows, then every key is visible without scroll or overprint.

## Implementation Notes

- `WalletView.kind` stores only `offline` / `transmitter`; `toMetas` reads absent as `online` and drops any other value, a stored literal `'online'` included (fail closed). `viewsOf`/`hasView` are unchanged, so a hidden view still counts for the same-address refusal. Every view writer spreads the view, so a rename or Node change keeps the kind (tested).
- "Reset to the wallet shell" needed a new `resetToWalletShell(walletId)` in `src/lib/route.ts` (not in the Code Map): `resetToHome()` lands on the chooser.
- Strings: the Offline Sign key is `signFromTransmitter` in `wallet-kind-words.ts`, because `check-write-choke-point` flags any `.sign` member access.
- 5-key selector below `sm`: thirds that grow, with `min-w-fit`. "New transaction" is wider than a third at 320px, so the five keys lay out 2 + 2 + 1 at 320px and 2 + 3 at 390px. Every key is visible, nothing scrolls, nothing overprints (measured), but it is not a strict three-column grid at those widths.
- Not-built screens (New transaction, Sign, Signed, Transmit) show their approved title as a visible placard h1 in a plate; the Online tabs keep their hidden h1.

## Spec Change Log

## Review Triage Log

Pass 1 (blind, edge-case, verification-gap, UI/mobile layers).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | A Transmitter reaches Edit checks by URL (`kindHasScreen` admits `edit-checks` for every kind); it offers Signing Check choices for a keyless Wallet | medium | `WalletScreens.tsx` `kindHasScreen`; `EditChecksScreen` renders the signing choices | patch |
| 2 | No test of an Offline Wallet's Edit checks round trip (KindShell's own tab state and focus return) | low | only `offline: Edit checks stays reachable`, which never leaves the screen | patch |
| 3 | `tabs.tsx`: NAV_LAYOUT inserted between TabsList's JSDoc and TabsList; 5-count comment says three columns, measured 2+2+1 / 2+3 | low | diff placement; Implementation Notes measurements | patch |
| 4 | Kind switches in `Main` / `KindPlates` have no exhaustive default; a fourth kind renders nothing silently | low | no `noImplicitReturns` in tsconfig; React accepts `undefined` | patch |
| 5 | Story file Tests task unticked | low | bookkeeping | fixed in the story file |
| 6 | Hidden unknown-kind view: remove body says the Seed goes while the record stays; PIN kept; same-address import refused for an invisible Wallet | low | real in code, but no build of the app writes an unknown kind; a fix adds branches to removal | rejected (low, unlikely, non-trivial fix) |
| 7 | Operate another account offers Offline/Transmitter Wallets as targets | low | `eligibleTargets` has no kind filter; unreachable until story 3, screen removed in story 12, and OS-FR-21 trusts any Regular Key | defer |
| 8 | Remove dialog for a Transmitter speaks of an encrypted Seed | low | `removeBodyFor` has no kind branch; a Transmitter record without a Seed arrives in story 4 and its words need an approved P-n | defer |
| 9 | Kind is per view while key material is per Seed record: mixed-kind Seeds possible | maybe-false (medium if true) | kind per Wallet matches the glossary; whether one Seed may hold Online and Offline Wallets is for stories 3 and 5 | defer |
| 10 | 200% text not checked for the 5-key selector | gap | Verification says not captured | covered in the orchestrator's browser pass |
| 11 | Words test reads EXPERIENCE.md by a relative path | false | repo tests read files relative to the root (`coarse-pointer.test.tsx`, `add-wallet-import.test.tsx`); vitest runs from the root | rejected |
| 12 | Offline Receive does not show the Network | false | EXPERIENCE "Screens by type": Receive shows only the address and its QR | rejected |
| 13 | `resetToWalletShell` has no direct unit test | low | covered by the App-level reset tests; trivial body | rejected |
| 14 | No focus target after a kind-reset redirect | low | reachable only by a typed URL; adds focus logic | rejected |
| 15 | Visible h1 on new screens departs from DESIGN.md's hidden-h1 rule | low | deliberate, recorded in Implementation Notes: a title-only panel would be blank | rejected |

## Design Notes

Offline and Transmitter records cannot be made in the UI until stories 3 and 4. The browser pass makes a throwaway Testnet wallet, then sets the view's `kind` in IndexedDB with `page.evaluate`, and names that forced state.

## Verification

**Commands:**
- `bun run lint` · `bun run build` · `bun run test` · `bun run check:contrast` -- all green

**Manual checks:**
- Real-browser pass: Online, Offline, Transmitter cards (locked and open) and each kind's screens at 320/390/1280 px, light and dark; screenshots opened and recorded here.

**Result (2026-11-08):** working tree on `feat/offline-signing-1-wallet-kind` over `777ad05` (uncommitted), `bun run dev --port 5176`, Playwright Chromium in a fresh browser context with a CDP virtual authenticator (PRF). Gates: lint, build, test (133 files, 1987 tests), check:contrast all green.

Forced state: one throwaway Testnet wallet "Kind test" was made with the quiz (Stored Seed, passkey Open Check). Its record was then cloned in IndexedDB by `page.evaluate` into "Savings (offline)" (`views[0].kind = 'offline'`) and "Savings (send)" (`'transmitter'`), and a fourth clone with `kind: 'hot'`. All share one lock. Not funded: no screen in this story reads the ledger.

| Criterion | Result |
|---|---|
| Existing record reads as Online, nothing written | Met. Unit test compares the stored record before and after `listWallets`; the browser card shows `[Online] TESTNET`. |
| Unknown kind not listed | Met. The `hot` clone does not appear on the chooser. |
| Cards, open and locked | Met. `[Online]` / `[Offline]` / `[Transmitter]` outline stamp first in the Network row; Transmitter shows "Not synced" with no address; locked cards keep name, kind, Network (390 light/dark). |
| Offline opens its own five screens, no ledger client | Met. Tabs New transaction · Sign · Receive · Signed · Local settings; Receive shows address and QR only; across all 12 width/theme loops the page opened no WebSocket but Vite's HMR socket. |
| Transmitter opens two screens | Met. Transmit · Local settings; Local settings shows This wallet = "Not synced", Checks with no signing row and no Edit checks, Node, no Seed. |
| Online task route on Offline resets to the shell | Met. `/wallets/<id>-off/two-device` came back to `/wallets/<id>-off` with the Offline tabs; also pinned by unit tests for both kinds and both routes. |
| 5- and 2-key selector, 320 to 1280, both themes | Met. Per trigger: inside the list, not clipped, no overlap; list `scrollWidth === clientWidth`; document no horizontal scroll. 320: 2+2+1; 390: 2+3; 1280: five columns. Two keys: halves at every width. |

Not captured in the browser: the Online wallet's Local settings heading with its `[Online]` stamp (covered by `wallet-kind-screens.test.tsx` only), and 200% text zoom. Screenshots opened: chooser open 320 light, chooser locked 390 dark, Offline New transaction 320 light, Offline Receive 320 dark, Offline Local settings 320 light and 1280 dark, Offline Sign 1280 dark, Transmitter Local settings 390 dark. Files are in the session scratchpad (`.../scratchpad/kind/`), not in the repo.

**Orchestrator pass after the review patches (2026-11-08).** Working tree over `777ad05` with the four review patches. Gates green: lint, build, test (133 files, 1989 tests), check:contrast. `bun run dev --port 5177`, Playwright Chromium, a fresh browser context with a CDP virtual authenticator (ctap2, internal, UV, PRF). The same forced state as above: one Testnet wallet "My Wallet" made with the quiz, then cloned in IndexedDB into "Savings offline" (`offline`), "Daily transmitter" (`transmitter`) and "Hidden hot" (`hot`). Not funded.

| Check | Result |
|---|---|
| Cards, open (320 light) and locked | Met. `ONLINE` / `TRANSMITTER` / `OFFLINE` outline stamp before `TESTNET`; Transmitter "Not synced", no address; "Hidden hot" not listed; locked cards keep name, kind, Network. |
| Offline issues no ledger connection | Met. In all six width/theme rounds, opening the Offline Wallet and visiting New transaction, Receive and Local settings opened no WebSocket. The only ledger socket in the run (`wss://s.altnet.rippletest.net`) came from the Online wallet. |
| Selector, 5 and 2 keys, 320/390/1280, light and dark | Met. Every key inside the list, none clipped, none overlapping, no list or page side scroll. 5 keys: 2+2+1 at 320, 2+3 at 390, 5 at 1280. 2 keys: one row at every width. |
| 5-key selector at 200% text, 320 | Met. 1+2+1+1 rows, nothing clipped or overlapping, no side scroll (root font size 200%). |
| Online Local settings heading | Met. "Local settings / My Wallet" then `ONLINE` stamp and `TESTNET` (all widths, both themes). |
| Transmitter `/checks` (review patch 1) | Met. A history entry to `/wallets/<id>-tx/checks` came back to `/wallets/<id>-tx` with Transmit · Local settings and no Edit checks heading. |
| Transmitter Local settings | Met. This wallet "Not synced", Name, Address Book, Checks (Open Check and auto-lock only), Node, Remove; no Seed. |

Screenshots opened: `chooser-320-light`, `offline-newtx-320-zoom200-light`, `offline-receive-390-dark`, `transmitter-settings-320-dark`, `online-settings-1280-dark`, `offline-newtx-1280-light` (session scratchpad `pass2/`, not in the repo).
