# Reconcile — `docs/decisions.md` against `ARCHITECTURE-SPINE.md`

Date: 2026-09-15. Input: `/home/otavio/xxx/xrpl-wallet/docs/decisions.md` (§1–§11).
Spine: `ARCHITECTURE-SPINE.md` (AD-1..AD-15, Conventions, Stack, Deferred).
Companion: `GAP-REGISTER.md` (G-1..G-9 closed, G-10..G-12 open).

Method: every AD walked against §3 (guardrails 1–10) and §4 (enforced patterns),
plus §5–§11 for decisions the spine treats as settled or ignores. The spine
deliberately does not restate §3/§4 — absence of restatement is not reported.

---

## Findings

### F-1 — AD-4 carves out an exception §4 (and `CLAUDE.md`) states absolutely
**Severity: high. Type 1 (an AD weakens a §4 enforced pattern).**

- **§4** (bullet 3): "Active wallet + active network are one global source of
  truth… **Every** TanStack Query key includes both, so a switch of either can
  never leave stale cross-wallet or cross-network data on screen."
  `CLAUDE.md`'s non-negotiables repeat it in the same absolute form: "Every
  ledger read goes through a TanStack Query hook whose key includes the active
  wallet *and* the active network."
- **AD-4** (and the Conventions "Query keys" row): "A read scoped to an account
  takes the active wallet and the active network; a read that is genuinely
  account-independent or device-scoped is a named function on the factory, so
  the exception is visible rather than implied."
- **The code sides with AD-4.** `src/lib/xrpl/query-keys.ts` ships four
  account-scoped builders and four documented exceptions:
  `serverReserves(network)` and `recommendedFee(network)` drop the address;
  `passkeyRegistered()` and `lockoutState()` drop both. Each carries a written
  reason (ledger-wide, or device-local), and `scripts/check-query-keys.mjs`
  enforces that no key literal exists outside the factory.

AD-4 is the better rule — a reserve entry keyed by address would be four
duplicate cache entries and a wallet switch would needlessly invalidate a
ledger-wide fact. But as written, §4 and `CLAUDE.md` forbid what the code does
and what the spine blesses, so an agent reading §4 literally (the repo's own
instruction) would "fix" the factory.

**Disposition.** Amend §4 bullet 3 to read "every **account-scoped** key
includes both; a genuinely ledger-wide or device-scoped read is a named
exception on the factory," and make the same one-word change in `CLAUDE.md`'s
non-negotiable. Precedent: G-9, where §4 was amended to carry what AD-5 needed
rather than the AD being softened. No spine change.

---

### F-2 — AD-13, AD-14 and AD-15 exist nowhere in the authoritative decision record
**Severity: high. Type 4 (settled in one document, absent from the other).**

- `decisions.md` ends at **§11, dated 2026-09-02**. The three new ADs come out
  of `b359058` (2026-09-15) and the money-loss defect it fixed (a tagless
  payment enabled by an undefined `destInfo`).
- Nothing in `decisions.md` **contradicts** them — see the negative result in
  "Checks that passed" below — but nothing records them either. Three rules on
  a money-loss path therefore live only in a spine whose own front matter says
  `status: draft`, enforced "by review only", while `CLAUDE.md`'s
  non-negotiables (which agents read first) do not mention read-failure or
  empty-state semantics at all.
- `GAP-REGISTER.md` already treats them as binding: G-10, G-11 and G-12 are
  written as divergences *from* AD-13/AD-14/AD-15.

**Disposition.** Add a `decisions.md` **§12** ("read failures are reported, not
absorbed") recording the defect, the three rules, and why a guard fails closed —
the same shape §5 and §9 use. Then add one line to `CLAUDE.md`'s
non-negotiables: a failed read is never rendered as an empty or current one.
Spine text stands as-is.

---

### F-3 — AD-5 is stale in its citation and tighter than §4 in its substance
**Severity: high. Types 1 and 3.**

- **The citation is stale.** AD-5 closes with "`docs/decisions.md` §4 owes one
  sentence saying this; see `GAP-REGISTER.md`." §4 now carries it in full, and
  the register's own **G-9 row marks this closed by `3ca0917`** — "§4 now
  carries it in full, including the lazy-expiry nuance, which is more than was
  asked for." The spine contradicts its own companion and invites an agent to
  add a sentence that is already there.
- **§4 is more precise than AD-5 about the exposure window.** §4: the session
  entry's expiry "is the auto-lock setting counted from the last activity, not
  from unlock"; `extendSession` pushes it forward on every activity tick, so a
  session in continuous use never expires; and "expiry is also **lazy** — an
  entry past its time is only deleted when `getUnlockedSession` next reads it,
  or when a lock path calls `clearUnlockedSession`, so the handle can sit in
  IndexedDB past its expiry." The window is therefore "auto-lock minutes of
  inactivity, with deletion on the next read or lock", **not a hard lifetime**.
  AD-5 says only "The session entry carries an expiry and is deleted on every
  lock path. The exposure window is the auto-lock setting and is accepted as
  such." That understates the real window — the one place a spine must not be
  optimistic is a key-handle lifetime.
- **AD-5 also drops one of §4's three bans.** §4: "Raw key bytes, a plaintext
  seed, or an ***extractable* key** remain banned in state, in storage and in
  anything serializable." AD-5 lists only "Raw key bytes and plaintext seeds."
  Non-extractability is the entire basis of the permission; omitting the
  extractable ban from the rule that grants it is the one weakening that
  matters here.

**Disposition.** Rewrite AD-5's rule to: (a) name *extractable* keys among the
banned forms; (b) state the window as "auto-lock minutes of inactivity, with
deletion on the next read or on any lock path — a lazy expiry, not a hard
lifetime, per §4"; (c) replace the "§4 owes one sentence" sentence with a plain
citation of §4. Change the tag from `[ADOPTED]` reasoning about a future doc
edit to a settled cross-reference.

---

### F-4 — Two independent IndexedDB owners, and no AD names the set teardown must clear
**Severity: high. Type 2 (a real divergence point no AD covers and the spine
does not defer).**

- **§3 #7 / §4:** "Logout/wallet removal must fully tear down state, including
  the service worker cache and the TanStack Query cache — leaving a warm cache
  after 'logout' is a documented shared-device PWA vulnerability."
- **§5.3** chose an IndexedDB-backed `persist` adapter with this stated benefit:
  "keeping every persisted byte in one store means teardown has a single place
  to clear, and nothing app-related is left behind in localStorage on a shared
  device."
- **The spine** names `lib/teardown.ts` once, parenthetically, in the Structural
  Seed ("the one place that clears caches, session and vault"). No AD binds it;
  nothing says a new unit that persists anything must register with it. This is
  exactly "who owns what", which the preamble claims as the spine's job.
- **The benefit §5.3 describes has not been realised.** There are two persisted
  owners, using two different libraries:
  - `src/lib/crypto/db.ts` (via `idb`) — vault, unlock wrappers, session entry.
  - `src/store/app-store.ts` (via `idb-keyval` directly), key
    `xrpl-wallet-app-state`, persisting `network`, `wallets`, `activeWalletId`,
    **`addressBook`**, `autoLockMinutes`, `declinedUpdateVersions`.

  `tearDownAllLocalState` (`src/lib/teardown.ts`) clears the crypto DB
  (`wipeVault` → `wipeVaultDatabase`), the Query cache, every Cache API entry,
  and live sockets. It never touches `xrpl-wallet-app-state`.
- **Strongest path:** `src/pages/Unlock.tsx:75` `handleReset` — the hard-lock
  path `wallet-security.md` says requires a full re-import — calls teardown and
  reloads, zeroing nothing in the persisted store. `wallets` (labels and
  addresses) and `addressBook` survive the reset intact. `SettingsTab.tsx:124`
  is milder (it zeroes `wallets`/`activeWalletId` in state first), but
  `addressBook`, `autoLockMinutes` and `declinedUpdateVersions` persist there
  too.
- **Not a §3 #3 breach.** The residue is non-secret metadata. The harm is
  shared-device privacy residue — labelled counterparty addresses after a
  "remove everything" — which is precisely what guardrail #7 names.

**Disposition.** Two parts.
1. **Spine:** promote teardown to an AD (suggest **AD-16 — one owner of local
   persistence teardown**): every module that persists anything registers its
   clear with `lib/teardown.ts`, and a new persisted store is incomplete until
   it does. This is the kind of rule the spine exists to state, and it is a
   candidate for a fourth `lint` script (enumerate persisted-store writers,
   fail on one teardown does not reach).
2. **`GAP-REGISTER.md`:** open **G-13** for the live divergence above, with the
   `Unlock.tsx:75` path as the evidence and `handleFullReset` as the second
   site. A code-level divergence belongs in the register, not only as an AD
   suggestion.

---

### F-5 — §5.4's imperative-read pattern is owned by no AD
**Severity: medium. Type 2.**

- **§5.4** decided that one-shot imperative reads inside a submit handler (the
  disabled-master-key probe before an import) go through
  `fetchAccountStateOnce(queryClient, …)`, "sharing the same cache key as
  `useAccountState`", because §4 bans read methods "inside a `useEffect` or
  event handler" and a pre-flight check genuinely cannot be declarative.
- **The spine** has AD-2 (only `lib/xrpl` may hold a client), AD-4 (one key
  factory) and a Conventions row reading "Hooks: `use` + the thing read, one
  query per hook". Nothing names the `fetchQuery` escape hatch. Under a
  hook-only reading of AD-2 plus §4, the next submit-time probe looks
  unarchitected, and the two plausible wrong turns are both live: call the
  client directly at the call site (an AD-2 violation), or build a second cache
  entry with a hand-made key (an AD-4 violation the gate would catch only
  because of the key literal).

**Disposition.** Add one clause to AD-4 or a Conventions row: an imperative
one-shot read uses `queryClient.fetchQuery` with the AD-4 factory key of the
equivalent hook, so the probe and the displayed value can never disagree — per
§5.4. No `decisions.md` change.

---

### F-6 — §8.11's origin-scoping risk is an architectural constraint the Deferred list omits
**Severity: medium. Type 4.**

- **§8.11** records an accepted, explicitly unresolved risk: IndexedDB — where
  the encrypted vault lives — is origin-scoped, so moving production off
  `*.b-cdn.net` to a custom domain is a **new origin** with no vault, requiring
  every user to re-import from seed, while the old origin keeps serving a
  working-but-frozen wallet. "This must be resolved before anyone else is
  invited to use it."
- **The spine's** Deployment paragraph describes the CDN and the three-branch
  promotion as settled fact and says nothing about origin identity; the
  **Deferred** section lists five items, none of them this. The spine's scope
  line covers "the whole client… the build, and the service worker", and the
  origin determines whether the vault survives — so this is in scope and is the
  one deferred decision with the power to destroy user funds.

**Disposition.** Add a Deferred entry: "**The production origin is part of the
architecture.** The vault is origin-scoped; attaching the final hostname is a
prerequisite of inviting any second user, not a later improvement — see
`docs/decisions.md` §8.11." No `decisions.md` change. (§8.7's three edge-rule
unknowns are deliberately *not* raised: cache-header configuration sits outside
the spine's declared scope.)

---

### F-7 — The contrast harness enforces a token rule no AD or Convention owns
**Severity: low-medium. Type 2, argued from the spine's own scope line.**

- **§6.2** makes `scripts/check-contrast.mjs` "the harness for this rule" for
  colour; **§7.5** states the consequence plainly: "A new token that the harness
  does not measure is a token outside the rule… Adding a token to `index.css`
  without adding its pairs here is incomplete work." **§7.3** reserves
  `--commit` to one control class; **§7.4** splits `--input` (3:1, WCAG 1.4.11)
  from `--border` (1.5:1 visibility floor, explicitly not 1.4.11).
- **The spine** has no AD and no Conventions row for tokens, surfaces or the
  contrast gate, and does not defer them. Yet "add a token, add its pairs" is a
  textbook divergence point between independently built units — the exact shape
  of AD-11 and AD-4 — and it is machine-checkable today.
- These sections are §6/§7, not §3/§4, so the "binding and not restated" carve
  out does not apply to them.

**Disposition.** Add a Conventions row: "New colour token → its pairs are added
to `scripts/check-contrast.mjs` in the same change; a token the harness does not
measure is outside the rule (`docs/decisions.md` §6.2, §7.5)." Optionally note
`DESIGN.md` as the authority for which token plays which role.

---

### F-8 — The §4 citation the reconcile brief expects at AD-7 does not exist
**Severity: low. Type 3 (reported as "site not found", not as "verified").**

- AD-7 carries **Binds / Prevents / Rule** only — no citation of
  `docs/decisions.md` anywhere in its body. The brief listed AD-7's context as
  one of four §4 citation sites; there are three (AD-5, the Conventions
  "Irreversible actions" row, the preamble), all verified below.
- Substantively AD-7 **tightens** §4 rather than weakening it: §4 bans
  `Number()`/floating-point arithmetic "anywhere outside the single shared
  formatting utility used at render time", whereas AD-7 bans `Number()`,
  `parseFloat` and `toFixed` on a monetary value "anywhere, **including inside
  that module**". A stricter AD is not a type-1 finding, but the divergence
  should be deliberate rather than accidental.

**Disposition.** Either add "stricter than §4's carve-out, deliberately —
formatting drops is string work" to AD-7, or drop the "including inside that
module" clause. Recommend the former; the carve-out is how a float gets into a
formatter.

---

### F-9 — §6.5's "all notifications" absolute vs AD-8's two surfaces
**Severity: low. Type 1, borderline.**

- **§6.5:** "All notifications go through `src/lib/notify.tsx`."
- **AD-8:** a failed *read* renders inline through
  `components/wallet/QueryErrorState.tsx` — a second user-visible failure
  surface that is deliberately not `notify`.
- Read strictly, AD-8 introduces a surface §6.5 says does not exist. In spirit
  there is no conflict: §6.5 is about *notices* and their dismissal timing, and
  AD-8 keeps every user-initiated failure on `notify` with errors and warnings
  never auto-dismissing, exactly as §6.5 requires.

**Disposition.** Fold into F-2's new §12: state that there are two declared
failure surfaces and that §6.5's rule governs the notice surface. One sentence.

---

## Checks that passed (recorded so the reader can tell the check ran)

- **`[GATED]` accounting is correct.** `package.json`'s `lint` is
  `oxlint --deny-warnings --report-unused-disable-directives && node
  scripts/check-query-keys.mjs && node scripts/check-sw-register.mjs && node
  scripts/check-layering.mjs`. Those three scripts map exactly onto **AD-4**,
  **AD-11** and **AD-1**, each naming its AD in its own header comment, and no
  other AD has a script inside `lint`. `scripts/` holds exactly six files; the
  remaining three (`check-contrast.mjs`, `gen-release-manifest.mjs`,
  `verify-headers.mjs`) are not in `lint`. Two footnotes, neither a finding:
  `.oxlintrc.json` sets `react-hooks/exhaustive-deps: "error"`, which
  machine-enforces §3 #2 (not an AD); and `check:contrast` is a separate gate
  and a separate CI job (§8.12), outside `lint`. The spine's sentence is scoped
  to ADs and is accurate as written.
- **AD-13/AD-14/AD-15 are contradicted by nothing in `decisions.md`, and §9.3
  is their strongest existing support.** §9.3, deciding the annunciator's quiet
  state: "an unlit plate carries no claim at all… nothing changed, so nothing
  is asserted", rejecting a dimmed last notice because "a resolved error that
  stays visible can read as still true." That is AD-15's "an empty state is a
  claim, not a default" reached independently, one surface over. §10.1's
  prominence default — "anything else… or no manifest at all renders `warning`",
  because "understating a security fix because the network request… happened to
  fail is a worse failure" — is AD-13's fail-closed principle applied to the
  update path. §3 #6's stale-cache reasoning ("here they'd render a wrong
  balance") is AD-14's. Nothing agrees with them *by name*, which is F-2.
- **Conventions "Irreversible actions" row — citation verified.** §4 bullet 5:
  "Every destructive/irreversible action requires an explicit confirm step
  stating the exact consequence in plain language: removing a wallet, closing a
  trust line, revealing a seed, sending a payment." The row's added "No
  exceptions for 'obvious' cases" is consistent with §4's "always — no
  exceptions" heading.
- **Preamble citation verified.** §3 is guardrails, §4 is enforced patterns;
  both are binding and neither is restated in the spine.
- **Conventions "New unlock methods" row verified** against §4's final bullet
  (one master key, wrapped once per method, `unlockVault` unwraps on every
  attempt, never derive-and-trust). Matches, including the "never a bare derive
  and trust shortcut" phrasing.
- **AD-2's named exception is consistent with §3 #1.** `useAccountLiveUpdates`
  subscribes rather than reads; §3 #1 governs `account_info`/`account_lines`/
  `account_tx` fetches. `GAP-REGISTER.md` already records it as "not a gap".
- **AD-9 matches §10's US-5 note** (the in-flight flag lives at
  `submitAndClassify`, session-only in `useAppStore`, set and cleared in
  `try/finally`) and AD-6 matches §5.3 (persisted, non-secret selection state in
  IndexedDB).
- **Stack table re-verified against `package.json`:** `bun@1.3.1`,
  `node >=22`, `typescript ~6.0.2`, `react ^19.2.8`, `vite ^8.2.2`,
  `vite-plugin-pwa ^1.3.0`, `tailwindcss ^4.3.3`,
  `@tanstack/react-query ^5.102.8`, `zustand ^5.0.15`, `xrpl ^5.1.0`,
  `idb ^8.0.3` / `idb-keyval ^6.3.0`, `vitest ^4.1.11`, `oxlint ^1.79.0`. All
  accurate.
- **Deliberately not reported**, per the brief's exclusion: §3 #5 (array index
  as React key) and §6.3-as-amended (nothing styles `:focus`, `outline-none`
  banned). Both are flat prohibitions §3 owns outright; neither raises a
  question of ownership for the spine to answer, and `GAP-REGISTER.md` records
  both as currently holding.

---

## Suggested edit set

| Target | Edit | From |
| --- | --- | --- |
| `docs/decisions.md` §4 bullet 3 | "every **account-scoped** key includes both; ledger-wide and device-scoped reads are named exceptions on the factory" | F-1 |
| `CLAUDE.md` non-negotiables | same one-word narrowing | F-1 |
| `docs/decisions.md` new §12 | record the read-failure / retained-data / empty-state rules and the two declared failure surfaces | F-2, F-9 |
| `CLAUDE.md` non-negotiables | one line: a failed read is never rendered as empty or current | F-2 |
| Spine AD-5 | name extractable keys; state the lazy expiry; drop "§4 owes one sentence" | F-3 |
| Spine new AD-16 | one owner of local persistence teardown | F-4 |
| `GAP-REGISTER.md` new G-13 | `xrpl-wallet-app-state` survives teardown (`Unlock.tsx:75`, `SettingsTab.tsx:124`) | F-4 |
| Spine AD-4 / Conventions | imperative one-shot reads use `fetchQuery` with the factory key (§5.4) | F-5 |
| Spine Deferred | the production origin is architectural (§8.11) | F-6 |
| Spine Conventions | new colour token ⇒ new contrast pairs (§6.2, §7.5) | F-7 |
| Spine AD-7 | mark the stricter-than-§4 ban as deliberate | F-8 |
