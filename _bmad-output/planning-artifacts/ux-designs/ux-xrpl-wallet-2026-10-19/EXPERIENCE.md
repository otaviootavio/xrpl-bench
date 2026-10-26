---
name: XRPL Wallet — Wallet Chooser and Per-Wallet Configuration
status: adopted
updated: 2026-10-19
sources:
  - _bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/.memlog.md   # owner decisions, authoritative
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md            # glossary, FR-65, FR-66, FR-12
  - docs/decisions.md                                                                 # §3, §4, §6.4, §6.7, §13
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-passkey-signing-2026-10-10/ARCHITECTURE-SPINE.md   # AD-21, AD-26
inherits: DESIGN.md (this folder, the visual delta), DESIGN.md (repo root), CLAUDE.md, docs/agents/INDEX.md, docs/agents/ui-and-design-system.md
---

# XRPL Wallet — Chooser Delta, Experience Spine

> Delta spine. Describes only what changes: where wallets are created, opened, renamed and removed, where per-wallet configuration lives, and what Settings now holds. Everything else (tabs, task screens, Unlock, Onboarding, the annunciator) is inherited unchanged and referenced by name. Marks: `[ASSUMPTION]` = my guess, to be confirmed; `[CONFLICT]` = this spine disagrees with a document or the code. Both are collected under Open Questions and Conflicts.

## Foundation

Single-surface responsive PWA, phone-first (320px floor), React 19 + Vite + Tailwind v4 + shadcn-in-repo, no backend. No router dependency: `src/lib/route.ts` is the one location scheme, and the app is a static shell (only `/` is guaranteed to be served on a first load). The visual identity is the repo-root `DESIGN.md` (The Bench Panel); `DESIGN.md` beside this file is the delta. Guardrails that bind this work and are **not restated**: docs/decisions.md §3 and §4, and the CLAUDE.md "never negotiable" list. Three of them shape this spine directly:

- AD-26: a wallet whose lock is closed is **its name and nothing else**; nothing account-scoped mounts for it and no read carries its address.
- Every ledger read goes through the one query-key factory; the chooser makes **no ledger read at all** (see Component Patterns).
- Nothing here may style `:focus`, rely on colour alone, or move funds. Commit orange does not appear.

Persona vocabulary: the PRD's. **Wallet**, **Active Wallet**, **Open Check**, **Signing Check**, **Standard**, **Seed**, **Network**, **Node**, **App PIN**, **Annunciator**. No synonyms.

## Information Architecture

### Surfaces

| Surface | Reached from | Purpose | Heading (each screen owns one h1) |
|---|---|---|---|
| **Chooser** (new home) | Every launch; header **Wallets** key inside a wallet; Back from a wallet | One card per Seed. Open, rename, lock, remove; add a wallet; reach Settings | h1 "Wallets" (visible); each card an h2 |
| **Unlock view** (existing, unchanged) | **Open** on a locked card | The wallet's name and its own Open Check prompt, lockout, hard-lock, reset | existing: wallet name as h1 |
| **Wallet shell** (existing tabs) | **Open** on an open card or network row; after Unlock | Balances, Send, Receive, History, Tokens, Settings. The Settings tab is now app-level | per-tab sr-only h1 (existing, §6.4) |
| **Per-wallet configuration** (new) | A **Configure** key on each open chooser card, and a **Configure** key in the in-wallet header | Edit checks (with auto-lock), Reveal seed, Let another wallet sign, Account master key, Use on another network, Node, two-device signing | h1 "Configure wallet"; each plate an h2 |
| **Existing task screens** | From configuration (Edit checks, Let another wallet sign, Sign with two devices); from the chooser (Add wallet) | unchanged contents | existing TaskScreen h1 |
| **Settings** (app-level) | The Settings tab inside a wallet; a **Settings** key on the chooser header `[ASSUMPTION]` | Address book, Version and updates, Remove all wallets from this device | h1 "Settings" (sr-only as a tab, visible as a route) |
| **Onboarding** (existing, unchanged) | Zero wallets, at launch or after the last Remove | First wallet | existing |

The wallet shell's header stops hosting a wallet picker. The `Select` that switched the Active Wallet is removed; switching is "Wallets key, then Open". `[CONFLICT: the code ships the picker in src/components/AppHeader.tsx and docs/decisions.md §6.12 documents its wrapping; see Conflicts.]`

### Route table (extends `src/lib/route.ts`)

The shipped `Route` is `{screen:'home'} | add-wallet | edit-checks | two-device | control`, where `'home'` means "the shell". The delta renames the meaning, not the mechanism.

| Path | Screen | Requires | Notes |
|---|---|---|---|
| `/` | `chooser` (was `home`) | nothing | The only path served on a cold start. Always the landing screen |
| `/settings` | `settings` (new) | nothing | App-level. Also what the Settings tab renders, inside a wallet |
| `/wallets/new` | `add-wallet` (exists) | nothing (Generate and Import each create their own lock; see N2) | Back returns to the chooser |
| `/wallets/:id` | `wallet` (new; this is the shell) | wallet exists | Shows Unlock view if its lock is closed, tabs if open. Tab selection stays local state, **not** in the URL (as today) |
| `/wallets/:id/configure` | `configure` (new) | wallet exists **and its lock open** | Same reachability rule `WalletScreens` already applies |
| `/wallets/:id/checks` | `edit-checks` (exists) | lock open | Back returns to `/configure` (was Settings) |
| `/wallets/:id/two-device` | `two-device` (exists) | lock open | Back returns to `/configure` |
| `/wallets/:id/control` | `control` (exists) | lock open | Back returns to `/configure` |

A path carries a screen name and at most a wallet id. Never a secret, never a name, never form data (the existing route rule). The wallet **name is never in the URL**; the id (a random UUID per Seed view) is.

### Back and history behaviour

- **Opening** a wallet from the chooser is `navigate('/wallets/:id')`: a pushed entry. The header **Wallets** key leaves it the way `leaveScreen()` does today: pop the entry the app pushed, or replace with `/` when the screen was entered by a boot. The browser's and the phone's Back do the same thing. So Back from a wallet shell is the chooser; Back from the chooser leaves the app. There is no ping-pong between the two.
- Tab changes inside a wallet push nothing (unchanged).
- Configuration is a pushed entry over the shell; its task screens push over it. `leaveScreen()` pops one. The shell's tab (e.g. Balances) is preserved because `OpenWallet` keeps it in local state, as it does for Settings today.
- Dialogs (rename, remove, reveal, Use on Mainnet) share the single `overlay` history entry (`pushOverlay`): Back closes the dialog and stays on the screen. Unchanged mechanism.
- A key-changing write or a Seed backup on a screen still blocks Back (`blockLeaving`), including the header **Wallets** key: while blocked it is `aria-disabled` with the reason in visible text (the existing TaskScreen pattern for its own Back key). It does not silently ignore the press.
- **Lock** inside a wallet (header key) closes that wallet's lock and then replaces the current entry with `/` `[ASSUMPTION; see OQ-11]`, so Back does not return to a wallet that is now locked.

### Cold boot at a wallet URL

**Launch always lands on the chooser.** On first mount, after the persisted state has been read and `Gate` is ready, any path other than `/` and `/settings` is replaced with `/` (`replaceState`), exactly as `resetToHome()` already does for an unreachable location. This covers a bookmark or a reopened tab at `/wallets/:id`, `/wallets/:id/configure` and the task screens, and a plain page **reload** inside a wallet. Reasons: the owner's decision ("always the chooser on launch"), the static-shell constraint, and the fact that the wallet's lock may have closed in the meantime. A reload is not a re-lock: `restoreOpenLocks()` still re-opens any lock whose persisted session is valid, so the chooser shows that wallet's card as **Open** and one tap returns the user to it. `/wallets/new` on a boot is discarded the same way. The URL a user sees after launch is therefore always `/`.

## Voice and Tone

Microcopy only. Brand voice and visual posture live in `DESIGN.md`. The register is the repo's: literate, plain, consequence-first; no tutorials, no exclamation marks, no emoji. Never describe the product as open source. Plain words for the two checks, the PRD glossary terms verbatim. A wallet's **name is local to this device**: say so wherever it is edited.

### Exact strings

| Where | String |
|---|---|
| Chooser h1 | `Wallets` |
| Chooser description | `Choose a wallet to open. Each one has its own lock.` |
| Chooser add key | `Add wallet` |
| Chooser Settings key (accessible name, no update) | `Settings` |
| Chooser Settings key (update waiting) | `Settings, update available` |
| Lock-state words | `Locked` · `Open` |
| Active legend | `Active` |
| Locked card body | `Locked.` |
| Card keys | `Open` · `Rename` · `Lock` · `Remove` |
| Card key accessible names | `Open {name}` · `Rename {name}` · `Lock {name}` · `Remove {name}` |
| Open-card network row | `Mainnet` + stamp `Real funds` · `Testnet` · `Devnet` + stamp `Not stable` |
| Row key accessible names | `Open {name} on {Network}` · `Remove {name} on {Network}` |
| Devnet sentence | the existing `DEVNET_NOTICE`, verbatim |
| Remove, wallet locked (visible reason) | `Open this wallet to remove it.` |
| No Open Check, Lock not offered (visible line on the open card) | `No Open Check: this wallet opens itself, so there is nothing to lock.` |
| Wallets key (header) | `Wallets` (visible legend; no extra aria-label) |
| Configure key (header) | accessible name `Configure wallet` |
| Lock key (header) | accessible name `Lock wallet` (as shipped) |
| Blocked leave, reason | `Finish or cancel what is running first.` `[ASSUMPTION: wording]` |
| Rename dialog title | `Rename wallet` |
| Rename field label | `Name` |
| Rename help (always visible) | `Only on this device. Never sent to the ledger.` |
| Rename keys | `Cancel` · `Save name` |
| Rename error, empty | `Give this wallet a name.` |
| Rename error, duplicate | `Another wallet on this device already has that name.` |
| Rename error, too long | `Use 40 characters or fewer.` `[ASSUMPTION: the limit]` |
| Rename success | `Wallet renamed.` |
| Rename failure | `Could not rename the wallet. Nothing was changed.` |
| Remove dialog title | `Remove this wallet?` (as shipped) |
| Remove body, a sibling view remains | the shipped sentence: `This removes only this one wallet. The encrypted seed stays, because the same key is still set up as another wallet on this device.` + `Make sure you have your own backup — this cannot be undone from within the app.` |
| Remove body, sole view | the shipped sentence: `This app will no longer hold the encrypted seed for this wallet.` + the same backup sentence |
| Remove body, last wallet on the device (added) | `This is the last wallet on this device. Removing it returns the app to setup.` placed before the shipped sentence |
| Remove keys | `Cancel` · `Remove wallet` (shipped) |
| Remove success | `Wallet removed from this device.` (shipped) |
| Add success | `Wallet added.` (shipped) |
| Configuration h1 | `Configure wallet` |
| Configuration plates (h2) | `Checks` · `Seed` · `Operating another account` · `Other networks` · `Node` · `Two-device signing` |
| Config keys (shipped labels, unchanged) | `Edit checks` · `Reveal seed` · `Let another wallet sign` · `Use on {Network}` · `Sign with two devices` |
| Other networks, none left | `This key is already set up on every network.` |
| Reveal confirm | all shipped strings: title `Reveal this wallet's seed?`, confirm `Show my seed`, and the per-check sentence from `revealCheckSentence` |
| Use on Mainnet confirm | shipped: `Mainnet moves real funds. This adds the same key as a wallet on Mainnet; nothing is sent. Anything sent to this address there is real XRP.` |
| Task screen back labels | Add wallet: `Wallets` · Configuration: `Wallet` · Edit checks / Let another wallet sign / Sign with two devices: `Configuration`. No back label may contain a wallet name (key legends are uppercase) |
| Unlock multi-view note (after unlock, returning to chooser) | `Opened. Choose which network to enter.` `[ASSUMPTION: wording]` |
| Shared lock note | `Opening {name} also opened {other names}: they share one lock.` `[ASSUMPTION: wording]` |
| Settings sections | `Address book` · `Version` · `Remove all wallets from this device` (all shipped) |

**Standard** and **No Open Check** wording is inherited from the recent copy fixes (issues 8a–8i) wherever a check is summarised: the Checks plate uses the same words as the Edit checks screen, not new ones. I did not re-read those strings in this pass; the builder copies them from `EditChecksScreen.tsx`.

| Do | Don't |
|---|---|
| "Open this wallet to remove it." | "Remove is unavailable." |
| "Only on this device. Never sent to the ledger." | "Your wallet name is private and secure." |
| "Wallets" | "Back to your accounts" / "Log out" (a lock is not a log-out; nothing is signed out) |
| "Locked." | "This wallet is protected." |
| State the exact consequence before Remove | "Are you sure?" |

## Component Patterns

Behavioural. Visual specs are in this folder's `DESIGN.md`.

| Component | Use | Behavioural rules |
|---|---|---|
| **Chooser** | `/` | One card per Seed in stored order, never reordered by state. Makes **no ledger read**: it shows only what the store already holds (name, lock state from `openLocks`, and, for open locks, each view's network and address). `[ASSUMPTION; OQ-7]` No balances. |
| **Wallet card** | Chooser | The unit is the **Seed record**, not the view (see Decision D-b). Locked: name, lock-state legend, `Locked.`, keys Open, Rename, Remove (disabled with reason). Open: one network row per view, Configure, Rename, Lock (when the lock has an Open Check). Active: adds the word `Active`. |
| **Network row** | Open card | Word + stamp + address (`AddressLink`) + Open + Remove, for one view. Open navigates to `/wallets/:id` of that view. |
| **Open key (locked card)** | Locked card | Navigates to `/wallets/:id` of the Seed's first view, where the **existing Unlock view** takes over, unchanged: PIN field, passkey button, backoff and hard-lock messages, the explicit reset, the Open-Check-none auto-open. On success: a Seed with one view stays in the shell (Balances); a Seed with several views returns to the chooser with the card open, so the network is chosen deliberately (a Mainnet view is never entered by default). `[ASSUMPTION; OQ-6]` |
| **Rename dialog** | Card key | A single-field `Dialog` (confirm-sized, not a routed screen). Field is uncontrolled-safe: it holds a name, not a secret. Enter submits. Validation below. A rename applies to **the Seed's name**, so every network row under that card shows the new name. No lock needed (the name is not account data). |
| **Remove dialog** | Card/row key | The shipped confirm dialog (`dismissOnOutsidePress`), plus the last-wallet sentence. Requires the wallet's own lock **open** (the shipped rule: the key exists only then). Confirm key is the `destructive` fill; the opening key is `danger`. After confirm: unchanged `handleRemove` behaviour (remove view, close a created lock whose last wallet is gone, re-pick the Active wallet, clear cached account data, toast). Zero wallets left: the app returns to Onboarding. |
| **Lock key (card)** | Open card with an Open Check | Closes that wallet's lock via the same teardown the Settings "Lock now" button used (`tearDownLock`), which clears its account-scoped query data (guardrail 7, §13). The card flips to Locked in place. |
| **Header Wallets key** | Wallet shell, configuration | Returns to the chooser. **Does not close the lock** (Decision D-a). |
| **Configure key (open card)** | Open chooser card | Navigates to `/wallets/:id/configure` for the card's Active view, or, on a card with several network rows, each row's own Configure is not offered: configuration is per Seed view, so the card's Configure acts on the row the user last entered, else the first view `[ASSUMPTION; OQ-14]`. Absent on locked cards (the lock must be open). |
| **Header Configure key** | Wallet shell | Navigates to `/wallets/:id/configure`. Absent on the Unlock view (the lock is closed), `aria-disabled` is not used there because the whole header control cluster is withheld for a locked wallet, as `NetworkPlate` and the Lock key are today. |
| **Header Lock key** | Wallet shell, open lock with an Open Check | Closes the lock and goes to the chooser (Decision D-d). Absent when the Open Check is none, as shipped. |
| **Configuration screen** | `/wallets/:id/configure` | Plates in fixed order: Checks, Seed, Operating another account, Other networks, Node, Two-device signing. Reveal seed, Use on Mainnet and every existing flow keep their dialogs and their `returnFocusTo` targets. Mounted only while the lock is open; otherwise the existing `resetToHome()` guard fires (now to `/`). |
| **Settings (app-level)** | `/settings` and the Settings tab | Address book (all networks, unchanged), Version (build stamp, check for updates, install, decline, trouble-after-update), Remove all wallets from this device. Contains **no** per-wallet control. See Conflict C-1 on auto-lock. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| **Locked card** | Chooser | Name, neutral lamp + `Locked`, `Locked.`. No address, no network, no stamp, no Node (AD-26). Keys: Open, Rename, Remove (`aria-disabled`, reason `Open this wallet to remove it.` visible on the card). A locked card therefore **cannot show Mainnet**; see Decision D-f. |
| **Open card** | Chooser | Live lamp + `Open`. One network row per view, each with the network word, stamp (Mainnet, Devnet) and address. Keys as in Component Patterns. If the lock has no Open Check, no Lock key and the line `No Open Check: this wallet opens itself, so there is nothing to lock.` is visible (§6.4: a missing control states why; this departs from the header today, which hides the key without a reason, `[CONFLICT]` minor). |
| **Active card** | Chooser | The wallet last entered carries the word `Active` and `aria-current="true"` on its Open key. It stays in its stored position. Active is orthogonal to lock state (a locked card can be Active). `[ASSUMPTION; OQ-9: is "Active" still useful on a chooser?]` |
| **Devnet card / row** | Chooser | Network word, `Not stable` stamp and the `DEVNET_NOTICE` sentence as visible text. Open cards only. |
| **Mainnet card / row** | Chooser | Network word `Mainnet` and the `Real funds` stamp on the row (Decision D-f). Open cards only. |
| **Shared lock** | Chooser | Several Seeds can share one lock (every legacy Wallet shares the legacy lock; an imported Wallet is stored under the active wallet's lock). Opening or locking one therefore flips **all** cards on that lock together. After an unlock that opened other cards, a one-line note under the chooser title says so (`Opening {name} also opened …`); on Lock, the same. Not a surprise the user has to infer. |
| **Auto-lock closes a lock while the chooser is showing** | Chooser | The affected cards flip to Locked in place (lamp word changes inside a polite live region). Query data for the lock's wallets is already removed by the existing `useClearCacheOnLock` observer. The user is not moved. |
| **Auto-lock closes the lock of the wallet the user is in** | Wallet shell | Unchanged: the shell shows the Unlock view in place. The header stays, with the **Wallets** key (the way out), without Configure and Lock. |
| **Empty / first-run (zero wallets)** | App | The chooser is not shown with zero cards. `Gate` routes to the existing Onboarding, unchanged. Removing the last wallet ends there too, and the URL is replaced with `/`. |
| **Wallet list could not be read** | App | The chooser must **never** render a failed read as "no wallets" and so push the user into first-run (CLAUDE.md: a failed read is never rendered as an empty one). Say `The wallets on this device could not be read. Nothing was changed.` with a Retry key, and do not mount Onboarding. **I did not verify how `Gate` behaves on a failed read.** From the code I read, the wallet-list effect has no `.catch`, so a rejection leaves the screen blank; and `appStateHydrationFailed()` exists but `Gate` does not consult it before showing Onboarding at `wallets.length === 0`. Needs an architecture look (N5). |
| **Lock-info read failed** | Unlock view (reached from a locked card) | Unchanged, shipped: `This wallet's lock could not be read. Nothing was changed.` + Retry. Never shown as an empty form. The chooser itself makes no lock-info read. |
| **Lockout / hard-lock** | Unlock view | Unchanged: PIN backoff countdown, then PIN entry turned off with the passkey still working, and the explicit reset. The chooser adds nothing and reveals nothing about attempts. The chooser's Settings key gives a user whose only Open Check is a hard-locked PIN a way to **Remove all wallets from this device** without opening a wallet. |
| **Remove confirmation** | Dialog | Three body variants (sibling view remains, sole view, last wallet on the device). Confirm key `destructive`. Escape, overlay press and Back close it. Focus returns to the opener, or to the chooser h1 when the card no longer exists. |
| **Remove, wallet is the one the user was just in** | Chooser | Works because leaving does not close the lock (D-a). After removal the Active wallet is re-picked from the remainder by the existing rule, and `activeWalletId` never points at a removed wallet. |
| **Rename validation** | Dialog | The Save key is enabled only for a valid, changed name. Trim, then collapse inner whitespace. **Empty after trim:** `Give this wallet a name.` **Duplicate:** case-insensitive, trimmed comparison against every **other Seed's** name (the sibling views of the same Seed share one name, so they never collide); `Another wallet on this device already has that name.` **Too long:** more than 40 characters `[ASSUMPTION]`; `Use 40 characters or fewer.` The error is visible text tied to the field (`aria-invalid`, `aria-describedby`), shown on submit and on blur, and never auto-dismissed. An unchanged name closes the dialog silently. |
| **Rename write fails** | Dialog | `Could not rename the wallet. Nothing was changed.`; the dialog stays open with the typed name. |
| **Reveal Seed** | Configuration | All shipped: confirm dialog stating the consequence, then the wallet's own check, the seed in a ref (never React state), the `SeedReveal` dialog, and return focus to the Reveal seed key. A closed lock cannot reach this screen at all. |
| **Cancelled / failed check** | Reveal, Remove-if-gated, Edit checks | Shipped copy (`Cancelled. The seed was not revealed.` and the `describeCheckFailure` strings). |

## Interaction Primitives

- **Touch and pointer only where a key exists.** Every action is a visible key. No swipe-to-delete, no long-press, no drag-to-reorder, no hover-only reveal, no pull-to-refresh.
- **Keyboard.** Tab order is reading order: header (skip link first, then Wallets/Settings, Configure, Lock), then each card top to bottom: Open, Rename, Lock, Remove; within an open card, each row's Open then Remove, then the card's Rename and Lock. Enter/Space activates. Esc closes the topmost dialog. No new shortcuts.
- **No menu.** The repo ships no dropdown-menu primitive; actions are visible keys in a wrapping group, not an overflow menu.
- **Order never changes** with lock state, activity, or Active.
- **Switching is two steps by design:** Wallets, then Open. There is no quick-switch picker, because a picker would let a user enter a Mainnet wallet from a Testnet screen without seeing the chooser's network words.
- **Banned (inherited):** motion that is not `prefers-reduced-motion`-guarded, any animation library, auto-dismissing errors, controls hidden to convey state.

## Accessibility Floor

Behavioural. Contrast is measured by `bun run check:contrast` (no new token here).

- **Touch targets:** every key and icon key is at least 44px on coarse pointers (the Button primitive supplies 2.75rem; icon keys likewise). Radio and checkbox rows keep their 44px hit area. A network row's two keys must not sit closer than their own hit areas.
- **No `:focus` styling, no `outline-none`.** The browser's ring is the indicator on every new control and on every programmatic focus target (`tabIndex={-1}` landing targets included).
- **Colour never alone.** Lock state = lamp + word. Mainnet = the word `Mainnet` + the `Real funds` stamp. Devnet = word + `Not stable` + sentence. Active = the word `Active`. A disabled Remove = visible reason text. Card order carries no meaning.
- **Heading outline, one h1 per screen.** Chooser: h1 `Wallets`, each card's name an h2 (never a display heading; set in `{typography.wallet-name}`). Wallet shell: one sr-only h1 per tab (shipped). Configuration: h1 `Configure wallet`, each plate an h2. Settings: h1 `Settings`, plates h2. Unlock view: wallet name h1 (shipped). The product nameplate is never a heading.
- **Accessible names carry state.** `Open {name}` on a locked card; on an open card the row key reads `Open {name} on {Network}` and the network row's stamp is part of the row's text, so a screen reader hears `Savings, Mainnet, Real funds` before the key. The lamp is `aria-hidden`; its word is read. The Settings key's accessible name changes to `Settings, update available` when the marker is lit.
- **Live regions.** A lock state change on the chooser (auto-lock, Lock key) is announced politely. Errors are visible, persistent text, and the Annunciator (inherited) reports events.
- **Focus management on entering and leaving the chooser:**
  - Entering the chooser from a wallet (Wallets key, Back, Lock): focus moves to the chooser's h1 (`tabIndex={-1}`), so the screen names itself and the user starts at the top. Not to the card just left: a Lock leaves that card locked and the user should not land on it by accident.
  - Entering a wallet from the chooser: focus moves to the main region (the skip-link target), as the shell does today.
  - After Add wallet: back on the chooser, focus lands on the **new card's h2** (`tabIndex={-1}`) and the success notice names it.
  - After Remove: focus moves to the chooser h1 (the card is gone).
  - After a dialog closes on Cancel, Esc or Back: the opener (shipped `returnFocusTo` pattern); after Rename Save, the Rename key of the same card.
  - Leaving configuration or a task screen: the key that opened it.
- **Skip link** on the chooser, as on the shell.
- **Reduced motion and text zoom:** no declared motion; the header and action rows wrap at 200% text and 320px without clipping a key.

## Key Flows

### Flow 1 — Switching between a Mainnet wallet and a Testnet wallet (Rui, trader who keeps a practice wallet, Tuesday lunchtime)

1. Rui is in **Savings** (Mainnet) on Balances. The header shows `Mainnet` and the `Real funds` stamp.
2. He wants to try a trust line on **Practice** first. He presses **Wallets**.
3. The chooser opens with focus on the `Wallets` heading. **Savings** is Open (live lamp, `Open`), its row reads `Mainnet` + `Real funds` with its address. **Practice** is Locked (`Locked.`): the card says nothing about its network.
4. He presses **Open** on Practice. The Unlock view appears with its name. His Testnet wallet has no Open Check, so it opens itself and the shell appears. (Had Practice an App PIN, he would have typed it here.)
5. **Climax:** the header's network plate now reads `Testnet`, the `Real funds` stamp is gone, and Balances shows test XRP. Nothing from Savings is on screen, and Savings' lock is still open behind him, ready when he returns.

Failure: the Practice lock cannot be read: the Unlock view says `This wallet's lock could not be read. Nothing was changed.` with Retry; he can press **Wallets** and the chooser is intact.

### Flow 2 — Adding a wallet (Mei, first Testnet wallet, then a second one on Mainnet)

1. On the chooser Mei has one card, **Practice** (Open). She presses **Add wallet**: `/wallets/new`, the existing Add wallet screen, back label `Wallets`.
2. She chooses Generate, picks Mainnet, the flow asks the usual per-wallet questions (Open Check, Signing Check), then the Seed backup, and the wallet is committed after the backup, exactly as today.
3. The screen closes onto the chooser.
4. **Climax:** a second card appears in stored order below Practice, focus is on its name, and the notice says `Wallet added.` Its row reads `Mainnet` and `Real funds`. She has not been taken into it: a Mainnet wallet is never entered by default.

Failure: Back is held while the backup runs (`blockLeaving`); the Wallets key states why.

### Flow 3 — Renaming (Rui, "Wallet" becomes "Savings")

1. On the chooser Rui presses **Rename** on the card named `Wallet`.
2. A dialog titled `Rename wallet` opens with the field `Name` holding `Wallet` and the line `Only on this device. Never sent to the ledger.`
3. He types `Savings` and presses Enter.
4. **Climax:** the dialog closes, the card's name reads `Savings` and so does the same Seed's other network row (it is one name), focus returns to that card's **Rename** key, and the Annunciator reports `Wallet renamed.` Nothing was sent to the ledger and nothing was re-encrypted.

Failure: he types `Practice`, which another wallet already has: `Another wallet on this device already has that name.` under the field; Save is held.

### Flow 4 — Removing the wallet you are in (Amara, tidy-up after moving funds)

1. Amara is inside **Old Mainnet**. She has moved the funds out and wants it gone. She presses **Wallets**.
2. The chooser opens. **Old Mainnet** is still Open, because leaving does not close the lock. Its row reads `Mainnet`, `Real funds`.
3. She presses **Remove** on the row. The dialog says what happens and, because another wallet remains, uses the sole-view or sibling-view sentence, then `Make sure you have your own backup — this cannot be undone from within the app.`
4. She presses `Remove wallet`.
5. **Climax:** the card is gone, focus moves to the `Wallets` heading, `Wallet removed from this device.` is reported, and the Active wallet has moved to a remaining one without her having to choose. Had it been her last wallet, the dialog would first have said `This is the last wallet on this device. Removing it returns the app to setup.` and she would land on Onboarding.

Failure: she had locked the wallet before leaving: its Remove is `aria-disabled` with `Open this wallet to remove it.` visible; she opens it first.

### Flow 5 — Revealing the seed from per-wallet configuration (Jonas, writing down a Seed before travel)

1. Jonas is in his wallet and presses **Configure**.
2. `Configure wallet` opens. He goes to the **Seed** plate and presses **Reveal seed**.
3. The dialog `Reveal this wallet's seed?` states the consequence and the check that will be asked (`After you confirm, your passkey will be asked.`).
4. He confirms with `Show my seed`, passes the check.
5. **Climax:** the `Wallet seed` dialog shows the Seed in the well, held in a ref and never in state. When he closes it, focus returns to the **Reveal seed** key and the Seed is gone from memory.

Failure: he cancels the passkey prompt: `Cancelled. The seed was not revealed.`

### Flow 6 — A locked wallet opened from its card (Dara, cold start, Mainnet wallet with an App PIN)

1. Dara launches the app. Whatever path he was on, the chooser appears, focus on `Wallets`. **Savings** is Locked: its name and `Locked.`, no address, no network.
2. He presses **Open**. The Unlock view for Savings appears with a PIN field and, if set up, a passkey button.
3. He enters the PIN. The lock opens.
4. **Climax:** he lands in the shell on Balances, the header shows `Mainnet` and `Real funds` for the first time, and the balance reads. Everything before this showed only a name. If Savings had two network rows (Mainnet and Testnet on one Seed), he would instead return to the chooser with the card Open and choose the row, so that he never lands on Mainnet by default.

Failure: three wrong PINs: the shipped backoff, then PIN entry turned off with the passkey still working, nothing erased; the chooser's Settings key leads to **Remove all wallets from this device** if there is no other way in.

## Decisions Resolved In This Spine

Owner-decided items carry no tag (D-a, D-b, auto-lock, Configure entry). Every other item is `[ASSUMPTION]` pending owner review.

**D-a. What "leave a wallet" does to its lock.** Returning to the chooser **leaves the lock open until auto-lock**; it does not close it. **Owner-decided (OQ-2).**
Reasoning: (1) it is today's behaviour: switching wallets through the header picker never closes the other wallet's lock, so this introduces no new exposure; closing on leave would be a stricter posture than the one shipped. (2) AD-26's guarantee is about what a **closed** lock shows, and an open one is allowed to hold an Open Key; the cleared-cache-on-lock rule (`useClearCacheOnLock`, §13) fires when a lock closes, so account data stays removed on the lock paths that exist (Lock key, auto-lock, backgrounding), and **leaving mounts no ledger hook for the wallet**, because `OpenWallet` unmounts with the shell: no live subscription, no balance refetch, no incoming-payment notice while on the chooser. (3) It is what makes Remove-from-chooser and fast switching workable: closing on leave would force a PIN or passkey just to remove a wallet or to hop back, and Remove needs the lock open. (4) The chooser shows an **open card** with the address of an open wallet, but no balance; this is the posture the PRD already accepts for an open lock. **Mitigations:** a Lock key on every open card with an Open Check; and see N3: on the chooser, activity must stop extending any wallet's lock. The stricter reading (close on leave) was considered and not chosen.

**D-b. Where "Use on another network" lives, and how seed-sharing wallets appear.** It lives in the **per-wallet configuration**, plate `Other networks`, one `Use on {Network}` key per network the Seed lacks, with the shipped Mainnet confirm dialog (`Use {name} on Mainnet?`). The shipped behaviour creates a sibling wallet over the **same Seed record** (`addNetworkView`: own wallet id, no new ciphertext). On the chooser, wallets that share a Seed are **one card with one network row per view**. This is forced by the data: the name (`label`), the lock and the Seed are properties of the Seed record, and every sibling view is projected with the same label and lock; two separate cards would show the same name, and while locked they could not be told apart (a locked card cannot show its network, AD-26). **Owner-decided (OQ-3):** one card per Seed with a row per network; a locked card still shows the name only.

**D-c. Where Remove lives.** On the **chooser** (owner), as a `danger` key per network row when the lock is open, and as an `aria-disabled` Remove with a visible reason on a locked card. It is *not* in the configuration screen: Remove is the one wallet action that works at the level of the list, and the owner placed it there. Remove needs the wallet's own lock open, which is exactly why D-a keeps the lock open on leave. Removing a view that shares a Seed removes only that view; the dialog says so.

**D-d. The Lock control in the header.** Kept, as an icon key beside Configure, shown only for an open lock with an Open Check (as shipped). It closes the wallet's lock (and any other wallet on that lock) and **returns to the chooser**, replacing the entry. `[ASSUMPTION; OQ-11]` Settings' "Lock now" is removed: Settings is app-level and has no wallet. Each open card on the chooser also has a Lock key, so a wallet can be locked without being entered.

**D-e. The update-available marker.** The caution lamp sits on the **Settings tab inside a wallet** (unchanged) and **also on the chooser's Settings key**, because the chooser is now the first screen on every launch and would otherwise hide the only "update waiting" cue (the app-versioning US-2 marker is documented in `Main.tsx` as discoverable without opening Settings first). Same rule as shipped: never a modal, never a redirect, and a declined release does not relight it. The accessible name becomes `Settings, update available`. The marker is a lamp **with** the accessible word (the shipped device).

**D-f. How the chooser shows Mainnet "real funds" without colour.** On every **open** network row: the word `Mainnet` and the stamp `Real funds`, in a fixed position in the row, the same two things `NetworkPlate` shows in the header (§6.7: flagged as real funds, not as danger). Colour (caution amber) is only reinforcement. The row's accessible text reads `Mainnet, Real funds`. **Limit, stated plainly:** a **locked** card cannot show this, because AD-26 withholds the network of a locked wallet, so on the chooser a Mainnet wallet and a Testnet wallet look identical until opened. The first place real funds is flagged is therefore after Unlock, and in the header on entering. `[CONFLICT between the owner's want to flag Mainnet on the chooser and AD-26; the spine follows AD-26 and the memlog assumption; see OQ-4.]`

**D-g. Rename: what it implies for architecture** (a note, not a design):
- The name is `label`. In the code I read it lives on the **Seed record** (`StoredWallet.label` in `src/lib/crypto/db.ts`) and `toMetas` in `keystore.ts` copies it into each view's `WalletMeta.label`. So renaming is a write to the Seed record, and every sibling view changes name together.
- There is no rename function today. A rename is a vault-record update, not an `app-store` setter alone: the list is re-projected from the vault (`listWallets`) and the persisted `wallets` slice is rewritten.
- `StoredWallet.rev` is documented as the compare-and-swap counter of `commitWalletEdit` (Edit checks). Whether a rename must bump or respect it, so that a rename racing an Edit checks write cannot overwrite it, is for the architect.
- **Does a label feed a lock or encryption record?** I found no additional-authenticated-data use in `src/lib/crypto/*.ts` (grep for `aad` / `additionalData` returned nothing), so renaming does not appear to touch any ciphertext. The label is also used as the **display name given to the authenticator** when a passkey is registered (`${label} – open`, `– signing`, `– seed` in `keystore.ts`; `registerPasskey(input.label …)` in `lock.ts`). A passkey created before a rename keeps the old name in the authenticator's own list; the app does not change that. I did not confirm whether the lock record persists a label: `db.ts` showed a `label` only on the Seed record. Architect to confirm.
- The label is local; nothing in the ledger path (`submitAndClassify`, query keys) uses it. Query keys are keyed by wallet id/address and network, not name.

## Conflicts With Existing Docs And Code

- **C-1. RESOLVED (owner, OQ-1).** Auto-lock lives in per-wallet configuration, in the `Checks` plate, not in Settings. Original finding: auto-lock is not app-level in the shipped design. The memlog puts "auto-lock" in app-level Settings. The PRD (FR-65: "each Wallet has its own Open Check and its own auto-lock"), AD-26 ("each lock's auto-lock minutes live on the lock record; `app-store`'s single `autoLockMinutes` is removed from reads") and the code (`handleAutoLock` calls `setLockAutoLock(activeLockId, …)`, which asks that lock's Open Check, and the policy refuses a Mainnet value under the floor) all make it **per lock**. The Edit checks screen already edits it (`EditedChecks.autoLockMinutes`). An app-level setting would be either a default for new locks (a new concept) or a per-lock edit with no wallet in context. This spine **omits auto-lock from Settings**; the memlog line placing it there is superseded.
- **C-2. Wallet picker removal.** `AppHeader.tsx` ships a wallet `Select` (and `docs/decisions.md` §6.12 documents its sizing). This spine removes it in favour of the Wallets key. The decision record needs updating if the owner agrees.
- **C-3. RESOLVED (owner, OQ-3).** One card per Seed, a row per network. See D-b.
- **C-4. AD-26 vs flagging Mainnet on the chooser.** See D-f.
- **C-5. `docs/decisions.md` does not contain AD-26.** The brief names it there; I found it only in the architecture spines (`ARCHITECTURE-SPINE.md` of the passkey-signing run, plus the 2026-09-12 spine for AD-16). `decisions.md` §15 records the passkey plan in prose. I cited the spine.
- **C-6. PRD glossary marks Open Check, Signing Check and the per-Wallet lock as "planned, not built"** while the code ships `openCheck`, `signingCheck`, `lockId` and `Unlock` per Wallet. I used the glossary terms verbatim as instructed. The doc drift is reported, not fixed.
- **C-7. Duplicate names.** Creation paths allow duplicates and generate defaults (`My Wallet`, `Wallet`, `Restored wallet`; `label || 'Wallet'`). The rename rule (no duplicate) is stricter. Two wallets created with the default name already collide, and a locked card has only its name to identify it (AD-26). Recommendation: apply the same rule at creation or auto-suffix; until then a collision that already exists is grandfathered and is only checked when changed. OQ-8.
- **C-8. `TaskScreen` default `backLabel` is `'Settings'`** and `leaveScreen()` replaces to `HOME_PATH` when a screen was entered by a boot. Both change meaning under this spine (back label per screen; `/` is the chooser, which is acceptable because a cold boot rewrites to `/` anyway).
- **C-9. Hidden Lock key.** The header and Settings hide the Lock control when there is no Open Check, with no reason. §6.4 says to state the reason. The chooser states it. Minor.

## Notes For Architecture (not a design)

- **N1.** `Route` needs `chooser`, `wallet`, `configure`, `settings`; `home` is retired or redefined. `parseRoute`/`walletScreenPath` get `/wallets/:id` and `/configure`; add the cold-boot rewrite to `/` once `Gate` is ready.
- **N2.** Owner-decided (OQ-A): Import creates its own lock and Open Check like Generate. `AddWalletScreen` currently stores an imported Seed under the active wallet's open lock (`useWalletOpenKey(activeWalletId)`; `handleAddImport` returns silently when that key is null) and must change: the Import form gains the per-wallet questions (Open Check, auto-lock, Signing Check), `keystore.ts` needs an import-under-a-new-lock path alongside `createStoredWallet`, and the Mainnet Open Check floor applies to it.
- **N3.** `touchActiveLock()` restarts the **Active wallet's** lock on any activity (`app-store.ts`). On the chooser, `activeWalletId` is still the last wallet, so activity there would keep extending that lock. The chooser must not count as activity for any wallet (D-a depends on it).
- **N4.** After a multi-view unlock, return to the chooser rather than entering a view (Component Patterns, Open key). `Unlock` currently only calls `openLock` and lets `Main` re-render into the shell.
- **N5.** `Gate`'s read-failure handling (State Patterns, "Wallet list could not be read").
- **N6.** Notices are scoped to `activeWalletId` (`notify.scopeToWallet`). The Active wallet persists while on the chooser, so a wallet's notice persists too. Decide whether leaving a wallet should clear them.
- **N7.** The shell's live hooks (`useAccountLiveUpdates`, `useIncomingPaymentNotifications`) are mounted by `OpenWallet`; leaving the shell stops them, so an incoming payment while on the chooser raises no notice. State this to the user if it matters (OQ-12).

## Resolved By The Owner

- **OQ-1** Auto-lock lives in per-wallet configuration (the `Checks` plate); Settings holds no auto-lock. Supersedes the earlier memlog line.
- **OQ-2** Leaving a wallet for the chooser keeps its lock open until auto-lock (D-a).
- **OQ-3** One card per Seed with a row per network; a locked card shows the name only (D-b).
- **OQ-5** Configure key on each open chooser card and in the in-wallet header.
- **OQ-A** Import sets its own lock and Open Check, exactly as Generate does (new lock per imported wallet, committed after the existing master-key warning). No open wallet is needed, so Add wallet works from a chooser where every card is locked.

## Open Questions

Open, with my recommended default kept as `[ASSUMPTION]`:

4. May a locked card show its network? Default: no (AD-26). `[ASSUMPTION]`
6. After unlocking a Seed with several network views, return to the chooser to pick the network. `[ASSUMPTION]`
7. The chooser shows no balance and makes no ledger read. `[ASSUMPTION]`
8. Name rules: max 40 characters is my guess; should the duplicate rule also apply at creation and to defaults such as `My Wallet`? `[ASSUMPTION]`
9. Is "Active" still meaningful on a chooser, or should it read "Last used"? `[ASSUMPTION]`
11. The header Lock key closes the lock and goes to the chooser. `[ASSUMPTION]`
12. No incoming-payment notice fires while on the chooser (N7). `[ASSUMPTION]`
13. Both a Settings tab inside a wallet and a Settings key on the chooser. `[ASSUMPTION]`
14. A Configure key on a multi-row open card acts on the last-entered view, else the first. `[ASSUMPTION]`
