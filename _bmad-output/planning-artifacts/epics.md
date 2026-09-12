---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/GAP-REGISTER.md
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/vaultkey-options.md
  - _bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md
  - docs/decisions.md
---

# xrpl-wallet — Epic Breakdown

## Overview

This document breaks the **architecture remediation** work into implementable
stories. Its scope is the nine gaps in `GAP-REGISTER.md`, governed by the twelve
rules in `ARCHITECTURE-SPINE.md`.

**This is not product functionality.** No FR in the PRD changes behaviour as a
result of this work. The wallet does exactly what it did before; it just stops
being able to drift. `docs/user-stories/` remains the functional contract and is
untouched by these epics.

Every story lands on a branch off `dev`, rebased before merge, with
`bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast` all
green. Never `main` — it does not exist.

## Requirements Inventory

### Functional Requirements

The PRD's FR-1 through FR-56 are the **regression contract** here, not the work.
Every one must still hold when these epics are done. The ones most exposed by
this remediation, and therefore the ones to re-verify:

- **FR-14** — switching wallet never leaves the previous wallet's data on screen.
- **FR-38** — switching network never leaves the previous network's data on screen.
- **FR-29, FR-30** — balances and spendable are the ledger's figures.
- **FR-16 through FR-25** — the send path, including fee display, the confirm
  step, submitted-vs-validated, and `LastLedgerSequence` expiry.
- **FR-42, FR-43** — every address and hash links to the correct network's
  explorer.
- **FR-46 through FR-52** — build identity, update prompt, and the rule that the
  app never updates itself.
- **FR-53 through FR-56** — notices docked, never auto-dismissing, announced
  politely.

The full list is in `_bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md` §4.

### NonFunctional Requirements

Carried verbatim from the PRD §8. These are what the remediation is *for*.

- **NFR-1** — money is strings or BigInt end to end; formatting only at the
  render boundary.
- **NFR-2** — no secret is ever serializable.
- **NFR-3** — every ledger read goes through a query hook whose key includes the
  active wallet and the active network.
- **NFR-4** — the service worker caches the static shell only, never an RPC
  response.
- **NFR-5** — nothing styles `:focus`; `outline-none` is banned.
- **NFR-6** — colour never carries meaning alone; `check:contrast` is the gate.
- **NFR-7** — every irreversible action states its exact consequence first.
- **NFR-8** — every bespoke component gets a keyboard and screen-reader pass
  before merge.
- **NFR-9** — 320px and 200% zoom are supported conditions.

### Additional Requirements

From `ARCHITECTURE-SPINE.md`. These are the rules the stories implement. No
starter template applies — this is a brownfield codebase with a fixed stack.

- **AD-1** — dependencies point one way. No `lib` → `hooks`/`components`/`pages`;
  no `store` → `components`/`pages`. One named exception: `lib/notify.tsx` may
  import `store/notice-store`.
- **AD-2** — only `lib/xrpl/` may hold an XRPL `Client`. Pure offline helpers are
  exempt.
- **AD-3** — only `lib/crypto/` may turn a seed into a signer.
- **AD-4** — one factory produces every query key, for reads and invalidations
  alike; legitimate exceptions are named functions on it.
- **AD-5** — a non-extractable `CryptoKey` handle is permitted session state.
  `[ADOPTED — decided 2026-09-12]`
- **AD-6** — `store/app-store.ts` is the only source of truth for active wallet
  and active network.
- **AD-7** — all money arithmetic lives in `lib/xrpl/money.ts`.
- **AD-8** — two declared error surfaces: failed reads render inline, user
  actions report to the Annunciator. `[ARCHITECT'S CALL — open to override]`
- **AD-9** — every write passes `submitAndClassify`. `[ADOPTED]`
- **AD-10** — explorer links only through `AddressLink` / `TxLink`.
- **AD-11** — `lib/sw-register.ts` is the only importer of `virtual:pwa-register`.
- **AD-12** — a module owning an external resource exposes a test seam and a reset.

### UX Design Requirements

**None.** This remediation changes no pixel, no copy, no interaction and no
token. `DESIGN.md` is binding and untouched.

Two consequences worth stating so nobody invents work here:

- `check:contrast` still runs on every story, as a regression gate rather than as
  a source of requirements.
- **AD-8 (Epic 3) is the one place a user could notice a difference.** If a
  failure that used to appear in one place starts appearing in another, that is a
  visible change and it needs the manual 320px and 200%-zoom pass from
  `docs/agents/verifying-your-work.md` before merge.

### FR Coverage Map

Reverse of the usual direction: these epics deliver no FR, they protect FRs.

| Gap | Rule | Epic | Protects |
|---|---|---|---|
| G-1 | AD-4, AD-6 | Epic 1 | FR-14, FR-38, FR-29, FR-30, NFR-3 |
| G-2 | AD-3 | Epic 2 | FR-1, FR-2, FR-3, NFR-2 |
| G-3 (writes.ts) | AD-1 | Epic 2 | NFR-2, testability of the write path |
| G-3 (notify, notice-store) | AD-1 | Epic 3 | FR-53, NFR-2 |
| G-4 | AD-12, AD-2 | Epic 2 | FR-41 |
| G-5 | AD-8 | Epic 3 | FR-53, FR-54, FR-55 |
| G-6 | AD-7 | Epic 4 | NFR-1, FR-29 |
| G-7 | AD-10 | Epic 4 | FR-42, FR-43 |
| G-8 | AD-11 | Epic 4 | FR-46, FR-48 |
| G-9 | AD-5 | Epic 4 | NFR-2 — protects correct code from a later "fix" |

Every gap in `GAP-REGISTER.md` is covered. No gap appears in two epics, except
G-3, which is split by module because its two halves belong to different
concerns and different files.

## Epic List

Four epics. Each stands alone and can ship on its own; none needs a later one to
work. Ordered by what it costs you if it is wrong, so stopping after Epic 1 still
leaves you better off than today.

A note on "user value". This is remediation, so the value is not a new capability
— it is a guarantee. Each epic below states the guarantee in terms the operator
can check, because a guarantee nobody can verify is not one.

### Epic 1: Cached ledger data can no longer go stale

After this epic the app cannot show you a number belonging to a wallet or a
network you are no longer looking at, because the label that identifies cached
data and the label that throws it away are produced by the same code. Today they
are typed by hand in seventeen places and nothing checks that they match.

**Guarantee:** switch wallet or network, or complete a send, and every figure on
screen is for the thing you are actually looking at.
**Gaps closed:** G-1. **Rules:** AD-4, AD-6. **Protects:** FR-14, FR-38, FR-29,
FR-30, NFR-3.
**Touches:** a new key module, nine read sites, four invalidation sites.
**Standalone:** yes. Nothing else depends on it and it depends on nothing.

### Epic 2: The two sealed boundaries actually hold

The architecture says two modules own dangerous things: `lib/crypto` owns key
material, `lib/xrpl` owns the network. Today both boundaries are observed by
convention rather than enforced, and one of them — the endpoint failover — cannot
be tested at all.

**Guarantee:** no screen can turn a seed into a signer, no module outside
`lib/xrpl` can open a connection, and the failover path has a test that proves it
falls through to the backup endpoint.
**Gaps closed:** G-2, G-4, and the `writes.ts` half of G-3. **Rules:** AD-1, AD-2,
AD-3, AD-12. **Protects:** FR-1, FR-2, FR-3, FR-41, NFR-2.
**Touches:** `lib/crypto/keystore.ts`, `pages/Onboarding.tsx`,
`pages/tabs/SettingsTab.tsx`, `lib/xrpl/client.ts`, `lib/xrpl/writes.ts`.
**Standalone:** yes.

### Epic 3: A failure always reports the same way

Today an imperative failure goes to the notice band and a failed ledger read
renders inline, and nothing says which is correct. This epic writes the rule down
and makes the code obey it — including closing the one place that reaches past
the notice funnel.

**Guarantee:** for any given kind of failure, you can say in advance where it
will appear, and it appears there on every screen.
**Gaps closed:** G-5, and the `notify` / `notice-store` half of G-3. **Rules:**
AD-1, AD-8. **Protects:** FR-53, FR-54, FR-55.
**Touches:** `lib/notify.tsx`, `store/notice-store.ts`, `hooks/useAppUpdate.ts`,
`BalancesTab`, `HistoryTab`.
**Standalone:** yes.
**Carries the only user-visible risk in this breakdown.** If a failure moves from
one place to another, that is a visible change and needs the manual 320px and
200%-zoom pass before merge. AD-8 is the architect's call and is still open to
override — settle it before this epic starts, not during.

### Epic 4: The rules and the code agree again

Four places where `docs/decisions.md` and the code disagree. One of them is the
rule's fault and three are the code's. Small, mechanical, independently
shippable, and each one removes a thing a future agent would otherwise "fix"
wrongly.

**Guarantee:** an agent auditing the code against `docs/decisions.md` finds
nothing to report.
**Gaps closed:** G-9 (the rule is wrong), then G-6, G-7, G-8 (the code is wrong).
**Rules:** AD-5, AD-7, AD-10, AD-11. **Protects:** FR-29, FR-42, FR-43, FR-46,
FR-48, NFR-1, NFR-2.
**Touches:** `docs/decisions.md`, `lib/xrpl/money.ts`, `hooks/useSpendableBalance.ts`,
`SendTab`, `TrustLinesTab`, `AddressDisplay.tsx`, `main.tsx`.
**Standalone:** yes, and every story inside it is independently shippable too.

### Why not more epics, or fewer

**G-3 is split across two epics on purpose.** Its two halves live in different
modules and serve different concerns: `writes.ts` reaching into the store is a
write-path problem, `notify.tsx` reaching into a UI component is a notice
problem. Keeping them together would have made two epics both edit
`lib/notify.tsx`, which is the file-churn pattern this breakdown is meant to
avoid.

**G-9 rides with Epic 4 rather than standing alone.** It is a one-sentence change
to `docs/decisions.md` and would be a whole epic containing one ten-minute story.
It sits naturally at the head of Epic 4 because that epic's theme is exactly
"the rules and the code disagree — fix whichever is wrong."


---

## Standing conditions for every story below

These apply to all fifteen stories and are not repeated in each one:

- Branch off `dev`, rebased onto `dev` before merge. Never `main` — it does not exist.
- `bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast` all
  green before merge. Four green gates mean nothing is *provably* broken, not that
  the change works.
- No behaviour change visible to the user, except where a story says otherwise.
- No secret enters state, a store, the URL, or anything serializable — including
  in development builds.
- No `Number()`, `parseFloat` or `toFixed` touches a monetary value.

## Epic 1: Cached ledger data can no longer go stale

One module produces every label that identifies cached ledger data, and every
label that throws it away. Closes G-1. Implements AD-4 and AD-6. Protects FR-14,
FR-38, FR-29, FR-30 and NFR-3.

### Story 1.1: One module produces every account-scoped cache label

As a wallet operator holding real funds,
I want the labels that identify my cached balances to come from one place,
So that no hand-typed label can quietly disagree with another.

**Acceptance Criteria:**

**Given** a new module that exports a query-key factory
**When** a hook needs a key for an account-scoped ledger read
**Then** it calls the factory rather than writing an array literal
**And** the factory takes the active wallet and the active network as arguments, so a key cannot be built without them.

**Given** the six account-scoped read hooks — `useAccountState`, `useAccountTxHistory`, `useTrustLines`, `useDestinationInfo`, `useIncomingPaymentNotifications`, and `lib/xrpl/query-reads.ts`
**When** the migration is complete
**Then** none of them contains a query-key array literal
**And** each produces exactly the same key it produced before, verified by a test asserting the shape.

**Given** the app running against Testnet with two wallets configured
**When** the operator switches from one wallet to the other
**Then** the balance, trust lines and history on screen are the newly-active wallet's
**And** no figure from the previous wallet remains visible.

### Story 1.2: Invalidation uses the same labels as the reads

As a wallet operator,
I want the code that discards stale data to use the same labels as the code that stored it,
So that a completed send cannot leave the old balance on screen.

**Acceptance Criteria:**

**Given** the four invalidation sites — `useAccountLiveUpdates`, `SendTab`, `TrustLinesTab`, `BalancesTab`
**When** the migration is complete
**Then** each calls the factory from Story 1.1 rather than retyping a key
**And** no query-key array literal remains at any invalidation site.

**Given** a successful XRP payment on Testnet
**When** the transaction validates
**Then** the sender's balance and history refresh without a manual reload
**And** the spendable figure reflects the new balance.

**Given** a trust line is created
**When** the transaction validates
**Then** the trust-line list and the owner-reserve figure both refresh.

### Story 1.3: Reads that are not account-scoped say so on the factory

As a maintainer,
I want the reads that legitimately have no wallet in their label to be named on the factory,
So that an audit against the wallet-plus-network rule sees an exception rather than a bug.

**Acceptance Criteria:**

**Given** `useServerReserves` and `useRecommendedFee`, which are network-scoped but not account-scoped
**When** the migration is complete
**Then** each gets its key from a named factory function whose name states it is network-scoped
**And** the factory carries a comment explaining why no address belongs in that key.

**Given** the two device-scoped queries in `pages/Unlock.tsx` — passkey registration and lockout state
**When** the migration is complete
**Then** both get their keys from named factory functions marked device-scoped
**And** neither is affected by a wallet or network switch.

**Given** an agent auditing the code against `docs/decisions.md` §4's wallet-plus-network rule
**When** it inspects the key factory
**Then** every exception is visible and explained in one file.

### Story 1.4: A new hand-written cache label cannot be merged

As a maintainer,
I want the build to refuse a query key written outside the factory,
So that this fix does not decay the next time someone adds a hook.

**Acceptance Criteria:**

**Given** the factory from Stories 1.1 to 1.3 is in place
**When** a developer adds a `queryKey` or `invalidateQueries` call with an inline array literal
**Then** the check fails and names the offending file and line
**And** the message says to use the factory.

**Given** the check runs
**When** `bun run lint` is invoked
**Then** the check runs as part of it, with no extra command to remember
**And** it adds no dependency to `scripts/check-contrast.mjs`, whose CI job has no install step.

## Epic 2: The two sealed boundaries actually hold

`lib/crypto` owns key material and `lib/xrpl` owns the network — enforced rather
than observed. Closes G-2, G-4, and the `writes.ts` half of G-3. Implements AD-1,
AD-2, AD-3, AD-12. Protects FR-1, FR-2, FR-3, FR-41 and NFR-2.

### Story 2.1: No screen turns a seed into a signer

As a wallet operator,
I want every path from a seed to a signing key to run through one audited module,
So that there is one place to get seed handling right rather than three.

**Acceptance Criteria:**

**Given** `pages/Onboarding.tsx` and `pages/tabs/SettingsTab.tsx`, which today import `Wallet` from `xrpl` and call `Wallet.fromSeed`
**When** the change is complete
**Then** neither file imports `Wallet`
**And** each asks `lib/crypto/keystore.ts` for what it needs.

**Given** the pure offline validators such as `isValidClassicAddress`
**When** a screen needs to validate an address before submitting
**Then** it may still import them directly, because they touch no key and no connection.

**Given** a seed being imported or revealed
**When** the operation completes
**Then** the plaintext seed has existed only in a local variable or a ref
**And** it has never been in React state, a store, a query cache, or a log — including in a development build.

**Given** the existing onboarding and import flows on Testnet
**When** a wallet is generated and then a second is imported from its seed
**Then** both behave exactly as before, including the disabled-master-key warning on import.

### Story 2.2: The write path no longer reaches into the store

As a maintainer,
I want `lib/xrpl/writes.ts` to stop importing the app store,
So that the send path can be tested without standing up a React store.

**Acceptance Criteria:**

**Given** `lib/xrpl/writes.ts`, which today imports `@/store/app-store` and calls `useAppStore.getState().setTxInFlight`
**When** the change is complete
**Then** the file imports nothing from `src/store`, `src/hooks`, `src/components` or `src/pages`
**And** the in-flight flag is set by the caller, or through a setter the caller supplies.

**Given** `submitAndClassify` remains the single choke point every write passes
**When** any payment or trust-line transaction is submitted
**Then** the in-flight flag is raised before submission and cleared after the outcome is known, exactly as before.

**Given** an app update is available and a payment is in flight
**When** the operator tries to apply the update
**Then** it is still blocked until the transaction resolves — FR-48 is unchanged.

**Given** the new shape
**When** a test submits a payment against a stubbed client
**Then** it can assert the in-flight transitions without a store.

### Story 2.3: The ledger client can be substituted in a test

As a maintainer,
I want `lib/xrpl/client.ts` to accept a substitute client and expose a reset,
So that the failover path becomes reachable from a test at all.

**Acceptance Criteria:**

**Given** `lib/xrpl/client.ts`, which today holds a module-level map and constructs a real `Client`
**When** the change is complete
**Then** the module accepts a client factory and exposes a reset that clears its map
**And** production behaviour is unchanged when no substitute is supplied.

**Given** `lib/xrpl/reads.ts` and `lib/xrpl/writes.ts`, which call `getXrplClient` directly
**When** a test supplies a substitute
**Then** both use it without further change.

**Given** AD-2
**When** the change is complete
**Then** no module outside `src/lib/xrpl/` imports a `Client` from `xrpl` or calls `getXrplClient`
**And** the live-subscription hook is either moved inside the boundary or recorded in the spine as a named exception with its reason.

### Story 2.4: The failover path is proven by a test

As a wallet operator,
I want proof that the wallet falls through to the backup endpoint,
So that a primary endpoint outage does not silently leave me unable to read the ledger.

**Acceptance Criteria:**

**Given** the seam from Story 2.3 and a substitute that refuses the primary endpoint
**When** a ledger read is attempted
**Then** the backup endpoint is tried
**And** the read succeeds.

**Given** a substitute where the primary never resolves
**When** the ten-second timeout elapses
**Then** the backup is tried rather than the read hanging.

**Given** a substitute where both endpoints refuse
**When** a ledger read is attempted
**Then** the resulting error names both failures
**And** the original causes are preserved rather than flattened into one message.

**Given** a connection that is already open and connected
**When** a second read is requested for the same network
**Then** the existing connection is reused and no second connection is opened.

## Epic 3: A failure always reports the same way

One rule for where a failure appears, and code that obeys it. Closes G-5 and the
`notify` half of G-3. Implements AD-1 and AD-8. Protects FR-53, FR-54, FR-55.

**Before this epic starts:** AD-8 is the architect's call, not the product
owner's decision. Confirm or override it first. If it is overridden, these three
stories change.

**This epic carries the only user-visible risk in this breakdown.** A failure
moving from one place on screen to another is a real change and needs the manual
320px and 200%-zoom pass in `docs/agents/verifying-your-work.md` before merge.

### Story 3.1: The notice vocabulary stops living in a UI component

As a maintainer,
I want the notice tone vocabulary to sit where both the funnel and the component can see it,
So that `lib/notify.tsx` stops importing a component.

**Acceptance Criteria:**

**Given** `lib/notify.tsx`, which today imports `@/components/ui/alert` as a value for the tone map, and `store/notice-store.ts`, which imports it as a type
**When** the change is complete
**Then** neither imports anything from `src/components`
**And** the tone vocabulary lives where both sides and the `Alert` component can import it.

**Given** AD-1's one named exception
**When** the change is complete
**Then** `lib/notify.tsx` may still import `store/notice-store`, because that store is the funnel's sink
**And** no other `lib` module imports from `src/store`.

**Given** the Annunciator on the main, unlock and onboarding screens
**When** a notice of each severity is raised
**Then** each renders exactly as it did before, in both themes.

### Story 3.2: Dismissing a notice goes through the same door as raising one

As a maintainer,
I want `notify` to own dismissal as well as raising,
So that nothing reaches past the funnel into the notice store.

**Acceptance Criteria:**

**Given** `hooks/useAppUpdate.ts:169`, which today calls `useNoticeStore.getState().dismiss()` directly because `notify` has no dismiss
**When** the change is complete
**Then** `notify` exports a dismiss
**And** no module outside `lib/notify.tsx` imports `useNoticeStore`, except the Annunciator that renders it.

**Given** an update notice is showing and the operator declines that version
**When** the decline is recorded
**Then** the notice is dismissed exactly as before
**And** a newer release still surfaces later — FR-48 is unchanged.

### Story 3.3: Every failure appears where the rule says it will

As a wallet operator,
I want to know in advance where a given failure will appear,
So that I never miss one because it showed up somewhere I was not looking.

**Acceptance Criteria:**

**Given** AD-8's rule — a failed read of data with a place on screen renders inline, anything the operator did reports to the Annunciator
**When** every query consumer and every imperative `catch` has been audited
**Then** each follows the rule
**And** any deliberate exception is recorded in the spine with its reason rather than left as a silent difference.

**Given** a ledger read fails on the Balances or History screen
**When** the failure renders
**Then** it appears inline where the missing data would have been
**And** it does not auto-dismiss.

**Given** a send, a trust-line change, an unlock or an update fails
**When** the failure renders
**Then** it appears in the Annunciator
**And** it does not auto-dismiss, and it is announced in the polite live region.

**Given** the screens at 320px and at 200% zoom
**When** a failure of each kind is shown
**Then** nothing is clipped or unreachable
**And** `bun run check:contrast` passes for every tone used.

## Epic 4: The rules and the code agree again

Four disagreements between `docs/decisions.md` and the code. Closes G-9, G-6, G-7,
G-8. Implements AD-5, AD-7, AD-10, AD-11. Protects FR-29, FR-42, FR-43, FR-46,
FR-48, NFR-1 and NFR-2. Every story here ships independently of the others.

### Story 4.1: The secrets rule says what it means

As a maintainer,
I want `docs/decisions.md` to record that an unreadable browser key handle is permitted,
So that a future agent does not remove working code while enforcing the rule.

**Acceptance Criteria:**

**Given** `docs/decisions.md` §4's rule that no secret ever enters store state or anything serializable
**When** the sentence is added
**Then** it states that a `CryptoKey` imported non-extractable may be held in session state and in the IndexedDB session store, and that raw key bytes and plaintext seeds may not
**And** it says the exposure window is the auto-lock setting.

**Given** an agent auditing `store/app-store.ts:22` against §4
**When** it reads the rule
**Then** it finds the code compliant rather than flagging it.

**Given** this is a `docs/` change with no code change
**When** the story is complete
**Then** nothing under `src/` has been modified.

### Story 4.2: Drops arithmetic lives in one module

As a wallet operator,
I want the spendable-balance calculation written once,
So that two copies cannot drift and show me different numbers.

**Acceptance Criteria:**

**Given** the four sites doing `BigInt` arithmetic on drops outside `money.ts` — `useSpendableBalance.ts:16` and `:19`, `SendTab.tsx:75-76`, `TrustLinesTab.tsx:68`
**When** the change is complete
**Then** each calls a named helper in `lib/xrpl/money.ts`
**And** no arithmetic on a monetary value remains outside that module.

**Given** the spendable-balance rule — balance minus base reserve minus owner reserve times owned objects
**When** it is expressed as a helper
**Then** it exists in exactly one place
**And** it has tests covering zero balance, an unfunded account, and a balance below the base reserve.

**Given** an account with trust lines on Testnet
**When** the Balances screen renders
**Then** the spendable figure is identical to the figure shown before this change.

### Story 4.3: Every explorer link goes through the shared component

As a wallet operator,
I want every address and hash to link out the same way,
So that a link can never point at the wrong network's explorer.

**Acceptance Criteria:**

**Given** `components/wallet/AddressDisplay.tsx:65`, which today writes its own anchor using the URL builder
**When** the change is complete
**Then** it renders through `AddressLink`
**And** no hand-written anchor to an explorer remains anywhere in `src/`.

**Given** the app on Mainnet and then on Testnet
**When** an address link is followed from every screen that shows one
**Then** each opens the network-correct official explorer.

**Given** the anchors pointing at source and release notes in `Unlock.tsx`, `SettingsTab.tsx` and `Onboarding.tsx`
**When** the audit runs
**Then** they are left alone, because they are not explorer links.

### Story 4.4: The service worker registers once

As a wallet operator,
I want one piece of code to own service-worker registration,
So that the update prompt cannot fire from a path the update logic does not control.

**Acceptance Criteria:**

**Given** `main.tsx:3`, which today imports `virtual:pwa-register` directly and calls `registerSW` at `:9`
**When** the change is complete
**Then** it goes through `lib/sw-register.ts`
**And** that module is the only importer of the virtual specifier, as its own docstring already claims.

**Given** a build with a new release published
**When** the app is opened
**Then** the update notice appears exactly once
**And** the new worker installs and waits rather than activating — FR-48 is unchanged.

**Given** the operator accepts the update with no transaction in flight
**When** the new version activates
**Then** it activates once, and the app reloads into the new build.
