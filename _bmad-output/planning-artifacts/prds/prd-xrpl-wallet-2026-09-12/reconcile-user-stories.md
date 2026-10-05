# Reconciliation — `docs/user-stories/INDEX.md` + the twelve epic files vs `prd.md` / `addendum.md`

**Input:** `docs/user-stories/INDEX.md` and the twelve epic files it names
(`account-onboarding`, `app-versioning-and-updates`, `block-explorer-links`,
`in-app-notices`, `multi-wallet-management`, `network-selection`,
`receiving-payments`, `sending-payments`, `tokens-and-trustlines`,
`transaction-history`, `viewing-balances`, `wallet-security`).

**Against:** `prd.md` (FR-1 … FR-56, §4.1–§4.13) and `addendum.md`, in the run
folder `prd-xrpl-wallet-2026-09-12/`.

**Authority claim under test.** `prd.md` §0 names this input set authoritative
for story-level functional detail and states: *"Where an FR and an epic file
disagree, the epic file wins and this PRD is stale."* Every finding below is
scored against that rule — and Finding 1 is that the rule itself is unsafe as
written.

All twelve epic files were read in full, as was `INDEX.md`. Where a claim's
provenance mattered, `docs/decisions.md` and the shipped source were checked
directly; those checks are cited inline.

---

## Finding 1 — §0's tie-break rule, applied literally, would regress shipped behaviour

**Severity: critical** (defect in the reconciliation rule, not in either document's content)

**Involved:** `prd.md` §0, §10 Q6 · `docs/user-stories/app-versioning-and-updates.md`
§ "Open decisions" (V1–V4) · `docs/user-stories/in-app-notices.md` § "Open
decisions" (N1–N4) · FR-49, FR-53, FR-55, FR-56

**What the epic files say.** Both files still carry open-decision tables that
gate acceptance criteria on decisions presented as unresolved:

- `in-app-notices.md` US-8: *"Settled by **N1** below; the implementation does
  not decide it."* US-4: *"Behaviour at the bound is settled by **N3** below and
  is not invented by the implementation."* The N-table says N1 and N4 "Block
  S16", N2 and N3 "Block S17".
- `app-versioning-and-updates.md` marks V1–V4 answered in prose, but US-6 still
  defers prominence to "(V4)".

**What the PRD says.** FR-53 states the annunciator is "Present on the main,
unlock, and onboarding surfaces alike" — i.e. it *answers* N1. FR-56 states
"overflow is summarised by severity and count" — it answers N3. Both match the
shipped shell (`docs/decisions.md` §9, which records the fixed-height shell with
header and annunciator pinned and all 27 notices rehomed).

**Why this is critical.** For this cluster the staleness runs the *opposite* way
to the direction §0 assumes. Applying "the epic file wins" literally would
re-open four decisions that shipped on 2026-09-02 and would strip FR-53/55/56 of
their answers. The PRD already knows this — §10 Q6 raises the stale tables as an
open question and `addendum.md` §7 records them as drift — yet §0's rule is
stated unconditionally, so a downstream reader who obeys §0 and never reaches
§10 Q6 will regress the product.

**Disposition.** Do not correct the PRD here. Two edits instead:

1. Amend `prd.md` §0 to qualify the tie-break: the epic file wins **on story
   detail**, except where its "Open decisions" table presents a decision that
   `docs/decisions.md` records as answered, in which case `docs/decisions.md`
   wins and the epic file is stale. Cross-reference §10 Q6 from §0.
2. Repair the two epic files (delete or annotate V1–V4 and N1–N4; rewrite US-8
   and US-4 to state the answer rather than defer to a table). This is the
   already-reported drift in `addendum.md` §7 and is the real fix.

---

## Finding 2 — `wallet-security.md` specifies passkey-only unlock with a platform-held key; the product ships a mandatory PIN with an app-level KEK

**Severity: critical**

**Involved:** `docs/user-stories/wallet-security.md` US-1, US-2 · FR-6, FR-7,
FR-8 · SM-2

**What the epic file says.**

- US-1: *"Unlocking triggers a platform passkey/WebAuthn ceremony … **rather than
  a typed password**"*; *"Wallet supports registering the passkey once during
  onboarding … and re-authenticating with it on every unlock thereafter"*; *"If
  passkey authentication fails or is cancelled, the wallet stays locked and shows
  a clear retry option; it **never falls back** to exposing the key without
  successful authentication."* The only recovery path it names is re-import via
  seed. **The word PIN does not appear anywhere in the file.**
- US-2: the encryption key must be *"itself protected by the platform's secure
  storage (e.g. iOS Keychain/Secure Enclave, Android Keystore, OS-level
  credential store on desktop) — **not a hardcoded or easily-extractable
  app-level key**."*

**What the PRD says.** FR-7: *"An app PIN is set during onboarding alongside the
passkey and is **never optional**. A device with no platform authenticator can
still reach every function."* FR-8 makes every Unlock Method unwrap one Master
Key, verified by AES-GCM tag failure.

**What ships.** `docs/decisions.md` §2 line 29 decides the mandatory PIN
fallback; §4 (final bullet) records the master-key wrap/unwrap ceremony and the
live defect that motivated it; §3 permits a non-extractable `CryptoKey` handle in
`app-store.ts`'s `vaultKey` and in the IndexedDB `session` store. A PIN-derived
KEK is by construction an app-level key, and a PWA has no access to Keychain or
Android Keystore at all — US-2's stated mechanism is not implementable on this
platform.

**Why this is critical.** Under §0's rule the epic file wins, which makes the
mandatory PIN (FR-7) a contract violation rather than a feature — and FR-7 is
precisely what SM-2 is written to test (*"including a device with only the PIN
configured"*). The authoritative document forbids the thing the primary security
metric validates. This is the single largest disagreement in the set, and unlike
Finding 1 it is not covered by any existing drift note.

**Disposition.** `wallet-security.md` must be rewritten, not the PRD. It needs a
third story for the mandatory PIN fallback, US-1's "rather than a typed password"
and "never falls back" wording corrected to "never falls back to exposing the key
without a *successful authentication by a configured Unlock Method*", and US-2's
platform-secure-storage mechanism replaced with the wrap/unwrap ceremony actually
shipped (`docs/decisions.md` §4). Until that lands, FR-6/7/8 should carry an
explicit note that they supersede `wallet-security.md` pending its repair.

---

## Finding 3 — The epic files are silent on FR-9, FR-10, FR-11 and FR-41; those figures trace to `docs/decisions.md` §2, not to the authoritative set

**Severity: high**

**Involved:** FR-9, FR-10, FR-11, FR-41 · `wallet-security.md` ·
`network-selection.md` · `docs/decisions.md` §2 lines 27, 28, 36 and §5.1

The task asked whether the epic files *agree* with these numbers. They neither
agree nor disagree: **they are silent.** A grep across all twelve epic files for
`PIN`, `backoff`, `inactivit`, `failover` and `backup endpoint` returns only two
incidental hits (`app-versioning-and-updates.md` US-1 and `in-app-notices.md`
US-8, both merely using the word "PIN" in passing copy). The silence is the
finding.

| FR | PRD claim | Epic file | Verified source |
|---|---|---|---|
| FR-9 | Exponential backoff from the **3rd** consecutive failure; full re-import required after **8** | `wallet-security.md` — silent | `docs/decisions.md` §2 line 28, **verbatim match** |
| FR-10 | Auto-lock default **5 min**, configurable **1/5/15/30** | `wallet-security.md` — silent | `docs/decisions.md` §2 line 27, verbatim match |
| FR-11 | Immediate lock on backgrounding on coarse-pointer devices; **30 s** grace on desktop | `wallet-security.md` — silent | `docs/decisions.md` §2 line 27 + §5.1 (which records this as a resolved contradiction between §2 and `useAutoLock`) |
| FR-41 | One hardcoded primary **plus one hardcoded backup** endpoint per Network, with failover | `network-selection.md` US-1 names one default endpoint per network (`xrplcluster.com`, `s.altnet.rippletest.net`) and **no** backup or failover | `docs/decisions.md` §2 line 36, verbatim match; confirmed in `src/lib/xrpl/networks.ts` (`wsUrlBackup`) |

FR-41 is the one with a live mismatch rather than pure silence:
`network-selection.md` documents a single endpoint per network, so an
implementer reading only the authoritative set would not build failover at all.

The same provenance pattern covers six further FRs whose functional detail
exists only in `docs/decisions.md` §2 and in no epic file: **FR-2** (the
`lsfDisableMasterKey` warning on import, line 30), **FR-20** (the mandatory
pre-sign confirm step), **FR-21** (first-time-destination warning, line 25),
**FR-24** (`LastLedgerSequence` expiry, from §5.5), **FR-25** and **FR-34**
(frozen trust lines, line 32), and **FR-45** (the Address Book, line 26 — see
Finding 4).

**Disposition.** These are not orphan FRs — every one is sourced and shipped —
but §0's authority claim is false for them: ten FRs' functional detail is absent
from the document the PRD names authoritative. Either add the missing stories to
`wallet-security.md` and `network-selection.md` (preferred; it is the epic files
that are incomplete), or amend §0 to name `docs/decisions.md` §2 as co-authoritative
for story-level detail. Do not change the numbers — all four were checked and all
four are correct.

---

## Finding 4 — Confirmed: `INDEX.md` lists no Address Book epic and no such epic file exists

**Severity: medium** (contract gap; the PRD's report of it is accurate)

**Involved:** `docs/user-stories/INDEX.md` · `prd.md` §4.11, FR-21, FR-45,
§11 · `addendum.md` §7

**Verified precisely, three ways:**

1. `INDEX.md` § Scope, "In scope" list — eight bullets, none an address book or
   local address labels.
2. `INDEX.md` § Epics table — exactly **twelve** rows, matching the twelve files;
   no Address Book row.
3. Directory listing of `docs/user-stories/` — thirteen files total: `INDEX.md`
   plus exactly the twelve epic files. **No address-book epic file exists.**
4. § Quick Reference — no address-book fact; nothing about local labels.

The capability does ship: `docs/decisions.md` §2 line 26 decides it (*"Yes, add
as a new epic. Local-only labels tied to addresses, no on-chain component"*), and
`PRODUCT.md` lists it in scope.

**Conclusion: `prd.md` §4.11 and `addendum.md` §7 are correct, and so is the
`[ASSUMPTION]` in §11.** No correction to the PRD is warranted. The defect is in
the input: the authoritative functional contract does not name a shipped
capability, and FR-21 (the first-time-destination warning) tests "first time"
against a store that contract does not acknowledge exists.

**Disposition.** Write `docs/user-stories/address-book.md` and add it to both the
`INDEX.md` in-scope list and its Epics table; `docs/decisions.md` §2 already said
this should be an epic, and creating it closes FR-21's and FR-45's contract gap
as well. Note this also makes the "twelve epics" count in `CLAUDE.md`,
`INDEX.md`, and `prd.md` §4 become thirteen — a coordinated edit, not a local one.

---

## Finding 5 — Systemic: most FRs compress a multi-criterion story into one line, dropping acceptance criteria wholesale

**Severity: high** (as a pattern; the five money- and key-safety instances are
broken out as Findings 6–10)

**Involved:** most of FR-1 … FR-56, against every epic file

The PRD's stated job is "globally numbered, stable functional requirements", not
a restatement — §0 is explicit that it must not copy the record. But compression
has crossed from *not restating* into *not covering*: a story with five
acceptance criteria repeatedly becomes a one-sentence FR, and the dropped
criteria are not merely detail — several are the behaviour.

Representative instances, excluding the five broken out below:

| Epic story | Criterion in the epic file | FR | What the FR says |
|---|---|---|---|
| `account-onboarding` US-2 | Rejects malformed seeds with a clear error "without leaking any partial derived data"; fetches account state immediately after import | FR-2 | Neither; instead adds the `lsfDisableMasterKey` check (Finding 3) |
| `account-onboarding` US-4 | Detects activation via `account_info` succeeding and **updates the UI without requiring reimport** | FR-4 | Distinguishes no-Account from zero-Spendable only |
| `account-onboarding` US-6 | Wallet offers to **display the seed again** from a settings screen, behind a confirmation/auth step | FR-3 | Reveal requires a confirm step; no re-display-from-settings requirement |
| `multi-wallet` US-1 | Each wallet gets a **local, editable label** | — | **No FR.** FR-45 labels *addresses*, not wallets |
| `multi-wallet` US-2 | Switcher shows per wallet: label, address, current-network balance, activation status; list reflects the selected Network | FR-13/14 | "Add, list, and remove"; no list contents |
| `multi-wallet` US-3 | Active wallet is **clearly and persistently visible (e.g. in a header) so the user always knows which wallet they are about to act with before sending** | FR-14 | "Exactly one Active Wallet"; no persistent indicator |
| `multi-wallet` US-4 | If the removed wallet was active, prompt for a new active wallet or show the no-wallets onboarding state | FR-13 | Confirm step + teardown only |
| `sending-payments` US-2 | Selectable tokens restricted to trust lines with a **positive balance**; recipient trust-line check with warning; amount validated against balance | FR-17 | "subject to a Trust Line existing" — existence, not positive balance |
| `sending-payments` US-3 | Fee shown **in XRP, not just drops** | FR-18 | Fee shown before the confirm step |
| `tokens-and-trustlines` US-1/US-4 | Wallet **checks the user has enough spendable XRP** before submitting; shows spendable before, reserve cost, and spendable after | FR-31 | "The Owner Reserve cost is stated" |
| `tokens-and-trustlines` US-3 | **Only zero-balance lines are closable**; reserve refunded on validation; explains the send-it-away-first path otherwise | FR-33 | Irreversible + confirm step |
| `transaction-history` US-1/US-2 | Row shows date/time, type, asset, amount, counterparty; detail shows hash, amount, fee, sender, recipient, destination tag, timestamp, validated ledger index, result code, plain-language failure reason | FR-36/37 | "Sent and received distinguished"; "including result code and fee" |
| `transaction-history` US-3 | **A filter/toggle** for only-sent or only-received | FR-36 | Distinguished, not filterable |
| `viewing-balances` US-1/US-3 | Balance **refreshable on demand**; zero-balance trust lines separated from holdings into a separate/collapsed section | FR-29/30 | Neither |
| `block-explorer-links` US-1 | Opens in an **external browser/new tab, not embedded in-app** | FR-42 | Network correctness and shared components only |
| `block-explorer-links` US-4 | If an address or hash has not finished loading, the explorer action is **disabled rather than linking to an empty or wrong path** | FR-42/44 | Neither |
| `in-app-notices` US-3 | Every persistent notice has a **visible, keyboard-reachable dismiss control**; dismissing one never dismisses an unread other | FR-54 | Non-expiry only |
| `app-versioning` US-2 | Distinguishes "no update" from "**could not tell**"; check never cached by the SW; never touches a ledger endpoint; non-blocking indicator, no modal; manual "Check for updates" | FR-47 | A manifest lets an instance learn a newer build exists |
| `app-versioning` US-6 | **Prominence follows the semver bump (V4)**; a security fix is **marked as such independently of its bump** | FR-49 | "The user sees what changed before accepting" |
| `app-versioning` US-7 | Publishes source tag **and asset hashes**; links verification instructions; **does not claim to verify itself** and must not imply otherwise | FR-50 | Byte-identical rebuild "so a user can verify what is served is what was published" — which leans toward the implication US-7 forbids |
| `app-versioning` US-8 | Ordered recovery path: reload → reinstall the PWA → last-resort re-import; release notes state whether a **downgrade** is possible for vault/storage format changes | FR-51 | The never-clear-site-data rule only |

Two of these deserve a note beyond compression. **FR-49's omission of V4** drops
a behaviour `docs/decisions.md` §10.1 records as a gap that was *found and
closed* — bump-based prominence had no effect outside Settings — so losing it
from the PRD is an active regression risk, not a detail. **FR-50's phrasing**
edges into the self-verification claim US-7 explicitly forbids; US-7's reasoning
("SRI is not a substitute — an attacker controlling the origin controls
`index.html`") has no home anywhere in `prd.md` or `addendum.md`, though
`INDEX.md` § Quick Reference states it too.

**Disposition.** Do not inflate every FR into its story. Add a single sentence to
each §4.x feature heading stating that the epic file's acceptance criteria are
binding in full and the FRs enumerate rather than bound them — then fix the
individual FRs in Findings 6–10 and the two noted above (FR-49, FR-50) by text,
because those carry consequence rather than detail.

---

## Finding 6 — FR-19 omits the only blocking behaviour in the destination-tag story

**Severity: high** (money can be lost)

**Involved:** `docs/user-stories/sending-payments.md` US-4 · FR-19

**Epic file:** *"Destination tag field accepts a 32-bit unsigned integer. If the
destination account has the 'Require Destination Tag' flag set, the wallet
**blocks submission** until a tag is entered."* (`lsfRequireDestTag`, checked via
`account_info`.)

**PRD:** FR-19, in full — *"The user can attach a destination tag to a payment."*

A tagless payment to an exchange's omnibus address is the canonical way to lose
funds irrecoverably in self-custody, and the epic file's answer is a hard block.
FR-19 states an optional convenience. No other FR carries the block.

**Disposition.** Correct FR-19: add the 32-bit unsigned range validation and the
`lsfRequireDestTag` submission block as bullets.

---

## Finding 7 — No FR carries `network-selection.md`'s rule that a faucet-returned seed is never ingested

**Severity: high** (key material)

**Involved:** `docs/user-stories/network-selection.md` US-2 · FR-40

**Epic file:** *"Calling it requests funds for the wallet's own address; **the
wallet does not accept or display any seed the faucet might return**"* — plus:
show the funded amount and refresh balance/activation once the funding
transaction validates, and on failure (rate-limited, faucet unavailable) show a
clear **non-blocking** error and allow retry.

**PRD:** FR-40 covers Testnet-only availability and the explained Mainnet
absence. It does not mention the seed rule, the post-validation refresh, or the
retryable non-blocking failure.

The seed rule is a key-custody constraint, not a faucet detail: the Testnet
faucet's other calling convention returns a freshly generated seed, and a wallet
that ingested one would be holding key material it did not generate, in
contradiction of FR-1 and NFR-2.

**Disposition.** Correct FR-40: add the never-ingest-a-faucet-seed rule as a
bullet, and the post-validation refresh and retryable failure alongside it.

---

## Finding 8 — FR-16 drops all three pre-send warnings and X-address support

**Severity: high** (money can be lost; a capability is unspecified)

**Involved:** `docs/user-stories/sending-payments.md` US-1 · FR-16

**Epic file, four criteria:** validates the destination address format —
**classic or X-address** — before submission; **warns if the amount would drop
the sender below the required reserve**; **warns if the destination account does
not exist yet and the amount is below the base reserve** (the payment would fail
to activate it); signs locally and submits.

**PRD:** FR-16, in full — *"The user can send XRP to an address from the Active
Wallet."*

Both warnings describe sends that fail *and* consume their fee — exactly the
outcome FR-23 exists to report after the fact and the epic file exists to prevent
beforehand. Separately, **X-address support appears in no FR anywhere**; it is a
distinct address format with distinct validation, and FR-16's bare "an address"
does not imply it.

**Disposition.** Correct FR-16: add classic-or-X-address validation, the
below-reserve warning, and the unfunded-destination-below-base-reserve warning as
bullets.

---

## Finding 9 — FR-46 drops the build stamp's pre-unlock reachability and its commit identity

**Severity: high** (a gap `docs/decisions.md` §10.2 records as found and closed)

**Involved:** `docs/user-stories/app-versioning-and-updates.md` US-1 · FR-46

**Epic file, five criteria:** Settings shows release version, **short commit
SHA**, and build date; values are baked in at build time, never fetched; **the
SHA links to that commit in the public repository**; the version is never
"unknown"/"dev"/empty in a release build and **a missing stamp fails CI**; *"the
same values are reachable **without unlocking the wallet**, so a user can
identify a build before entering a PIN."*

**PRD:** FR-46, in full — *"A build stamp is baked in at build time and is
visible in the app."*

The last criterion is the whole point of the epic — identifying the code that is
about to hold your keys, *before* handing it your credential —
and `docs/decisions.md` §10.2 records it as a gap a literal re-read of the
acceptance criteria caught and closed (the stamp was unreachable before unlock,
and was then surfaced on `Unlock` and on `Onboarding`'s first screen). A PRD that
states only "visible in the app" re-opens it. The commit-SHA link is also what
makes the version meaningful for a source-available build, per the epic's own
Relevant-mechanism note.

**Disposition.** Correct FR-46: add the commit SHA and its repository link, the
CI-fails-on-missing-stamp rule, and pre-unlock reachability as bullets.

---

## Finding 10 — FR-28 drops the undeliverable-token rule, the one place receiving could state a falsehood

**Severity: medium-high**

**Involved:** `docs/user-stories/receiving-payments.md` US-4, US-2 · FR-28, FR-27

**Epic file, US-4:** *"If a token payment arrives for a currency with no existing
trust line, the wallet explains that the payment **could not be delivered** (it
would have failed on-ledger) rather than showing a false 'received' state."*

**PRD:** FR-28's bullet says only *"XRP and token receipts are distinguished."*
Distinguishing asset type is not the same requirement as refusing to render an
undeliverable payment as received — the latter is the app declining to state
something untrue about money, which is the disposition §1 of the PRD claims for
the whole product.

Also in this epic, **US-2's first criterion is uncovered**: *"If the **user's
own** account is configured to require a destination tag, the wallet surfaces
that requirement prominently next to the address/QR code."* FR-27 covers only the
user *including* a tag in what is shared, and says nothing about surfacing the
account's own `lsfRequireDestTag`. US-2's standard-XRPL-URI QR payload is
likewise unstated.

**Disposition.** Correct FR-28 (add the no-false-received rule) and FR-27 (add
the own-account requirement surfacing, and the URI-format QR payload).

---

## Finding 11 — Minor uncovered criteria and unsourced PRD claims

**Severity: low**

- **`in-app-notices.md` US-7** requires that *"a bracketed result code never
  breaks across two lines, where it would read as two codes"*, and names the two
  exact longest strings to test. NFR-9 and SM-6 cover 320px and 200% zoom
  generically; the no-break rule is uncovered. It is a correctness rule about a
  money-result string, not typography.
- **`app-versioning-and-updates.md` US-9** requires that *"startup never blocks
  on the update check"* and that the Settings version is correct offline. FR-52
  covers the shell and the never-cache-ledger-data rule; the non-blocking-boot
  criterion is uncovered.
- **`tokens-and-trustlines.md` US-2** requires showing *total XRP locked in owner
  reserves* (`owner_count` × owner reserve). FR-29's reserve separation is
  account-level; the trust-line-attributed total is uncovered.
- **`block-explorer-links.md` US-3** requires a "View on explorer" action on the
  balances *and* trust-lines screens specifically. FR-42's blanket "every address
  and hash links out" arguably subsumes it; flagged for completeness only.
- **FR-32 ("Edit a Trust Line limit")** has no story in
  `tokens-and-trustlines.md` (US-1 create, US-2 view, US-3 remove, US-4 warn) and
  no entry in `docs/decisions.md` §2. It is the nearest thing to a true orphan FR
  in the set — a benign superset, but unsourced.
- **FR-35 (`account_lines` pagination)** has no epic-file basis; only
  `transaction-history.md` US-1 mentions pagination, and that is `account_tx`
  markers. Technically correct, unsourced.
- **`prd.md` §3 glossary** asserts *"Testnet is the first-run default"*. No epic
  file states a default network — `network-selection.md` US-1 requires only that
  the switch offer exactly two options and that the current network be
  persistently visible. The claim is nonetheless **true as shipped**
  (`src/store/app-store.ts` line 57: `network: 'testnet'`), so it is an unsourced
  but accurate glossary entry. It should be stated in `network-selection.md`.
- **FR-29's** *"Where a figure is an upper bound, it says so"* has no basis in
  `viewing-balances.md`; its nearest authoritative home is
  `in-app-notices.md` US-5 (*"says so honestly when the delivered amount is only
  an upper bound"*), which is about a notice rather than a balance.

**Disposition.** Fold into the same editing pass as Finding 5. FR-32 and FR-35
should either gain an epic story or be annotated as decisions-sourced.

---

## Coverage table — epic file → FRs claiming to cover it

Mapping taken from the `*Detail:*` line under each `prd.md` §4.x heading.

| Epic file | PRD feature | FRs claiming coverage | Uncovered criteria found |
|---|---|---|---|
| `account-onboarding.md` (US-1…6) | §4.1 | FR-1 … FR-5 | US-2 malformed-seed error + immediate state fetch; US-4 activation detected without reimport; US-6 re-display seed from Settings (Finding 5) |
| `wallet-security.md` (US-1…2) | §4.2 | FR-6 … FR-12 | **Direct contradiction** on passkey-only unlock and platform-held KEK (Finding 2); file is silent on FR-9/10/11 (Finding 3) |
| `multi-wallet-management.md` (US-1…4) | §4.3 | FR-13 … FR-15 | US-1 per-wallet editable label (**no FR at all**); US-2 switcher contents + network scoping; US-3 persistent active-wallet indicator; US-4 re-select active after removal (Finding 5) |
| `sending-payments.md` (US-1…6) | §4.4 | FR-16 … FR-25 | US-1 X-address + two pre-send warnings (Finding 8); US-4 tag range + `lsfRequireDestTag` block (Finding 6); US-2 positive-balance restriction; US-3 fee in XRP. FR-20/21/24/25 are decisions-sourced (Finding 3) |
| `receiving-payments.md` (US-1…4) | §4.5 | FR-26 … FR-28 | US-4 no-false-received for an undeliverable token; US-2 own-account tag requirement + URI QR payload (Finding 10) |
| `viewing-balances.md` (US-1…3) | §4.6 | FR-29 … FR-30 | US-1/US-3 refresh on demand; US-3 zero-balance lines separated from holdings (Finding 5) |
| `tokens-and-trustlines.md` (US-1…4) | §4.7 | FR-31 … FR-35 | US-1 spendable-XRP sufficiency check; US-4 before/after spendable projection; US-3 zero-balance-only constraint + reserve refund; US-2 total reserve locked. FR-32 and FR-35 have no story (Findings 5, 11) |
| `transaction-history.md` (US-1…3) | §4.8 | FR-36 … FR-37 | US-3 sent/received **filter** control; US-1 row fields; US-2 seven of nine detail fields + plain-language failure reason (Finding 5) |
| `network-selection.md` (US-1…3) | §4.9 | FR-38 … FR-41 | US-2 never-ingest-a-faucet-seed, post-validation refresh, retryable failure (Finding 7); **FR-41's backup endpoint contradicts** the file's single-endpoint statement (Finding 3); first-run default unstated (Finding 11) |
| `block-explorer-links.md` (US-1…4) | §4.10 | FR-42 … FR-44 | US-1 external tab, not embedded; US-4 action disabled while an identifier is still loading (Finding 5) |
| **— none —** (Address Book) | **§4.11** | **FR-45**, and FR-21 depends on it | **No epic file and no `INDEX.md` entry exist.** Confirmed four ways; `prd.md` and `addendum.md` §7 report this accurately (Finding 4) |
| `app-versioning-and-updates.md` (US-1…9) | §4.12 | FR-46 … FR-52 | US-1 commit SHA, repo link, CI gate, pre-unlock reachability (Finding 9); US-2 "could not tell", SW-never-caches, manual check; US-6 V4 prominence + security marking; US-7 published hashes, no self-verification claim, SRI-is-not-a-substitute; US-8 ordered recovery + downgrade note; US-9 non-blocking boot (Findings 5, 11). **V1–V4 table stale** (Finding 1) |
| `in-app-notices.md` (US-1…8) | §4.13 | FR-53 … FR-56 | US-3 dismiss control; US-7 no-break result code (Findings 5, 11). **N1–N4 table stale — the PRD is ahead of the epic file here** (Finding 1) |
| `INDEX.md` § Quick Reference | §3 glossary, throughout | — | Glossary is consistent with it; the SRI point from § Quick Reference has no PRD home (Finding 5) |

**Orphan FRs — no basis in any epic file:** FR-32, FR-35 (unsourced anywhere);
FR-2, FR-9, FR-10, FR-11, FR-20, FR-21, FR-24, FR-25, FR-34, FR-41, FR-45
(sourced in `docs/decisions.md` §2/§5, not in the authoritative set — Finding 3).

**Epic files with no disagreement beyond compression:** `viewing-balances.md`,
`transaction-history.md`, `block-explorer-links.md`.

---

## Summary of dispositions

| # | Severity | Fix lands in |
|---|---|---|
| 1 | critical | `prd.md` §0 (qualify the tie-break) **and** the two stale epic-file decision tables |
| 2 | critical | `docs/user-stories/wallet-security.md` (rewrite for the PIN and the shipped ceremony); annotate FR-6/7/8 meanwhile |
| 3 | high | `wallet-security.md` + `network-selection.md` (add the missing stories), or `prd.md` §0 (name §2 co-authoritative). Numbers are all correct — do not change them |
| 4 | medium | New `docs/user-stories/address-book.md` + `INDEX.md`; **no PRD change** — the PRD's report is accurate |
| 5 | high | `prd.md` §4.x headings (one binding-criteria sentence), plus FR-49 and FR-50 by text |
| 6 | high | FR-19 |
| 7 | high | FR-40 |
| 8 | high | FR-16 |
| 9 | high | FR-46 |
| 10 | medium-high | FR-28, FR-27 |
| 11 | low | Folded into Finding 5's pass; annotate FR-32 and FR-35 |
