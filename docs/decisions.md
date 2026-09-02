# Technical Decisions, Guardrails & Enforced Patterns

This file is the second thing (after `docs/user-stories/INDEX.md`) that must be read before touching wallet code. It records: the stack we've committed to, the product decisions made to close the gaps identified in the earlier PM-style user-story review, the guardrails against known AI-authoring failure modes for this exact stack, and the patterns that must be enforced in every PR without exception.

---

## 1. Technical Decisions (stack)

- **Architecture:** a pure React app shipped as a PWA (installable, offline-shell-capable) — no server-side framework (no Next.js, no SSR). All wallet logic runs client-side; the ledger is the only "backend."
- **UI kit:** [shadcn/ui](https://ui.shadcn.com) (Radix primitives + Tailwind) for generic UI (buttons, dialogs, forms, tables, toasts). Components are copied into the repo (`components/ui/*`), not installed as an npm dependency — we own and can edit this code directly.
- **Bespoke components:** anything crypto-domain-specific is hand-built on top of shadcn primitives rather than forced into a generic component — e.g. `<AddressDisplay>`, `<AddressLink>`/`<TxLink>` (explorer links), `<AmountInput>` (drops/issued-currency precision), `<QrCode>`, `<SeedReveal>`, `<TrustLineRow>`, `<TxStatusBadge>`.
- **XRPL SDK:** `xrpl.js` for keypair derivation, transaction building/signing, and RPC/WebSocket access.
- **Server-state / data fetching:** [TanStack Query](https://tanstack.com/query) wraps every ledger read (`account_info`, `account_lines`, `account_tx`, `server_state`, `fee`). No component calls the XRPL client directly inside a `useEffect`.
- **Local persistence:** IndexedDB for encrypted key material and app state (never `localStorage`/`sessionStorage` for anything secret). Encryption via the Web Crypto API (AES-GCM), with the decryption key gated behind the passkey/WebAuthn unlock ceremony from `wallet-security.md`.
- **PWA tooling:** Workbox-generated service worker. Static app shell only is precached/cache-first; all RPC/ledger traffic is network-first, never cached.

---

## 2. Product decisions (resolving the gaps from the prior review)

These close out the open questions raised in the earlier gap analysis, so they don't stay ambiguous once implementation starts. Each should get folded into its epic file as acceptance criteria when that epic is next touched.

| Gap | Decision |
|---|---|
| First-time-destination warning | **Yes, ship it.** Any send to an address not already in the local address book shows a "you haven't sent here before" confirmation step. |
| Address book | **Yes, add as a new epic.** Local-only labels tied to addresses, no on-chain component. |
| Auto-lock timeout | Default **5 minutes** of inactivity; user-configurable to 1/5/15/30 min. Immediate lock on app backgrounding on mobile; on desktop a **30-second grace window** applies instead (see §5, 2026-09-01). |
| Failed unlock attempts | Exponential backoff starting at the 3rd failed passkey/PIN attempt; after 8 consecutive failures, the wallet requires full re-import via seed (no silent unlimited retry). |
| Non-biometric fallback for unlock | **Mandatory**, not optional: an app-level password/PIN is set during onboarding alongside the passkey, for environments with no platform authenticator. Passkey is preferred; PIN is the guaranteed fallback. |
| Disabled master key on import | Wallet checks `account_flags`/`lsfDisableMasterKey` immediately after import; if set, it warns before completing import that this seed may not be able to sign transactions. |
| Trust line limit editing | **In scope**, add as a new story in `tokens-and-trustlines.md` (a second `TrustSet` on an existing line, not just create/remove). |
| Frozen trust lines | Wallet shows a "frozen by issuer" badge on affected trust lines/balances and disables sending that asset. |
| Stuck/expired transactions | Wallet tracks `LastLedgerSequence`; once the ledger closes past it without validation, the transaction is marked "expired, not applied" and the user can retry with a fresh transaction (new sequence) — never blind-resubmit the same signed blob. |
| Background payment notifications | **Deferred** — Web Push requires a server to hold subscriptions and send, which §1's no-backend architecture rules out. In-app notification only for now; see §5 (2026-09-01). |
| Fiat-equivalent balance display | **Explicitly deferred**, not silently missing — no price-oracle dependency in v1. |
| Custom/failover RPC endpoints | v1 ships one hardcoded public endpoint per network plus one hardcoded backup for failover; no user-editable custom endpoint yet. *(Implemented 2026-09-01 in `lib/xrpl/networks.ts` / `client.ts`.)* |

---

## 3. Guardrails — known AI-authoring failure modes in this stack

Research-backed (React/PWA/shadcn/crypto-wallet specific, checked against current sources) rules that exist specifically because these are the mistakes an AI coding agent — including this one — is statistically likely to make on this stack if not stopped explicitly.

1. **Never fetch ledger data inside a raw `useEffect`.** This is the single most common AI-generated React bug class: it causes duplicate fetches under React StrictMode, no retry/backoff on transient RPC failures, no cache reuse, and stale-closure races. Every `account_info`/`account_lines`/`account_tx` call must go through a TanStack Query hook.
2. **Never suppress `react-hooks/exhaustive-deps`.** LLMs default to empty dependency arrays to sidestep dependency tracking; on this app that means a component can keep showing the *previous* active wallet or network after a switch. If a callback needs the "latest" value without re-running the effect, use a ref or `useEffectEvent` — never disable the lint rule.
3. **Never store secrets in `localStorage`/`sessionStorage`, React state, or any object that gets serialized.** This is a documented real-world seed-theft vector in browser-based wallets. Decrypted seed/private key material lives only in a plain JS variable/ref for the shortest possible time (long enough to sign), is stored at rest only in IndexedDB in encrypted form, and is never passed through `JSON.stringify`, Redux/Zustand devtools, URL/query params, or logged — including in development builds.
4. **Never use JS `number`/floating point for money.** XRP drops and issued-currency values must be handled as integer strings/BigInt, with conversion to a human-readable string happening only at the render boundary through one shared formatter. Floating-point drift is a top-cited LLM code-correctness bug and here it means sending the wrong amount.
5. **Never use array index as the React `key` for lists that can reorder or filter** (transaction history, trust lines). Use the transaction hash or `currency+issuer` instead — index-as-key is a common LLM default and causes row state to stick to the wrong item after a list update, e.g. after switching wallets or networks.
6. **Service worker must never cache RPC/ledger responses.** Balance, trust-line, and transaction data are network-first, no-cache; only the static app shell is cache-first/precached. Increment the cache version on every deploy and purge old caches on `activate` — stale-cache bugs are the top cited PWA failure mode and here they'd render a wrong balance.
7. **Logout/wallet removal must fully tear down state**, including the service worker cache and the TanStack Query cache — leaving a warm cache after "logout" is a documented shared-device PWA vulnerability.
8. **Never let an AI agent blindly re-run the shadcn CLI over a customized primitive.** shadcn components are copied into the repo specifically so we can edit them; a regenerate/overwrite without diffing silently reverts intentional customizations (a documented shadcn/AI-agent failure mode).
9. **Never let a bespoke crypto component silently drop accessibility.** AI-written compositions on top of shadcn primitives are known to lose ARIA attributes and keyboard focus handling once a primitive is wrapped (e.g. a custom `<AmountInput>` built on `<Input>`). Every bespoke component gets a keyboard-only + screen-reader pass before merge, not as deferred polish.
10. **No third-party script may be capable of observing the unlock/seed screens.** Analytics, session-replay, and verbose error-reporting SDKs must be explicitly denied on any screen that touches key material — this is the same root cause behind the real-world LLM-router credential-leak incidents that motivated this rule.

---

## 4. Enforced patterns / harness (always — no exceptions)

- **All ledger reads go through TanStack Query hooks.** No component calls the XRPL client's read methods directly inside a `useEffect` or event handler.
- **Money is strings/BigInt end-to-end.** No `Number()`/floating-point arithmetic on drops or issued-currency amounts anywhere outside the single shared formatting utility used at render time.
- **Active wallet + active network are one global source of truth**, never duplicated into separate component-local state. Every TanStack Query key includes both, so a switch of either can never leave stale cross-wallet or cross-network data on screen.
- **No secret ever enters React/store state, the URL, or anything serializable.** Decrypted key material exists only transiently in memory for signing, and is cleared immediately after use.
- **Every destructive/irreversible action requires an explicit confirm step** stating the exact consequence in plain language: removing a wallet, closing a trust line, revealing a seed, sending a payment.
- **Every address or transaction hash renders through the shared `<AddressLink>`/`<TxLink>` components**, never a hand-rolled `<a href>` to an explorer.
- **Every new bespoke crypto component ships with a keyboard-navigation and screen-reader pass before merge.**
- **Service worker is network-first for all ledger/RPC traffic, versioned and purged on deploy, and fully torn down (cache + query cache) on wallet removal or logout.**
- **shadcn primitives are edited in place (`components/ui/*`) for global style changes** — never overridden ad hoc with conflicting Tailwind classes at each call site.
- **An unlock method is never trusted just because it produced *a* key.** Deriving a key from a PIN or passkey assertion always succeeds, even for wrong input — the only real check is whether that key can actually decrypt/unwrap known ciphertext (AES-GCM's auth tag fails on a wrong key). Caught live during testnet validation: the first implementation let any PIN "unlock" the app, and separately let the PIN and passkey each derive their own unverified key instead of unwrapping one shared master key — meaning only whichever method encrypted the seed could ever really work. Fixed by generating one random master key at setup, wrapping it once per configured unlock method, and having `unlockVault` unwrap (not just derive) on every attempt. Any new unlock/auth method must follow this same wrap/unwrap pattern, never a bare "derive and trust" shortcut.

---

## 5. Decisions made during the 2026-09-01 bug-fix sprints

These resolve contradictions and gaps surfaced by the systematic review of the
implementation against §2–§4. Each was decided rather than left open, so the
doc and the code no longer disagree.

### 5.1 Background auto-lock: immediate on mobile, 30s grace on desktop

**Decision.** Backgrounding locks the wallet immediately on touch/mobile
devices, and after a 30-second grace window on desktop. Detected via
`matchMedia('(pointer: coarse)')`, not user-agent sniffing.

**Why.** §2 originally said "immediate lock on app backgrounding on mobile",
while `useAutoLock` applied a 30-second grace window everywhere. The grace
window existed for a real, documented UX bug: locking on every
`visibilitychange` meant alt-tabbing on desktop logged the user out. Both
positions were right about their own platform — the qualifier "on mobile" was
in the original decision and had simply been implemented platform-blind.
Backgrounding on mobile usually means the device left the user's hands, which
is exactly the handover risk the rule protects against; the alt-tab pattern
that motivated the grace window barely exists there. The inactivity timer
still runs in both cases, so a long desktop backgrounding locks anyway.

### 5.2 Web Push for incoming payments: explicitly deferred

**Decision.** Not shipped. Incoming payments raise an in-app notification
only. Recorded as deferred, in the same way fiat-equivalent display is —
never silently missing.

**Why.** §2 promised opt-in Web Push when the PWA isn't foregrounded, but
that is not implementable under §1's architecture: Web Push requires a server
to store push subscriptions and send them, and this app has no backend — "the
ledger is the only backend." The two decisions were in direct conflict.
Adding a push service would be a substantially larger architectural change
than a bug fix, and one that undoes a deliberate self-custody property (no
server learns which addresses a user watches). The Notifications API was
considered as a middle path but rejected: it only fires while the tab is
alive, so it does not deliver what the decision actually promised, while
implying that it does. Revisit only if a backend is introduced for other
reasons.

**Consequence to keep in mind:** `ReceiveTab` tells users to keep the app open
to be notified. That instruction is now correct rather than a workaround.

### 5.3 App state persists to IndexedDB, not localStorage

**Decision.** The zustand `persist` store uses an IndexedDB-backed adapter.

**Why.** §1 specifies "IndexedDB for encrypted key material and app state";
zustand's default is localStorage, so the persisted network/wallet-metadata/
address-book/auto-lock state was landing in the wrong store. The payload is
non-secret, so this was never a guardrail #3 breach — but keeping every
persisted byte in one store means teardown has a single place to clear, and
nothing app-related is left behind in localStorage on a shared device.

### 5.4 Pre-flight ledger reads go through `queryClient.fetchQuery`

**Decision.** One-shot imperative reads inside a submit handler (the
disabled-master-key probe before an import) use
`fetchAccountStateOnce(queryClient, ...)`, sharing the same cache key as
`useAccountState`, rather than calling the XRPL client directly.

**Why.** §4 bans read methods "inside a `useEffect` or event handler". A
pre-flight check genuinely is imperative and can't be a declarative hook — it
must run at submit time and block. `fetchQuery` resolves the tension: it stays
imperative while keeping the retry policy and cache reuse the guardrail exists
to guarantee, and it shares one cache entry with the UI so the probe and the
displayed account state can never disagree.

### 5.5 `tec*` results are reported distinctly from `tef*`/`tem*`

**Decision.** `SubmitOutcome` gained a `claimed` status for `tec*` codes,
surfaced to the user as "the network fee was still charged."

**Why.** A `tec` result means the transaction **is in a validated ledger** and
consumed its fee, while `tef`/`tem` mean it never applied and cost nothing.
Collapsing both into "failed" meant a user could be charged without being
told.

### 5.6 Holder trust lines are created with `tfSetNoRipple`

**Decision.** `submitTrustSet` sets `tfSetNoRipple`.

**Why.** Rippling is an issuer behaviour. Without NoRipple on the holder side,
a holder's balance can shift as a side effect of unrelated payments between
other parties — an unexpected-balance-change vector for a self-custody wallet.

### 5.7 Reserve figures: the repo docs are authoritative

**Decision.** Base reserve 1 XRP / owner reserve 0.2 XRP, as stated in
`docs/user-stories/INDEX.md`. Code reads live values from `server_state`
regardless and must keep doing so.

**Why.** The `xrpl-dev` skill's `SKILL.md` states 10 XRP / 2 XRP — stale
pre-2024 values, contradicted by that same skill's own `client-sdk.md`. Noted
here so the discrepancy isn't "rediscovered" and filed as a bug again.

---

## 6. Decisions made during the 2026-09-01 interface sprints

These resolve the open questions raised by the cross-discipline interface
review (accessibility, layout, writing, typography, colors, UI polish) recorded
in `docs/sprints/interface-sprints.md`. As in §5, each was decided rather than
left open. The review's own rule was that a failing color pair is *reported*,
not silently repainted — so every value below is a deliberate choice with its
measurement recorded next to it.

### 6.1 Dark mode ships, switched by `prefers-color-scheme` only

**Decision.** The dark palette is reachable, via
`@media (prefers-color-scheme: dark)` on `:root`. There is no theme toggle, no
`.dark` class and no persisted theme preference.

**Why.** A complete 24-token `.dark` block already existed but nothing ever
applied the class, so the entire theme was dead code — and it was hiding two
real failures (the destructive badge label at 2.77:1, the focus ring at
1.87:1) that would have shipped broken the day someone added a toggle. Of the
two honest options, wiring it up costs almost nothing: Tailwind v4's `dark:`
variant already resolves to that media query, and no component in this repo
uses a `dark:` utility — the whole palette is token-driven — so honouring the
OS preference needed no new UI, no new state and nothing persisted. A toggle
would have meant new persisted state, a hydration path and the transition
suppression that a theme flip requires; none of that buys a self-custody
wallet anything the OS setting doesn't already express. One switching
mechanism, per the "never both" rule.

### 6.2 Fill tokens and text tokens are separate roles

**Decision.** `--destructive` / `--warning` / `--success` are **fill** tokens,
only ever used as a background paired with their own `-foreground` label. Text
in those colors uses the new `--text-destructive` / `--text-warning` /
`--text-success` tokens. No component may use a fill token as a text color.

**Why.** The fills pass in their own role (`bg-warning text-warning-foreground`
measures 9.23:1) but fail badly as text on a page or card, because nothing had
ever measured that pairing: `text-warning` on a card measured **2.15:1**,
`text-success` **3.71:1**, and `text-destructive` on the tinted
`bg-destructive/10` alert surface **3.99:1** — all against a 4.5:1 floor. The
worst of them carried the warning that a displayed payment amount is only an
upper bound. Borrowing a token because its value looks right is the failure
mode; the fix is a token for the missing role.

Each text token keeps its fill's hue and drops lightness (and, for amber,
chroma) until it clears 4.5:1 on **both** the card surface and the tinted `/10`
alert surface, with margin:

| Token | Light | Dark | Tightest measured pair |
|---|---|---|---|
| `--text-destructive` | `oklch(0.537 0.219 27.325)` | `oklch(0.669 0.191 22.216)` | 4.80:1 on `destructive/10` |
| `--text-warning` | `oklch(0.54 0.116 70.08)` | `oklch(0.663 0.142 70.08)` | 4.80:1 on `warning/10` |
| `--text-success` | `oklch(0.538 0.15 145)` | `oklch(0.599 0.15 145)` | 4.79:1 on card |

Two fill tokens changed as well, both caught by measurement rather than by eye:

- **`--success` (light)** darkened from `oklch(0.6 …)` to `oklch(0.525 0.15 145)`.
  Its near-white label measured **3.55:1**. Now 4.85:1. This is the "Success"
  badge on every validated transaction.
- **`--destructive-foreground` (dark)** flipped from near-white to
  `oklch(0.145 0 0)`. White on the dark-mode salmon fill measured **2.77:1**;
  dark-on-fill measures 6.84:1, and matches how `--warning-foreground` already
  worked.

**Enforced by `bun run check:contrast`** (`scripts/check-contrast.mjs`), which
parses the tokens out of `src/index.css`, measures every pair the app renders
in both themes — including the `/10` and `/40` alpha composites — and exits
non-zero on any failure. It is the harness for this rule; contrast failures are
invisible to `tsc` and to oxlint, and this class of bug was originally found
only by measuring by hand. It caught the `--success` failure above during the
sprint itself.

Two inherited shadcn fills (`--destructive`, `--warning`) sit marginally
outside sRGB and are clamped by the browser. That is left alone: it renders
more vividly on a P3 display, and every ratio is measured on the clamped
value, i.e. the worst case.

### 6.3 The focus indicator is the browser's, not ours

**Decision.** Nothing in this repo styles `:focus` or `:focus-visible`.
`outline-none` is banned, and the global `* { outline-ring/50 }` rule is gone.
`--ring` is retained only so a future shadcn primitive that references it is
correct, and is held at a value that clears 3:1 on every app surface.

**Why.** The base layer recolored the user-agent ring to `--ring` at 50%
opacity and the primitives then set `outline-none` plus a `ring-2` shadow,
making that the only indicator. Measured against the surfaces it actually drew
on: **1.54:1** on card, **1.52:1** on `bg-muted/40`, **1.50:1** on a warning
alert, **1.49:1** on the tab strip — against the 3:1 WCAG 2.4.11 floor. On the
amber alert it was not merely low-contrast but invisible in a screenshot. Every
keyboard-reachable control in the app was affected, which is as systemic as an
accessibility defect gets.

The platform ring was the cheapest correct fix and the most robust one, and the
mechanism matters: Chrome's `outline: auto` draws a **two-tone** ring. Measured
on the previously-invisible case (a Button on the amber warning alert), the
light outer stroke `rgb(168 199 250)` is only 1.59:1 against that surface — but
its dark companion stroke `rgb(52 58 68)` measures **10.60:1** against the
surface and 6.66:1 against the light stroke. The indicator as a whole therefore
clears 3:1 on a surface where no single flat colour reliably would. That is the
property a custom one-colour ring cannot have, and it is why the fix is "use
the platform" rather than "pick a better ring colour": a custom ring has to be
re-measured against every surface it can ever land on, and this app draws
controls on white, `bg-muted/40`, `bg-muted` and two tinted alert surfaces. A custom ring would have to be
re-measured against every surface it can land on, forever. Guardrail #9 already
required a keyboard and screen-reader pass on every bespoke crypto component;
this failure was in the *generic* primitives, which that rule does not name —
so the rule now reads: **no component, generic or bespoke, suppresses or
recolors the platform focus indicator.**

### 6.4 Card titles are headings; controls are never hidden to convey state

**Decision.** `CardTitle` renders an `<h2>` by default, with an `as` prop for
the level that fits the surrounding document. Every screen has exactly one
`<h1>`. `Main` carries a "Skip to content" link as its first focusable element.
A control that is temporarily unavailable is rendered `aria-disabled` with its
reason in visible text — never omitted.

**Why.** Two failures with one shape: structure that existed visually but not
semantically. `CardTitle` rendered a `<div>`, so the accessibility tree for the
whole main app contained **zero headings** — "XRP Balance", "Tokens", "Trust
Lines", "Security" were all `generic`, leaving a screen-reader user no outline
to navigate six tabs of wallet data by, and no way past the header's two
selects on every tab.

The trust-line Close control was the same mistake in miniature: the call site
passed `onRemove` only when the balance was zero, so a user holding a token saw
no Close button and no explanation, while the component's own `title`
explaining why sat in unreachable dead code (and `title` on a `disabled`
button is unreachable regardless). Hiding a control does not communicate why it
is unavailable.

### 6.5 Errors never auto-dismiss, and state changes are announced

**Decision.** All notifications go through `src/lib/notify.tsx`. Errors and
warnings persist until dismissed; successes and info auto-dismiss. Any state
change carried by an icon swap also changes the control's accessible name and
is announced in a polite live region.

**Why.** `grep` found no `aria-live`, `role="status"` or `aria-expanded`
anywhere in `src`. The original toast provider's 4-second default was
unoverridden, so an unlock failure, a failed faucet request, and a `tec*` "the
network fee was still charged" result — none of which have any inline
equivalent — were shown for four seconds and then gone, which is less time
than a screen reader may need to finish announcing them. On a wallet, "your
fee was taken and the payment did not apply" is not a message that should
expire on a timer.

The rule lives in `notify.tsx`, per type, because the per-type duration is a
product decision independent of whatever renders the notice — it held even
while the renderer was a third-party toast library (see §9 for the S16
annunciator rework that replaced it) and would hold again if the renderer
changed a second time. Errors and warnings never expiring is enforced by
having no auto-dismiss timer scheduled for them at all
(`src/lib/notify.tsx`), rather than by any provider-level "don't auto-dismiss"
flag — there is nothing to disable.

### 6.6 Truncated values are reachable without a pointer

**Decision.** `AddressLink` / `TxLink` expose the full address or hash through
the shared `Tooltip` primitive, not a `title` attribute. A value shown in full
gets no tooltip.

**Why.** `title` never fires for keyboard or touch users, and checking a full
address character by character is the entire point of those rows
(`block-explorer-links.md` US-1) — it is the wallet's own cross-check
affordance. `TooltipProvider` was already mounted in `App.tsx`, so this reused
what the project had rather than adding anything. Radix exposes tooltip content
via `aria-describedby`, so the full value now reaches a screen reader too.

### 6.7 Mainnet is flagged as real funds, not as danger

**Decision.** The header shows the network once, in the Select. The badge
beside it renders **only on Mainnet**, as `variant="warning"`, reading "Real
funds".

**Why.** The header previously showed the network twice — a badge rendering the
raw store value (`testnet`) directly beside a Select rendering `Testnet`, in
two different casings. Deduplicating it raised the question of what the badge
was for, and the honest answer is not "which network" (the Select says that)
but "this one spends real money". The old `destructive` styling had it
backwards: Mainnet is the normal production network, and painting it in the
danger hue while the fake-money network got neutral grey inverted the meaning
of the app's own semantic colors. `warning` is what a caution is for.

### 6.8 Six equal tab columns only where six labels fit

**Decision.** `TabsList` scrolls horizontally below the `sm` breakpoint and
uses six equal columns from `sm` up. The responsive behaviour lives in the
primitive, not in a call-site override.

**Why.** `grid-cols-6` at 320px gave each trigger 47px for labels needing up to
52px, and with `whitespace-nowrap` and `overflow: visible` the text spilled out
of its own pill and collided with its neighbours — the app's only navigation,
illegible, on the narrowest supported viewport. Shortening the labels would
have deferred the same failure to the next locale. Per §4 ("primitives are
edited in place … never overridden ad hoc with conflicting Tailwind classes at
each call site"), the fix belongs in `tabs.tsx`; `Main` now passes only the
responsive column hint.

### 6.9 Dialogs are bounded by the viewport

**Decision.** `DialogContent` carries `max-h-[calc(100%-2rem)]`,
`overflow-y-auto`, `overscroll-contain` and `w-[calc(100%-2rem)]`.

**Why.** The local copy had dropped the height and width constraints upstream
shadcn carries, computing `max-height: none` and `overflow-y: visible`. At 200%
zoom on a 1280×720 screen, the Add-trust-line dialog showing two ordinary
validation errors put its title at −8px, its close button at −16px and its
"Create trust line" submit 8px below the fold, with neither the dialog nor the
page scrollable — both the confirm and the dismiss unreachable by pointer.
`w-full` also made every dialog full-bleed below 512px.

This is exactly the drift guardrail #8 predicts, arriving from the opposite
direction: not a CLI regenerate overwriting local edits, but local edits
quietly losing upstream behaviour. **Corollary added to guardrail #8:** when a
`components/ui/*` primitive is edited, diff it against upstream and record what
was intentionally dropped — an unexplained omission is indistinguishable from
a mistake.

### 6.10 Declared motion must actually exist

**Decision.** The inert `animate-in` / `fade-in-0` / `zoom-in-95` /
`animate-out` / `zoom-out-95` classes are deleted from `dialog.tsx` and
`tooltip.tsx`. If animation is wanted later it arrives as its own change, with
a `prefers-reduced-motion` guard.

**Why.** Neither `tailwindcss-animate` nor `tw-animate-css` is a dependency or
imported by `index.css`, so every one of those utilities resolved to nothing —
dialogs and tooltips had no animation at all. Deleting dead classes is the
cheapest fix available; installing the dependency is the most expensive one,
and it would have switched on unguarded zoom and scale motion in an app with no
`prefers-reduced-motion` guard anywhere in `src`. The cheap fix is also the
safe one.

### 6.11 Money that changes uses tabular figures

**Decision.** Any rendered amount that can change in place carries
`tabular-nums`.

**Why.** Proportional digits have different widths, so the headline balance
shifted on every live account update and on faucet funding. Cheap, and it is
the property that exists for exactly this.

### 6.12 Header and row actions wrap rather than compress

**Decision.** The app header puts its controls on their own row below the title
below the `sm` breakpoint, and the Settings wallet-row actions wrap. Neither
compresses to fit.

**Why.** Found during verification of §6.8, not in the review — the review's
test wallet was the only one on the device, and the header's wallet selector
only renders when `wallets.length > 1`. With a second wallet present the header
row becomes title + 160px + 112px + 36px, which does not fit 320px: the two
selects were crushed together and the lock button was clipped off the right
edge. The Settings wallet rows failed the same way, with three action buttons
("Use this wallet", "Reveal seed", "Remove") on one non-wrapping line
overflowing to 406px.

Same escalation class as §6.8 (a control clipped at a supported viewport), and
worth recording as a lesson about the verification itself: **a
multi-wallet-capable UI has to be checked with more than one wallet.** Several
conditional surfaces only render past a state threshold — the wallet selector
at two wallets, the zero-balance trust-line notice, the "Load more" history
control — and a single-wallet, unfunded test account renders none of them.
`docs/sprints/interface-sprints.md` now carries this as a standing verification
prerequisite.

---

## 7. Decisions made during the 2026-09-01 visual-world replacement

The interface up to §6 was the default shadcn surface with an accessibility
retrofit: every neutral was `oklch(… 0 0)`, no typeface was declared, and the
name, theme colour and marks were placeholders the product owner confirmed were
not binding. This section records the replacement world and the decisions it
forced. Its durable strategy lives in
`.impeccable/surfaces/src-pages-main-tsx.md` (direction contract, seed
`62c39974`); the rules below are the parts that constrain future code.

### 7.1 The world is a bench instrument panel

**Decision.** The wallet is a measurement instrument for one account: a chassis
(the page), engraved legend plates (cards), an inset readout well (the balance),
and indicator lamps for state. Surfaces are built from `.panel-plate`,
`.panel-well`, `.panel-legend`, `.panel-lamp` and `.panel-scribe` in
`src/index.css`, never from ad-hoc borders.

**Why.** The dominant job is "check what I hold right now", which is reading an
instrument. It also refuses all four failure modes the owner named: it cannot
read as crypto-hype, it puts nothing decorative near the numbers, it is not
generic SaaS, and it is built on the measured token layer rather than around it.

**Consequence.** A legend is small and cut; the *value* carries the scale. That
inversion is deliberate — `CardTitle` renders as an engraved placard, not a
display heading — and must not be "fixed" back to a large title.

### 7.2 Six functions in two rows of three below `sm` — supersedes §6.8

**Decision.** `TabsList` (`variant="nav"`) is a 3-column grid below `sm` and a
6-column grid from `sm` up. It no longer scrolls horizontally.

**Why.** §6.8 chose a scrolling strip because six equal columns at 320px gave
each label 47px where it needed 52. That arithmetic was right, but it only ever
compared six columns against a scroll; two rows of three gives each label ~99px
at 320px with no truncation. Under the scrolling strip, two of six functions sat
off-screen with no affordance at both 320px and 390px — on a scene the owner
called co-primary with desktop. §6.8's own goal (never shorten the labels, never
clip a trigger) is better served by wrapping than by scrolling. A keypad of
function keys is also more native to §7.1's world than a scrolling strip.

`variant="inline"` remains for compact filter rows (History's sent/received),
which are a different control and must not stretch to six columns.

### 7.3 Saturated fill is reserved for the moment of commitment

**Decision.** Three levels, and no component may blur them:
- **`--commit`** (hue 42) appears on exactly one control class — the one that
  moves funds. One `Button` variant, one call site. Never on navigation, never
  as a decorative "primary".
- **`destructive` fill** is the confirm button *inside* a dialog. A control that
  merely opens that dialog uses the new **`danger`** variant: plate ground,
  destructive border and text.
- **Alerts are plates with lamps, not washed regions.** No variant tints its
  whole field.

**Why.** The reservation is only worth having if it is singular. Measured
against the built screens it was not: the Settings plate carried four saturated
red fills including a full-bleed bar louder than the commit key ever gets, and
the send-confirm frame put two amber alert washes (hue 72) beside the hue-42
commit key, turning a reserved signal into a warm family at the exact moment it
had to be unmistakable. Live state (`frozen by issuer`, `active`) is a **lamp
plus its word**, per the rule already written in `badge.tsx`: a stamped fill is
for a fixed label, a lamp is for state.

Nothing here rests on colour alone — every lamp is paired with visible text.

### 7.4 `--input` is a measured control boundary; `--border` is not

**Decision.** `--input` is held to WCAG 1.4.11 at **3:1** against both the plate
and the chassis, and is measured in both themes. `--border` is a scribed rule
between regions — decorative structure — and is measured only against a **1.5:1
visibility floor**, explicitly labelled in the harness as not a 1.4.11
requirement.

**Why.** The distinction is real: 1.4.11 covers boundaries that *identify a
control*, not dividers. Collapsing the two would either under-protect fields or
cage the panel in heavy rules. Splitting them exposed a pre-existing defect —
`--input` was `oklch(0.922 0 0)` on white, about **1.2:1**, so every text field
in the app had an effectively invisible boundary and had been failing 1.4.11
since before this redesign.

### 7.5 The contrast harness covers every new token

**Decision.** `scripts/check-contrast.mjs` grew from 15 to **25 pairs per
theme** (50 total). New pairs: the commit key's label and its non-text contrast
against the page, the readout well's numerals and scale marks (measured in
*both* themes, since the well is dark in both), the control boundary against
both grounds, the secondary key label, muted helper text on the page, and
`text-success` on its tinted surface.

**Why.** §6.2 made the harness the enforcement mechanism for colour. A new token
that the harness does not measure is a token outside the rule — and the most
consequential control in the app (the one that spends) would have been the
unmeasured one. Adding a token to `index.css` without adding its pairs here is
incomplete work.

### 7.6 Network is a positional range selector, not a dropdown

**Decision.** `NetworkSelector` is a `radiogroup` showing both positions at
rest, used in both the header and Settings. No combobox.

**Why.** A panel sets a mode with a switch whose positions are all visible. Here
that is not only stylistic: the two positions differ by *whether the money is
real*, and a dropdown hides both the current setting and the alternative behind
a click. Selection is carried by `aria-checked` and by fill, never by fill alone.

### 7.7 The `<h1>` names the screen, not the product

**Decision.** Each tab panel renders its own visually-hidden `<h1>`; the header's
product name is a `<span>`. Radix unmounts inactive `TabsContent`, so exactly
one `<h1>` exists at a time, satisfying §6.4.

**Why.** With the constant product name as the `<h1>`, the accessibility outline
was identical on all six tabs and never said where the user was — the same class
of defect §6.4 fixed for card titles, one level up. The heading is hidden
because the selected tab already states the screen visually with
`aria-selected`; the outline needs the node, the eye does not.

### 7.8 Light and dark are two materials, not one hue at two lightnesses

**Decision.** Light is pale lab enamel at **hue 250**; dark is rack steel at
**hue 125**, each with its own chroma ramp. Both keep the same physical model
(plate lighter than chassis, well darker than both) and the readout well is dark
in *both*.

**Why.** §6.1 ships dark via `prefers-color-scheme` only, and the owner uses
phone and desktop equally, so neither theme is a courtesy. Rendering dark as the
light hue at lower lightness produced the blue-black slate every dark UI ships
and made the two finishes one palette inverted. Two hues make them two
materials. Keeping the well dark in both is what stops the light finish from
being a washed-out inversion: the balance anchors the panel either way.

### 7.9 Faces are self-hosted, and no token may be chroma-zero

**Decision.** Barlow Semi Condensed (legends) and Azeret Mono (all numerals,
addresses, hashes) are self-hosted from `src/fonts/` with `font-display: block`,
and `woff2` is in the service worker's precache glob. No token in `index.css`
uses zero chroma.

**Why.** A font CDN is a third party on screens that touch key material
(guardrail #10) and a network dependency for an app whose shell must work
offline; `swap` would flash a fallback across a balance readout. Monospace here
is for measurement and comparison — the address cross-check of
`block-explorer-links.md` US-1 — not as a costume for "technical". Chroma-zero
grey is the one thing no real panel is made of, and it was the incumbent
surface's actual signature.

---

## 8. Decisions made during the 2026-09-02 CI/CD sprints (S13–S15)

Plan: `docs/sprints/cicd-sprints.md`. This section is the one S15 was explicitly
blocked on: it records what the trust model actually becomes once a CDN sits in
the delivery path, and what does **not** get mitigated. Every decision below was
taken by the implementing agent under a standing instruction to decide rather
than ask; each states its reasoning so it can be overturned on the merits.

### 8.1 The licence is `FSL-1.1-ALv2`, and the project is not open source

**Decision.** Functional Source License 1.1 with an Apache 2.0 future licence,
copyright `2026 otaviootavio`. Source is public and readable; competing
commercial use is restricted for two years, after which each released version
converts to Apache 2.0 automatically, with no action required from the licensor.

**Why.** It preserves the one property this product depends on — anyone may read
and rebuild the source to verify what is served (`app-versioning-and-updates.md`
US-7) — while restricting commercial substitution. FSL is the narrowed successor
to the Business Source License, with a fixed two-year conversion and no
per-adopter "Additional Use Grant", which is BSL's main criticism.

**Consequence, enforced in writing.** FSL is **not** OSI-approved. No project
material may call this "open source" — not the README, the repo description, a
code comment, or UI copy. `package.json` carries
`"license": "SEE LICENSE IN LICENSE.md"` because FSL has no SPDX identifier and
inventing one would be a false claim in machine-readable metadata.

**Accepted cost.** A non-OSI licence can reduce trust and contribution in the
wallet space specifically, where "fork it freely" is part of how projects earn
confidence. That is a real cost of this choice, not an oversight.

### 8.2 The name is `XRPL Bench`

**Decision.** Product `XRPL Bench`, repository and package `xrpl-bench`.

**Why.** The visual world in `DESIGN.md` is a bench instrument panel and the
product's job is reading an instrument, so the name and the identity now say the
same thing — `PRODUCT.md` had recorded a placeholder name as the missing piece.
The suggested alternative `open-xrpl-wallet` was rejected: with a
source-available licence, "open" in the name asserts a property the project does
not have. Verified unclaimed before adoption (no GitHub repo, npm 404).

### 8.3 Publication is the point of no return, and it goes last

**Decision.** The repository is created **private**, fully wired and proven, and
made public as the final act of S13. `LICENSE.md` is in the **root commit**.

**Why.** Publishing is irreversible in a way pushing is not: every commit
reachable from any pushed ref becomes permanently public, and `--visibility
private` afterwards hides a URL without unmaking clones, forks, caches or search
indexes. The original plan had `gh repo create --public` as its second task,
which would have published at the moment of maximum uncertainty.

"LICENSE in the commit that publishes" was the right instinct in the wrong units
— commits are local, publication is a visibility change. The correct formulation
is that the licence must be present in every commit reachable at the moment of
the flip, which is guaranteed by putting it in the root commit. Otherwise a
shallow clone taken in between carries no grant at all.

**Corollary — history is write-once while private.** The flip publishes the whole
history at once, so a file committed and later deleted is still a public blob
afterwards. Anything sensitive or junk that lands must be removed by re-init and
force-push *before* the flip, never "cleaned up later".

### 8.4 Branches are `dev` → `stage` → `prod`, with `prod` as default

**Decision.** Three branches, promoted in one direction, no `main`. `prod` is the
repository's default branch.

**Why `prod` is default.** For a publicly verifiable wallet, a visitor — or
anyone checking a release against what the CDN actually serves — should land on
the code that is deployed, not on integration work. The cost is that
contributors must retarget PRs to `dev`, which the README and PR template state
explicitly.

**A finding that changed the implementation:** GitHub rulesets have **no
source-branch rule**, so "changes to `prod` must arrive from `stage`" cannot be
expressed as protection. It is a required CI check that fails when
`base_ref == prod && head_ref != stage`. Related: `gh ruleset` is read-only, so
rulesets are created through `gh api --method POST`.

Branch protection is also **not enforced on private repositories on the Free
plan**, so S14's verification is only meaningful after the flip in 8.3.

### 8.5 The lint gate is `--deny-warnings` plus inline, justified exemptions

**Decision.** `bun run lint` is
`oxlint --deny-warnings --report-unused-disable-directives`. The four
pre-existing `react(only-export-components)` warnings carry an inline
`oxlint-disable-next-line` with a written reason at each site.

**Why.** `bun run lint` previously exited **0** despite four warnings, so as a CI
gate it was weaker than it looked — warnings could accumulate indefinitely
without ever failing a build. Of the alternatives: `--max-warnings=4` pins a
*count* rather than identities, so fixing one and introducing a real one keeps
the gate green — a lie that looks like a gate. Disabling the rule in
`.oxlintrc.json` kills the signal for genuinely bad future exports in those same
files. Inline directives keep the justification at the site, and
`--report-unused-disable-directives` makes a stale exemption a hard error, so
the exemptions cannot rot.

The flags live in `package.json`, not only in the workflow, so local and CI run
the identical command — otherwise "green locally, red in CI" is designed in.

**Implementation note worth keeping:** `oxlint-disable-next-line` applies to the
literal next line, so a multi-line reason comment placed *above* the directive
silently targets a comment instead of the code. The directive must be the last
line before the statement, with the reason above it. The first attempt got this
wrong and the harness caught it — the rule still reported *and* the directive
reported unused.

### 8.6 The build is reproducible, verified rather than assumed

**Decision.** Verified 2026-09-02: two clean builds of the same tree produce
byte-identical output across all 17 emitted files.

**Why it matters.** The deploy workflow rebuilds rather than reusing CI's `dist`,
which means **the deployed artifact is not the artifact that passed the gates**.
That is only defensible because the build is reproducible, and nobody had
checked. Had it failed, US-7's verifiability story would have been unshippable
and the deploy design would have needed reworking — which is why this was
verified in S13 rather than discovered in S15. Re-run it whenever the bundler,
its plugins, or the Bun version change.

### 8.7 `bunny sites` provides no cache-header control; headers are a deploy gate

**Decision.** Cache headers are configured through the raw bunny API, committed
as `infra/pullzone-edgerules.json`, and **asserted by a deploy-blocking check**
(`scripts/verify-headers.mjs`) rather than trusted.

**Why.** Investigating the CLI showed the `sites` router only rewrites paths and
**sets no response headers at all**; the CLI contains no edge-rule API surface;
`bunny.jsonc`'s `sites` block is only `{name, dir, build}`; and a bunny storage
origin sends no `Cache-Control`. There is no `_headers`-style file honoured, so
this cannot be solved from inside `dist/` and `vite-plugin-pwa` cannot help.

This is slightly **worse** than guardrail #6 assumes: with no `Cache-Control`
reaching the browser at all, browsers apply *heuristic freshness* to
`index.html` — an unbounded, unspecified stale-shell window rather than a
wrong-but-known one. A stale shell on a wallet can render a wrong balance, which
is the exact failure guardrail #6 exists to prevent.

Required shape: `assets/*` long-lived and `immutable` (safe — content-hashed
filenames); `index.html`, `/`, `sw.js`, `manifest.webmanifest` and the release
manifest short-lived and **never `immutable`**.

**Unknowns, stated rather than papered over:** whether `sites` pull zones permit
edge rules at all; whether an edge-rule trigger matches the client path or the
router-rewritten `/deploys/<id>/…` path (get this wrong and the rules silently
do nothing); and whether rules survive `bunny sites deploy` and
`bunny sites upgrade-router`. All three must be settled empirically against a
staging site before production exists. **Never hand-edit the router** —
`upgrade-router` republishes the CLI's copy and would silently discard the edit.

### 8.8 `registerType: 'prompt'` ships with US-1 and US-3, or not at all

**Decision.** The service-worker switch, the build stamp (US-1) and the explicit
*Install update* control (US-3) land as one change, before the first deploy to
any origin a human can install from — staging included.

**Why the bundle.** `registerType: 'prompt'` alone only stops the generated
registration calling `skipWaiting()`. With nothing in the UI surfacing the
waiting worker, the wallet would have **no update path at all** — permanently
pinned to its first release with no way to receive a security fix. Shipping the
switch alone would therefore be worse than leaving `autoUpdate`.

**Why before any deploy.** Once an `autoUpdate` build is installed on a real
device, that device silently replaces its shell on the next visit — including
with the very build that introduces `prompt`. The trust property is violated
once, unrecoverably, for those installs. Staging is a public unauthenticated URL,
so it counts.

The highest-priority follow-up is **US-5** — no update while a transaction is in
flight — because a reload between signing and learning the outcome loses the
client's view of a result that is nevertheless real on the ledger.

### 8.9 Release metadata is served from the app's own origin

**Decision.** A static JSON manifest on the app origin, not the GitHub Releases
API.

**Why.** A check against GitHub would tell a third party when someone is running
this wallet, contradicting "nothing leaves the device", and would break wherever
GitHub is blocked. Metadata from the app origin adds **no new trust assumption**,
because the origin is already trusted for the code itself.

### 8.10 The trust model once a CDN is in the path — and what is not mitigated

This is the honest accounting `PRODUCT.md`'s "no backend exists to compromise"
requires once the app is served from a CDN.

**What changes.** A CDN origin plus a deploy pipeline *is* a backend in the only
sense that matters: whoever controls either controls the signing code, and the
browser will run it. `BUNNYNET_API_KEY` in GitHub Actions is therefore
key-custody-adjacent infrastructure, not deployment plumbing.

**What is mitigated.**
- Updates are user-controlled (8.8), so a compromised origin cannot silently
  substitute signing code — substitution becomes an event the user must accept.
- The source is public and the build is reproducible (8.6), with per-release
  asset hashes, so a served bundle can be independently checked against a tagged
  source by a third party.
- Cache headers are asserted, not assumed (8.7), so a stale shell is a failed
  deploy rather than a silent wrong balance.

**What is NOT mitigated. Stated plainly, because pretending otherwise is worse
than the risk.**
1. **A user who accepts an update without checking it** gets no protection from
   any of the above. Verifiability is meaningful because a third party *can*
   check, not because every user will.
2. **Subresource Integrity does not help here.** An attacker controlling the
   origin controls `index.html` and therefore the integrity attributes
   themselves. Recent supply-chain incidents took exactly this shape, with the
   compromise at the trusted source and SRI irrelevant. SRI remains worthwhile
   for genuinely third-party subresources; it must never be presented as the
   answer to origin compromise.
3. **A leaked `BUNNYNET_API_KEY`, or a compromised GitHub account, is a full
   compromise** of the served code, bounded only by users declining the update.
4. **The software has not been audited.**

### 8.11 Accepted risk: production ships on a `*.b-cdn.net` origin

**Decision.** Both environments use free bunny subdomains. Production is
`xrpl-bench`'s own `*.b-cdn.net` hostname, accepting the migration cost below.

**The risk, in full.** IndexedDB — where the encrypted vault lives — is
**origin-scoped**. Moving production to a custom domain later is a *new origin*:
no vault, no wallets, and every user must re-import from seed. Anyone who lost
their seed backup is locked out of real funds. Worse, the old `b-cdn.net` origin
keeps serving a working-but-frozen wallet until the site is deleted, which is the
stale-shell failure arriving from a direction guardrail #6 does not cover.

**Why accepted.** The author is currently the only user and holds the seed, so
the migration is an inconvenience rather than a loss. Mandatory seed backup at
onboarding (`account-onboarding.md` US-6) is what makes it recoverable at all.

**This must be resolved before anyone else is invited to use it.** Publishing the
repository is not an invitation; publishing a URL and asking people to fund it
is. Treat "attach the final production hostname" as a prerequisite of that step,
not a later improvement.

**Also:** never install the staging site as a PWA and never put Mainnet funds in
it. It is a public, unauthenticated URL with its own origin and its own separate
vault.

### 8.12 CI shape: four independently named parallel jobs

**Decision.** `lint`, `build`, `test`, `contrast` as four parallel jobs, not one
job with four steps. Their names are a **public API**: they are the required
status checks in the rulesets, so renaming a job silently breaks protection. No
matrix for the gates, because matrix job names embed the matrix value.

**Why parallel.** Required status checks need per-gate granularity; one job means
first-failure-wins, so a second failure is only discovered after another push;
and wall-clock is bounded by the slowest job rather than their sum. On a public
repository Actions minutes are unmetered, so the repeated install costs nothing
that matters.

Everything third-party is pinned to a full commit SHA — a tag is mutable and a
compromised action would run with the deploy key. `ubuntu-24.04` is pinned for
the same reason `ubuntu-latest` is not. Workflow permissions start at
`contents: read`. No `github.event.*` value is interpolated into a `run:` block;
untrusted input passes through `env:`. `pull_request_target` is never used.

**A deliberate exception worth recording:** the `contrast` job installs nothing.
`scripts/check-contrast.mjs` imports only `node:fs`/`node:url`/`node:path` and
reads `src/index.css`, so checkout plus the preinstalled `node` is the whole job.
If a dependency is ever added to that script, this job breaks — a comment in the
workflow says so.

### 8.13 Deploy calls the pinned CLI directly, not a third-party action

**Decision.** The deploy workflow is hand-written and invokes
`bunx @bunny.net/cli@<exact version> sites deploy`. `bunny sites ci init` is used
once as a reference generator and its output is deleted, not shipped.

**Why.** The generated workflow triggers on `main` (which does not exist), bakes
in a single site name where two are needed, and references a third-party action
at a mutable ref. More fundamentally: in a threat model where whoever controls
the pipeline controls the signing code, a third-party *action* is an additional
vendor executing with `BUNNYNET_API_KEY`. The pinned CLI is one vendor, exactly
versioned, and byte-identical to the command a maintainer can run locally to
reproduce a deploy. A `bunx` dist-tag would defeat the point, so the version is
exact.

Note the environment variable is **`BUNNYNET_API_KEY`**, not `BUNNY_API_KEY`.

Rollback is `bunny sites deployments publish --previous --force`, which flips the
router's current-deploy pointer without re-uploading. It is verified on staging
*before* it is needed. `concurrency.cancel-in-progress` is **false** on deploys:
cancelling mid-upload leaves a half-written deploy directory.

---

## 9. Decisions made for the 2026-09-02 notice annunciator sprints (S16–S17)

Plan: `docs/sprints/notices-sprints.md`. Epic: `docs/user-stories/in-app-notices.md`.
Four open questions (N1–N4) blocked implementation; all four are decided here,
by the implementing agent under a standing instruction to decide rather than
ask, each with its reasoning so it can be overturned on the merits.

### 9.1 N1 — the chassis shell moves up to `App`

**Decision.** The fixed-height shell (header pinned, annunciator pinned,
content scrolling between them) is built once, as a shared `ChassisShell`
component, and used identically by `Main`, `Unlock`, and `Onboarding`. All
three screens share one notice area and one layout mechanism, even though
`Main`'s header and width differ from the other two.

**Why.** The alternative — a bespoke, smaller treatment for the two screens
outside `Main` — trades a one-time shell cost for a second, permanently
maintained notice convention. `Unlock` and `Onboarding` between them raise 8 of
the app's 27 notices (one wrong-PIN, seven onboarding-validation), and every
guarantee this epic exists to make — a notice never covers the control the
user is operating, an error persists until dismissed, arrival is announced
through a live region — has to hold on those two screens exactly as it does on
`Main`. Building that twice, once as the real annunciator and once as a smaller
stand-in, is the two-conventions-for-one-concept drift this project's own rules
warn against (`docs/agents/anti-patterns.md`), and a future notice added to
either shape would need to remember which one applies. A shared shell is more
upfront work and one coherent answer to maintain, not two.

### 9.2 N4 — the annunciator sits at the base of the chassis

**Decision.** The docked notice area is the last thing in the chassis, below
the scrolling content region, not directly under the header.

**Why.** It is the position furthest from any control a user is actively
reaching for — the commit key, a form field, a tab — so a notice arriving can
never relocate what's under the pointer or the next tab stop. It also spends
real estate the 2026-09-01 finish record already flagged as unfinished
ambition (~375px of empty chassis face below the plate row at 1440×900) rather
than opening a fifth device by compressing existing content. The tradeoff
against "under the header, closer to where the eye starts" is real but loses
at the narrowest supported viewport: 320px already carries a wrapped header
plus two rows of the six-function nav, and that is the width with the least
room to spare for a new fixed band above the fold.

### 9.3 N2 — the quiet state is genuinely blank, not a dimmed last notice

**Decision.** When there is nothing to report, the annunciator renders an
unlit plate — no lamp, no legend, no ghost of the previous notice — with no
text content in the live region. This departs from the epic's own suggested
default (holding the last notice, unlit and dimmed).

**Why.** The epic's recommendation names its own risk accurately: "a resolved
error that stays visible can read as still true." On a wallet whose entire
positioning is refusing to fabricate reassurance about money
(`PRODUCT.md` "Product Purpose"), a dimmed echo of a *dismissed* error is an
ambiguous signal precisely where this product cannot afford one — a user
glancing at the panel mid-task has no way to tell "this already happened and
was cleared" from "this is still true, just quieter." An unlit plate carries
no claim at all, which is the only quiet state consistent with §6.5's rule
that a state change also changes the accessible name: nothing changed, so
nothing is asserted. The reserved band is not "meaningless ink" while unlit —
a dark annunciator is itself the plate's normal resting state, the same way a
real instrument panel has lamps that are usually off.

### 9.4 N3 — most severe notice shown, with a count, expanding to the full list

**Decision.** With several notices outstanding, the annunciator shows the
single most severe one (error > warning > success > info) plus a count of the
others, e.g. "+2 more". Activating the count expands the region to the full
bounded list.

**Why.** Errors and warnings never auto-dismiss (§6.5), so two or three
outstanding is the ordinary case this epic has to design for, not an edge one.
The alternative — grow the region to list everything — is more honest about
volume but has no upper bound: at 320px, three persistent notices already
consume most of the viewport height, and a bad minute (a failed send, a
stuck-transaction warning, and an unrelated info toast) would eat the panel
the epic exists to protect. Severity-first with a count keeps the region's
height fixed regardless of how many notices exist, while still surfacing the
worst outstanding condition without a click — "an outstanding error is never
buried under three successes" (US-4) holds by construction, since only a more
severe notice can ever displace what's shown. The count makes the others
discoverable rather than silently dropped, and expanding preserves every
notice's own dismiss control once opened.

### 9.5 Visual verification found two real defects; both are fixed

`docs/agents/verifying-your-work.md` treats gates passing as no evidence a
visual change works. This epic's implementation session initially had no
browser tool and shipped S16/S17 as code-complete only; a later session, with
a Playwright MCP browser available, drove the actual app (`bun run dev`) end
to end — `Unlock` → reset device → every `Onboarding` step → `Main` — at
320px/1440px, both panel finishes, and a `640×400` viewport standing in for
200% zoom (chosen over CSS `zoom` on `<html>`, which scales the box model
without shrinking the viewport that `dvh` resolves against, and so doesn't
reproduce what real browser zoom does to a `dvh`-based shell). Two defects
surfaced that no gate had caught, because none of the four gates render
layout or execute a screen reader's live-region semantics:

1. **The expanded notice list was outside the `aria-live` region.**
   `Annunciator`'s live-region wrapper closed after the primary row and the
   collapsed "+N more" toggle; the expanded list of secondary notices (N3)
   was a plain sibling `<div>`. A notice arriving while already expanded
   would update the DOM without ever entering the accessibility tree's live
   region, so a screen reader would not announce it — a silent violation of
   the same §6.5 rule this epic exists to preserve. Fixed by moving the
   expanded list inside the live-region wrapper.
2. **An unbroken long string overflowed the notice plate instead of
   wrapping.** A real validation error (`"Unknown letter…Allowed:
   rpshnaf39w…"`, a 58-character base58 alphabet with no spaces) has no
   natural break opportunity; `min-w-0` on the flex parent lets the row
   shrink but does not make the text itself break, so it ran past the
   plate's right edge at 320px. Fixed by adding `break-words`
   (`overflow-wrap: anywhere`) to the message/description container.

Both are one-line fixes in `Annunciator.tsx`, recorded here rather than only
in the sprint file because they are evidence for a general point: this
epic's own gates (`lint`, `build`, `test`, `check:contrast`) all stayed green
throughout, on both the broken and the fixed version. Gates and visual
verification are not substitutes for each other.

---

## 10. Completing the app-versioning epic (2026-09-02)

Plan: `docs/user-stories/app-versioning-and-updates.md`. V1–V4 were already
decided (§9's siblings — no relation to the notices epic — were answered
2026-09-02 during S15; see the epic file itself). This section is implementation
notes for the stories S15 left unbuilt (US-2, US-4, US-5, US-6, US-8, US-9), not
new open decisions — recorded because each involved a real choice, not a
mechanical one.

**Decline is keyed by commit SHA, not the semver string.** `BUILD.commitSha` is
already the unique identifier every build carries (US-1), and it is what the
release manifest names too (`gen-release-manifest.mjs`). Keying US-4's
"remembered per version" by that instead of `pendingRelease.version` means a
re-tag or a hotfix that reuses a version number can never collide with an
earlier decline.

**Prominence (V4) reads the manifest's own `bump`/`security` fields, and
defaults to loud when the manifest can't be read.** A resolved manifest that
says `patch` and not `security` renders the quiet `default` alert variant;
anything else — `major`, `security`, or no manifest at all (offline, not yet
deployed) — renders `warning`. Understating a security fix because the network
request that would have told us otherwise happened to fail is a worse failure
than an ordinary patch looking slightly more urgent than it is.

**US-5's in-flight flag lives at the single write choke point
(`lib/xrpl/writes.ts#submitAndClassify`), not in each tab's local `busy`
state.** Radix unmounts inactive `TabsContent`, so a flag local to `SendTab`
would vanish the instant the user switched to another tab mid-send — exactly
when this guarantee matters most. `txInFlight` lives in `useAppStore` as
session-only state (never persisted, per guardrail #3's spirit even though it
carries no secret) and is set/cleared in a `try/finally` around the entire
sign-submit-await window, so a thrown error or an `expired` classification
still releases it.

**US-6 ships the mechanism, not authored changelog prose.** The manifest's
`notes` field links to the release commit, and the prominence gating above is
what "a security fix says so independently of its bump" actually cashes out
to. Writing genuine user-facing changelog copy per release is a process step
for whoever cuts a release, not something to fabricate here — inventing
plausible-sounding release notes for commits that don't yet have any would be
exactly the kind of manufactured reassurance `PRODUCT.md` refuses.

**US-8's recovery instructions live in a `<details>` in the Version card**,
not a separate doc page — the acceptance criteria are about what the
instructions say (never "clear site data") and that they're reachable, not
where they live, and Settings is already where a user goes to find out what
build they're running.

**US-9 needed no new code.** The build stamp is already baked in at build time
(US-1) and the release/SW checks are effect-driven fetches that never gate
initial render, so "startup never blocks on the update check" and "the version
shown is correct offline" were already true; this section just confirms it
rather than claiming new work.

**A gap in already-shipped US-3/US-7 surfaced during this pass and was closed
in the same change.** `gen-release-manifest.mjs` had carried a `verify` field
and per-asset hashes since S15, and `docs/decisions.md` §8.6/§8.10 had already
verified the build is reproducible — but nothing in the UI ever rendered the
link, and the link's own target (`README.md`'s `#security` anchor) did not
contain the rebuild-and-compare steps US-7's acceptance criteria requires. A
manifest field nobody links to, pointing at a page that doesn't say what it
claims to, is not "shipped" under this epic's own bar for US-3 ("a link to how
to verify the build") — so the Version card now renders that link next to
"What changed", and `README.md`'s Security section gained the four-step
rebuild/hash/compare procedure it was missing.

### 10.1 A second gap, found on re-audit: US-6's "more insistently" had no live instance

A later pass re-reading US-6's acceptance criteria word for word ("a major
release presents the update more insistently — a persistent, clearly-worded
notice — while minor and patch releases surface quietly in Settings") found
that the only bump-dependent behaviour actually shipped was a louder `Alert`
*variant* inside the Version card — `warning` instead of `default`. Both are
equally invisible to someone who has not opened Settings, and equally
reachable to someone who has. Louder colour inside a place nobody is looking
is not "more insistently" than quiet colour in that same place; the acceptance
criterion's own contrast ("while minor and patch surface quietly **in
Settings**") only makes sense if major's treatment is not confined to
Settings.

**Fixed by having `useAppUpdate` raise a real Annunciator notice** — via the
same `notify.warning` used by every other persistent notice in the app — the
moment a resolved release manifest has `bump === 'major'` or `security ===
true`. This reuses the exact surface S16/S17 built for this purpose instead of
inventing a second one, and inherits its properties for free: it is reachable
from any of the six panels, it persists until dismissed (§6.5), and it is a
real DOM text node with a tone the Annunciator already announces correctly.
Minor and patch releases raise no notice, matching "surface quietly in
Settings" exactly as written.

Two follow-on choices, both to keep this consistent with what US-4 already
promises about declining:

- **The notice is raised once per release per session, from module state, not
  component state.** `useAppUpdate` is called from both `Main` and
  `SettingsTab`; without a module-scoped guard keyed by the release's commit,
  each mounted caller would push its own copy of the same notice the instant
  both are mounted (`Main` always is, since `SettingsTab` is one of its six
  tabs).
- **Declining the update (`declineCurrent`, US-4) also dismisses the notice it
  responds to.** US-4 is explicit that a declined release must not keep
  nagging on every launch; leaving the Annunciator notice standing after the
  user has already said "Not now" in Settings would be exactly that nag,
  restated on a different surface. A *newer* release still gets its own
  notice — only the just-declined one goes quiet.

Covered by `src/hooks/__tests__/useAppUpdate.test.tsx` (four cases: major
raises a persistent warning notice, a security-marked patch raises one too,
an ordinary minor/patch release raises none, and declining dismisses the
notice it belongs to). Making the module under test importable in isolation
required extracting `virtual:pwa-register` — a Vite-plugin-only specifier the
test runner cannot resolve at all, mockable or not — behind a one-line
indirection, `src/lib/sw-register.ts`; the hook now imports `registerSW` from
there instead of the virtual module directly.

**Also corrected while re-verifying this section: the "27 call sites" figure
this document and `docs/sprints/notices-sprints.md`'s status banner both
carried for `lib/notify.tsx`'s callers was wrong.** The epic file itself
always said twenty-five (`in-app-notices.md` US-2), and a repository-wide
count of `toast.(success|error|warning|info)(` call sites outside test files
confirms twenty-five, not twenty-seven — the higher number was never checked
against the codebase when it was first written. Both documents now read
twenty-five.

### 10.2 A third gap, in US-1 itself: nothing showed the build stamp before unlock

US-1 predates this pass entirely — §8.8 shipped it in S15, and both
`CLAUDE.md` and this document's own §9/§10 headers had already been written
describing the epic as fully shipped. Re-reading its acceptance criteria
literally against the running app found one that was never true: "the same
values are reachable without unlocking the wallet, so a user can identify a
build before entering a PIN." `BUILD.version`/`shortSha`/`sourceUrl` were
rendered in exactly one place, the Version card in `SettingsTab` — and
`SettingsTab` is one of `Main`'s six tabs, reachable only after a successful
unlock. A user could not, in fact, identify a build before entering a PIN;
the acceptance criterion was written correctly and the implementation simply
never satisfied it.

**Fixed by adding a small, quiet build stamp — version and linked short SHA,
`text-xs text-muted-foreground`, nothing louder — to both pre-auth screens
that render *instead of* `Main`:** the bottom of `Unlock`'s card (directly
answering "before entering a PIN") and the bottom of `Onboarding`'s initial
choice screen (the same claim applies before a PIN exists at all, on a
device's very first launch). Deliberately not a full Version card on either
screen: the wallet is locked, or not yet set up, and nothing on those screens
should compete with the PIN field or the two setup buttons for attention —
the existing Version card already covers everything past that point. Verified
at 320px on both screens; the stamp sits clear of the card, the dashed empty
Annunciator plate, and every control.

This is the second time in this pass that re-reading an acceptance criterion
literally, against the running app rather than against a status table, found
a real gap a "shipped" label had missed (§10.1 was the first, for US-6). The
pattern across both: a document said a story was done, and the code came
close enough that nothing else caught it — no gate fails on a criterion it
was never written to check, and no amount of re-reading the *decision record*
substitutes for re-reading the *acceptance criteria* against what actually
renders.
