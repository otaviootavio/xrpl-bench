# Review — money, key-handling, and irreversibility claims

**Scope:** `prd.md` and `addendum.md` in this folder, reviewed as *requirements*:
does the wording force a correct implementation and exclude an incorrect one?
Cross-checked against `docs/user-stories/INDEX.md` § Quick Reference and
`docs/agents/{money,keys-and-secrets,ledger-io}.md`.

**Important framing.** Several findings below describe behaviour the **shipped code
already gets right** — `delivered_amount`, `lsfRequireDestTag`, `OwnerCount`,
`account_lines` marker-following. The defect is in the PRD, not the build: the PRD
declares itself the input to "epics and stories, architecture, UX, and sprint
scoping", so a downstream author working from `prd.md` alone would be free to
re-introduce every one of these. §0's "where an FR and an epic file disagree, the
epic file wins" does not help, because in each case the epic file *says something*
and the FR says *nothing* — silence is not disagreement, and nothing in the PRD
tells a story author that the FR list is incomplete on these points.

---

## Facts that check out

Stated so the failures below are not read as a blanket objection to §3.

- **1 XRP = 1,000,000 Drops** — correct.
- **Base Reserve 1 XRP, Owner Reserve 0.2 XRP each** — correct post-2024-amendment
  values, and correctly hedged as "at time of writing" with FR-29 requiring a live
  `server_state` read. The `[ASSUMPTION]` in §11 for this is well placed.
- **"An address becomes an Account only on receiving at least the Base Reserve;
  there is no 'create account' transaction"** — correct, and FR-4's insistence on
  distinguishing "no Account" from "Account with zero Spendable Balance" is the
  right consequence to draw from it.
- **Spendable = balance − base − (owner × owned objects)** — the *formula* is
  correct. Its input definition is not; see H-3.
- **FR-24's "Retry issues a fresh transaction with a new sequence number. The same
  signed blob is never blind-resubmitted."** — correct, and the sharpest
  money-safety sentence in the document. Matches `ledger-io.md`.
- **Sequence-number and Trust-Line semantics in §3** — consistent with INDEX.md.
- **FR-52's "Ledger data is network-first and never cached"** — correctly refuses
  the cached-balance failure mode, and is consistent with NFR-4 and SM-C2.

---

## CRITICAL

### C-1 — Partial payments are absent from the PRD entirely (FR-28, FR-36, FR-37, FR-16, FR-17)

**The problem.** No requirement in the PRD mentions `tfPartialPayment`,
`delivered_amount`, or `DeliveredAmount`. The word "partial" does not appear.
This is the best-known permanent-money-loss class on XRPL: when the flag is set,
the `Amount` field (normalised to `DeliverMax` in API v2) is the *maximum the
sender was willing to deliver*, not what arrived. Only `delivered_amount` in the
transaction metadata is trustworthy. A history or incoming-notice implementation
that reads `Amount` will credit a receiver with an amount they did not receive —
and §1's "The displayed balance is the ledger's balance" and SM-1's "No wrong
money, ever" are then both false by construction.

The risk splits in two and the PRD covers neither half:

- **Receive side.** FR-28 ("An incoming payment raises a notice"), FR-36
  ("Chronological history… Sent and received are distinguished") and FR-37 ("Any
  entry expands to its detail, including result code and fee") never say which
  field the amount comes from. `src/lib/xrpl/reads.ts` does it correctly
  (prefers `meta.delivered_amount`, falls back to `DeliverMax ?? Amount` only for
  non-Payments or when delivered is `"unavailable"`), and its comment records the
  v2 `DeliverMax` rename verified live on 2026-08-31. None of that survives into a
  requirement.
- **Send side.** Nothing forbids the app from *setting* `tfPartialPayment`. A send
  path that sets it for an issued-currency payment can deliver far less than the
  confirmed amount while returning `tesSUCCESS` — which silently defeats FR-20's
  confirm step and §1's "The amount signed is the amount intended".

Note also that FR-29's "Where a figure is an upper bound, it says so" is *not*
coverage of this. The code's `amountIsUpperBound` flag fires only on
`delivered_amount: "unavailable"`, a legacy pre-2014 case. The live risk is the
opposite shape: for a modern partial payment `delivered_amount` is **present** and
can be orders of magnitude below `Amount`, so nothing is flagged as an upper
bound — the wrong number simply looks exact.

**Suggested wording** — add two FRs, and amend FR-36/FR-37:

> **FR-57: Received amounts come from `delivered_amount`, never from `Amount`.**
> For any `Payment` the app displays — in the Annunciator (FR-28), in history
> (FR-36), or in transaction detail (FR-37) — the amount shown is
> `meta.delivered_amount`. The transaction's `Amount` / `DeliverMax` field is
> never displayed as a received amount, because with `tfPartialPayment` set it is
> only the sender's maximum.
> - Where the ledger reports `delivered_amount: "unavailable"`, the figure shown
>   is labelled an upper bound in visible text (NFR-1, FR-29).
> - A transaction carrying `tfPartialPayment` is badged as a partial payment
>   wherever its amount appears, not by colour alone (NFR-6).
>
> **FR-58: The app never sends a partial payment.** No transaction the app builds
> sets `tfPartialPayment`. The amount signed is the amount the user confirmed in
> FR-20; there is no flag combination under which a `tesSUCCESS` result can mean
> less was delivered than was confirmed.

### C-2 — Nothing requires detecting a destination that *mandates* a tag (FR-19, FR-20, FR-16)

**The problem.** FR-19 is "The user **can** attach a destination tag to a payment."
That is a capability, not a safety requirement. Sending to an exchange or any
address with `lsfRequireDestTag` set, without a tag, is the single most common way
retail users lose funds permanently: the payment succeeds on-ledger, the receiving
operator cannot attribute it, and recovery is discretionary at best.

`docs/user-stories/sending-payments.md` names the mechanism
("`lsfRequireDestTag` account flag, checked via `account_info`") and
`src/pages/tabs/SendTab.tsx` implements it (`!destInfo?.requireDestTag ||
destTag.length > 0` gating submit). The PRD carries none of it — FR-19 as written
is fully satisfied by an input box.

There is a second, subtler half the requirement must also close.
`src/pages/tabs/__tests__/send-destination-error.test.tsx` records a real defect:
when the destination read *failed*, `destInfo` was undefined, so
`!destInfo?.requireDestTag` was **satisfied by the failure** and the send was
allowed. A requirement written as "block when the flag is set" reproduces that bug
exactly; it must be written as "allow only when the read succeeded and the flag is
clear".

**Suggested wording** — replace FR-19:

> **FR-19: Destination tag, including required-tag detection.**
> The user can attach a destination tag to a payment.
> - Before the confirm step the app reads the destination's `account_flags` via
>   `account_info`. If `lsfRequireDestTag` is set, a payment without a tag cannot
>   be submitted; the control is `aria-disabled` with the reason in visible text
>   (§9.1).
> - An **indeterminate** destination read — network failure, failover exhausted,
>   or any error — blocks the send and says so. Absence of a positive "tag not
>   required" answer is never treated as "tag not required".
> - A destination that does not yet exist on-ledger is reported as such, together
>   with the Base Reserve minimum a first payment to it must carry (§3, FR-4).

### C-3 — FR-9's eight-failure wipe is irreversible and has no forewarning requirement (FR-9 vs NFR-7)

**The problem.** FR-9: "after eight consecutive failures the Wallet requires full
re-import from seed." That is destructive, irreversible, and — for a user whose
seed backup is imperfect — **permanent total loss of the funds in that Wallet**.
It is the only irreversible action in the PRD with no requirement covering the
user's awareness of it, and it is the one the user does not choose: it arrives as
a consequence of typos. NFR-7 ("Every irreversible action states its exact
consequence in plain language **before it proceeds**") is therefore violated
inside the PRD's own frame, because a confirm step is structurally impossible
here — the only place the consequence can be stated is *in advance of the
remaining attempts*.

Worse, FR-9's wording is ambiguous about what is destroyed. "Requires full
re-import from seed" could be implemented as a lockout flag (recoverable by
unlocking correctly later) or as destruction of the vault (not recoverable
without the seed). Those differ by the user's entire balance. A requirement about
destroying key material must not be ambiguous on whether key material is
destroyed.

**Suggested wording:**

> **FR-9: Failed-attempt backoff and hard reset.**
> Exponential backoff begins at the third consecutive failed unlock attempt.
> After eight consecutive failures the Vault's wrapped Master Key and all
> encrypted seed material for the affected Wallet are **destroyed on-device**;
> the Wallet can only be restored by re-importing its seed (FR-2), and is
> unrecoverable without it.
> - From the third failed attempt onward, every failure states the remaining
>   attempt count and the exact consequence of exhausting it, in visible text, in
>   plain language, and without relying on colour (NFR-6, NFR-7).
> - The message names the loss explicitly: funds are unrecoverable without the
>   seed recorded in FR-3.
> - An unlock failure is only ever a failed decryption (FR-8); no other condition
>   increments the counter.

---

## HIGH

### H-1 — FR-8 + NFR-2 would **not** have prevented the recorded defect. Answer: no.

The task asks this directly, so it is answered directly. **No — as written, FR-8
plus NFR-2 is not tight enough to have prevented the addendum §2 defect, and it
is provably not tight enough to prevent the closely related one already recorded
in this repo.**

FR-8's operative claim is "A wrong credential fails on the AES-GCM authentication
tag, not on an application-level comparison."

- **On the first half of the §2 defect** ("any PIN unlocked the app") FR-8 does
  bite. An implementation that compares a derived value or trusts a successful
  derivation is excluded by that sentence. Credit where due.
- **On the second half** ("the PIN and the passkey each derived their own
  unverified key rather than unwrapping one shared Master Key") FR-8 does *not*
  bite on its own. The only text that requires a single shared Master Key is the
  §3 glossary entry and the §4.2 prose description. FR-8's own bullets say
  "Any future Unlock Method follows the same wrap/unwrap contract" without ever
  stating what that contract is or that there is exactly one Master Key. A story
  author extracting FRs — which §0 says is this document's purpose — takes FR-8
  and leaves the prose behind.
- **And the auth-tag test is demonstrably insufficient.** `keys-and-secrets.md`
  records a shipped defect at `src/lib/crypto/auth.ts:64`: a stale passkey wrapper
  was carried into a regenerated vault, and "the passkey then unwrapped
  successfully, **with a valid auth tag**, and decrypted none of the newly stored
  seeds." A requirement whose entire test is "the auth tag fails on a wrong
  credential" is satisfied by that state. FR-8 as written does not exclude it.

FR-8 also never says *which* ciphertext is decrypted. "Known ciphertext" appears
only in the §4.2 description. A verifier blob that is not bound to the current
Master Key generation passes FR-8 and still fails to decrypt a single seed.

**Suggested wording** — replace FR-8:

> **FR-8: Unlock is proven by decrypting seed-bearing ciphertext.**
> Exactly one Master Key exists per device installation. It is generated at
> random at setup and wrapped once per configured Unlock Method; no Unlock Method
> ever derives a key that is then trusted.
> - An unlock attempt succeeds only when the unwrapped Master Key **successfully
>   decrypts ciphertext that the current Vault generation actually produced** —
>   a seed record, or a verifier written at the same time as the Master Key it
>   belongs to and invalidated whenever that key is regenerated. A successful
>   unwrap with a valid authentication tag is necessary and **not sufficient**.
> - Vault metadata is constructed from scratch on every write, never by merging
>   previous metadata, so a wrapper for a superseded Master Key cannot survive a
>   re-key.
> - Regenerating the Master Key re-wraps it for **every** configured Unlock
>   Method in the same operation, or the configuration is rejected. It is never
>   possible for one configured method to work and another to fail.
> - A failed decryption is the only unlock-failure path, and is what FR-9 counts.
> - Adding an Unlock Method means wrapping the existing Master Key. Deriving a
>   second independent key is excluded.

NFR-2 is separately sound in substance but incomplete on the *input* path — see
H-2 — and it should name the teardown scope that `keys-and-secrets.md` requires:

> **NFR-2 …** Decrypted key material exists transiently in memory for signing and
> is cleared immediately; a plaintext seed in flight is held in a ref and in an
> uncontrolled input, never in React state. Lock and Wallet removal tear down the
> in-memory key, the persisted session, the query cache, and the service-worker
> cache (FR-12, FR-13).

### H-2 — FR-2 mandates the banned pattern by using "controlled" in its React sense

FR-2: "Seed entry fields are **controlled by the app** and never retain plaintext
after the import completes."

In a React 19 PRD, "controlled" is a term of art meaning *the value lives in React
state*. That is precisely the pattern `keys-and-secrets.md` forbids: "the typed
one in an **uncontrolled** input — a controlled input would put the seed into
React state on every keystroke." As written, FR-2 either mandates a direct NFR-2
violation or, read charitably, is ambiguous in the most expensive possible place.
"Never retain plaintext *after the import completes*" is also the wrong bar: the
violation happens during typing, not after.

**Suggested wording:**

> #### FR-2: Import an existing Wallet from a seed
> - The seed input is an **uncontrolled** DOM input; the typed value never enters
>   React state, a store, or any serialisable structure at any point, including
>   mid-keystroke (NFR-2). The plaintext is read once, held in a ref, and cleared
>   the moment the import flow completes or is abandoned.
> - `autocomplete`, spellcheck, and any value-observing third party are off on
>   that field.

### H-3 — FR-29 / §3 permit counting Trust Lines instead of reading `OwnerCount`

§3 defines Spendable Balance with "(Owner Reserve × owned objects)" and, two
bullets up, glosses Owner Reserve as "XRP locked per owned object … **Each Trust
Line costs one.**" Nothing in FR-29 says where the count comes from.

The reserve-consuming ledger objects are not only Trust Lines — offers, escrows,
Checks, PayChannels, tickets, DID and NFT *pages* (per page, not per NFT) and
signer lists all count, and the set changes by amendment. An implementation that
counts `account_lines` rows therefore **understates the reserve and overstates
Spendable Balance**, which is the direction that costs money: the user is shown
an amount they cannot actually send, and the send returns
`tecINSUFFICIENT_RESERVE` / `tecUNFUNDED_PAYMENT` having consumed its fee. The
shipped code is right (`ownerCount: data.OwnerCount ?? 0`, used by
`useSpendableBalance`); the requirement does not force it, and the glossary's
"Each Trust Line costs one" actively points the wrong way.

The fix is not to enumerate object types — any enumeration will be wrong after the
next amendment, and the NFT-page rule is easy to get wrong. The fix is to name the
authoritative field.

**Suggested wording** — §3, Owner Reserve:

> **Owner Reserve** — XRP locked per owned ledger object the Account holds (0.2
> XRP each at time of writing). A Trust Line is one such object; so are offers,
> escrows, Checks, tickets, signer lists, and others, and the set can change by
> amendment. The count is always the `OwnerCount` field of `account_info` — never
> derived by counting rows of `account_lines` or any other list.

and FR-29, first bullet:

> - The owned-object count is `account_info`'s `OwnerCount`; Base Reserve
>   (`reserve_base`) and Owner Reserve (`reserve_inc`) come live from
>   `server_state`. None of the three is hardcoded or inferred from a list length.

### H-4 — "read live from `server_state`" does not state the units, and the units are a 10⁶ error

§3 and FR-29 both say the reserve figures are "read live from `server_state`".
They do not say what `server_state` returns. `server_state` returns
`validated_ledger.reserve_base` and `reserve_inc` **in drops, as JSON numbers**;
the similarly named `server_info` returns `reserve_base_xrp` **in XRP**. An
implementer who reaches for `server_info` — the more commonly documented
method — and treats its value as drops understates the reserve by a factor of
1,000,000, i.e. shows the Base Reserve as 0.000001 XRP and the full balance as
spendable. The reverse mistake locks 1,000,000 XRP.

This is also an unaddressed **NFR-1** case: these fields arrive as JSON *numbers*,
not strings, so "Money is strings or BigInt end to end" has an entry point the NFR
does not describe. The code launders it through `String(vl?.reserve_base ?? …)`;
nothing requires that.

**Suggested wording** — FR-29 bullet, plus an NFR-1 clause:

> - Reserve values are read from `server_state`'s
>   `validated_ledger.reserve_base` / `reserve_inc`, which are **drops**. The
>   `server_info` fields `reserve_base_xrp` / `reserve_inc_xrp` are in XRP and are
>   not used.
>
> **NFR-1 …** Where the ledger supplies a money value as a JSON number rather
> than a string (`reserve_base`, `reserve_inc`, `fee` fields), it is converted to
> a drops string at the RPC-read boundary before any arithmetic, and its unit is
> asserted at that boundary. No money value is ever arithmetic-ed as a number.

### H-5 — FR-20's confirm step does not include the destination tag

FR-20: "No payment is signed without an explicit confirmation naming destination,
exact amount, and fee." The destination **tag** is missing from that list. Given
C-2 — a tag is what routes funds to the right account at a shared address — a
confirm step that omits it lets a mistyped or silently dropped tag through the one
gate designed to catch exactly this. The tag is as load-bearing as the address.

**Suggested wording:**

> #### FR-20: Mandatory confirm step
> No payment is signed without an explicit confirmation naming the destination
> address **in full** (FR-44), the destination tag **or its explicit absence**,
> the exact amount, the asset (currency and issuer for an issued currency), and
> the fee.
> - The values signed are the values confirmed. The confirm step renders the same
>   formatted strings that the transaction is built from (NFR-1); it never
>   re-derives or re-parses them.
> - Where no tag is attached, the confirm step says "no destination tag" rather
>   than omitting the row.

### H-6 — FR-16 requires no destination validation and no unfunded-destination warning

FR-16 is one sentence: "The user can send XRP to an address from the Active
Wallet." Nothing requires the app to validate the destination at all. Two
permanent-loss and one fee-loss path are left open:

- **No checksum validation.** An XRPL classic address is base58 with a checksum;
  a mistyped address usually fails the checksum and can be rejected client-side.
  Without a requirement, the app can submit to a malformed address, or worse to a
  *valid-but-unintended* one.
- **No X-address handling.** An X-address encodes address *and* destination tag.
  Accepting one and dropping the embedded tag is C-2 with extra steps; rejecting
  one without explanation is merely unhelpful. The PRD says nothing either way.
- **No unfunded-destination warning.** Sending less than the Base Reserve to an
  address that is not yet an Account fails `tecNO_DST_INSUF_XRP` — validated, and
  **the fee is consumed**. FR-4 establishes the concept for the user's own
  address; nothing applies it to a destination.
- **Self-send** to the Active Wallet's own address is not excluded either.

**Suggested wording** — expand FR-16:

> #### FR-16: Send an XRP payment
> The user can send XRP to an address from the Active Wallet.
> - The destination is validated for base58 checksum before the confirm step; an
>   invalid address cannot reach the confirm step, and the reason is in visible
>   text.
> - An X-address is either decoded to its address-and-tag pair, with the decoded
>   tag shown in the confirm step, or refused with a stated reason. It is never
>   accepted with its embedded tag discarded.
> - Where the destination is not yet an Account (§3), the app says so and states
>   that a first payment below the Base Reserve will fail and consume its fee.
> - Affordability is checked as `amount + fee ≤ Spendable Balance` in integer
>   drops before the confirm step is reachable, so an over-send fails in the form
>   rather than costing a fee.

---

## MEDIUM

### M-1 — FR-25 / FR-34 inherit an unresolved contradiction about which freeze blocks a send, and neither covers global freeze

FR-25 and FR-34 both scope to "frozen by its issuer". Two repo sources disagree
about whether that is the right scope:

- `docs/agents/ledger-io.md`: "**Never** offer a frozen asset as sendable.
  `freezePeer` **and** `freeze` both disqualify a line from the send path."
- `src/lib/xrpl/reads.ts` (comment on the `freezePeer` field): "`freeze_peer` —
  **this, not `freeze`** — is the 'frozen by issuer' case that
  `docs/decisions.md` §2 wants badged and blocked from sending."

The PRD silently adopts the narrower reading. That is a contradiction the PRD
*inherits* rather than creates, and it should be resolved in `docs/decisions.md`
§2 — but the PRD's wording currently forecloses the broader reading without
recording that it chose.

Independently, neither FR covers the case neither source mentions: the issuer's
account-level **`lsfGlobalFreeze`** flag freezes every line of that issuer at
once, and does not appear on the holder's `account_lines` row at all. A send path
that only inspects `freeze` / `freeze_peer` will offer a globally frozen asset as
sendable and burn a fee on `tecFROZEN`.

**Suggested wording:**

> #### FR-25: A frozen asset cannot be sent
> An issued-currency asset is not offered as sendable when any of the following
> holds, and the control is `aria-disabled` with the specific reason in visible
> text: the issuer has frozen the Trust Line (`freeze_peer`); this Account has
> frozen it (`freeze`); or the issuer's account carries `lsfGlobalFreeze`.
> - The issuer's global-freeze flag is read from the issuer's `account_flags`, not
>   inferred from the Trust Line row, where it does not appear.
> - `[DECISION NEEDED]` `docs/agents/ledger-io.md` and `src/lib/xrpl/reads.ts`
>   disagree on whether a self-set `freeze` blocks sending. Recorded here as open;
>   resolve in `docs/decisions.md` §2 rather than in an FR.

FR-34's badge should carry the same three cases, and distinguish them in text —
"frozen by issuer", "frozen by you", "issuer freeze (all assets)" are different
facts with different remedies.

### M-2 — Pagination is required for `account_lines` but not for `account_tx`

FR-35 correctly requires completeness for Trust Lines ("`account_lines` is
paginated; the list is complete regardless of Trust Line count"), which is the
right instinct: an incomplete line list hides a token balance. But `account_tx` is
equally paginated by `marker`, and FR-36 says nothing about it. A history silently
truncated at 25 rows fails SM-1's cross-check premise — the user checks the
explorer, sees transactions the app never showed, and cannot tell truncation from
a wrong read.

**Suggested wording** — add to FR-36:

> - `account_tx` is paginated by `marker`. Either the full history is reachable by
>   an explicit user action that follows the marker, or the list states in visible
>   text that it shows the most recent *n* and is not complete. A truncated list
>   is never presented as complete.

### M-3 — No requirement that balance and history reads be against the *validated* ledger

§1 claims "The displayed balance is the ledger's balance" and SM-1 measures
against an explorer cross-check. Neither FR-29 nor NFR-3 requires reads to specify
`ledger_index: "validated"`. Default `current`/open-ledger reads return
provisional state that can change, which produces exactly the class of
explorer-disagreement SM-1 is meant to detect — and makes SM-1 unfalsifiable,
because a mismatch is then expected behaviour rather than a defect.
`fetchAccountLines` passes `ledger_index: 'validated'`; nothing requires it.

**Suggested wording** — add to NFR-3:

> **NFR-3 …** Every ledger read that produces a displayed figure requests
> `ledger_index: "validated"`. Provisional open-ledger state is never displayed
> as a balance. Where a figure is necessarily provisional (a recommended fee, an
> unvalidated submission), it is labelled as such (FR-18, FR-22).

### M-4 — FR-24 permits a retry that double-sends at the sequence boundary

FR-24 marks a transaction "expired, not applied" once the ledger closes past
`LastLedgerSequence`, then allows a retry. The window is narrow but real: the
original transaction can be validated *in* the ledger whose index equals
`LastLedgerSequence`, while the client — having seen that ledger close without a
validation response — concludes expiry. Retrying then sends the payment twice.
"Not applied" is an inference from absence of evidence; the requirement states it
as fact.

**Suggested wording** — add to FR-24:

> - Before a retry is offered, the app confirms the original transaction's absence
>   by looking up its hash (`tx`), not by inference from the ledger index alone.
>   An indeterminate lookup blocks the retry and says why; it never silently
>   becomes "not applied".
> - Only one transaction per Wallet is in flight at a time, so a retry cannot
>   collide with the original's sequence number.

### M-5 — FR-33's trust-line closure names irreversibility but not the consequence

FR-33: "Closing is irreversible and requires an explicit confirm step." Unlike
FR-13 and FR-3, it does **not** say the confirm step states the consequence — so
it is the one confirm requirement in the PRD that NFR-7 does not reach through the
FR's own wording. And the consequence here is specifically monetary and
specifically confusing: a Trust Line with a non-zero balance cannot be deleted; the
balance must first be returned to the issuer. A "close" that silently sets the
limit to 0 leaves the line — and its Owner Reserve — in place, which is a
different outcome from the one the word "close" promises. Conversely, a flow that
does dispose of a non-zero balance is disposing of the user's tokens.

**Suggested wording:**

> #### FR-33: Remove a Trust Line
> The user can close a Trust Line whose balance is zero.
> - Where the balance is non-zero, the app states that the line cannot be removed
>   until the balance is returned to the issuer, and does not offer removal. It
>   never disposes of a token balance as part of a removal.
> - Removal is irreversible and requires an explicit confirm step stating the
>   exact consequence: the line is gone, its Owner Reserve (naming the figure) is
>   released, and the token cannot be received again until a new line is opened
>   (FR-31).

### M-6 — Accepting an update is irreversible in practice and has no confirm requirement

FR-48/FR-49 give the user a changelog and an explicit activation action, and FR-51
promises recovery from a bad update — but no requirement states the consequence at
the moment of acceptance, and activating a new service worker **replaces the
signing code**. §4.12's own framing makes this the highest-trust action in the
product ("a compromised origin cannot silently substitute signing code, because
substitution requires the user to accept a version they can inspect"). NFR-7
should therefore reach it explicitly, and the acceptance step is where FR-50's
reproducibility claim becomes actionable rather than theoretical.

**Suggested wording** — add to FR-48:

> - Activation requires an explicit confirm step naming the build being activated
>   and the build being replaced (FR-46), and stating that activation replaces the
>   code that signs transactions.
> - The confirm step surfaces the published tag and asset hashes the user would
>   need to verify the build against (FR-50), and says plainly that accepting
>   without verifying is an unmitigated trust decision (§9.3, CD-6).

### M-7 — FR-40's faucet amount and FR-4's reserve figure are display paths NFR-1 does not obviously cover

NFR-1 is written about "money" and "a Drops value". FR-4 ("states the Base Reserve
the address must receive"), FR-31 ("The Owner Reserve cost is stated"), FR-18
(fee), FR-23 (a consumed fee), FR-37 (fee), and FR-40 (faucet amount) all render
money that did not come from a balance field, and two of them (FR-4, FR-31)
render a *reserve* — the values H-4 shows arrive as JSON numbers. Nothing in
NFR-1 says these paths use the same formatter. See the NFR-1 amendment in H-4;
additionally:

> **NFR-1 …** This covers every rendered money value without exception —
> balances, spendable figures, reserves, fees, faucet amounts, amounts inside
> notice text and inside confirm-step copy — all through the single
> render-boundary formatter. Issued-currency values keep 15 significant digits and
> XRP amounts 6 decimal places; validation of a user-entered amount is string and
> regex work only.

### M-8 — No requirement governs amount *entry*, only amount display

NFR-1 and FR-29/FR-30 cover the read-and-display direction. The write direction —
the user types an amount and the app converts it to drops — has no requirement at
all. FR-16 and FR-17 do not mention the amount field. That is the one place where
a formatting mistake changes what gets **signed**, which is strictly worse than a
display error: §1's "The amount signed is the amount intended" has no FR behind
it. `docs/agents/money.md` specifies the rules (regex-and-length validation, 6 dp
for XRP, 15 significant digits for issued currencies, no `Number()`); the PRD
should carry them.

**Suggested wording** — new FR in §4.4:

> **FR-59: Amount entry is string-validated and exactly converted.**
> An entered amount is validated by string and regex operations only — never by
> `Number()`, `parseFloat()`, or `parseInt()` — and converted to a drops string
> (XRP) or a decimal string (issued currency) exactly, with no intermediate
> floating-point representation. XRP accepts at most 6 decimal places; an issued
> currency at most 15 significant digits. An amount that cannot be represented
> exactly is refused in the form with the reason in visible text, never rounded.

---

## LOW

### L-1 — §3 "Base Reserve — XRP locked and non-spendable for as long as the Account exists"

True in effect, slightly misleading in mechanism: the reserve is not a separate
locked pot but a floor below which the balance may not be reduced by a
transaction. The distinction matters only for one user-visible case — an *incoming*
payment can never be blocked by the reserve, while an outgoing one can — which
FR-4 and FR-29 do not currently distinguish. A one-clause addition ("it is a floor
on the balance, not a separate held amount; it constrains sends, never receipts")
would close it.

### L-2 — FR-23's `tec`/`tef` taxonomy is incomplete relative to `ledger-io.md`

FR-23 names `tec` and `tef`. `ledger-io.md` specifies three outcome classes that
"cost different money": `tesSUCCESS` applied; `tef*`/`tem*` never applied and cost
nothing; `tec*` in a validated ledger and **consumed its fee**. `tem` (malformed)
and `ter` (retryable) are absent from FR-23, and `ter` in particular is neither
"failed" nor "succeeded" — it may still apply later, which is a materially
different thing to tell a user. Suggest FR-23 enumerate the classes and their fee
consequence rather than naming two prefixes.

### L-3 — FR-1 does not say what happens to an existing Wallet

FR-1 generates a new keypair. §4.3 establishes multiple Wallets, so addition is
the obvious reading — but FR-1 does not say it, and "generate a new Wallet" is one
misreading away from replacing the Vault's contents. One clause ("generating adds
a Wallet; it never replaces, re-keys, or invalidates an existing one") removes the
ambiguity at no cost.

### L-4 — FR-3's "before the Wallet is usable" is weaker than the code's own rule

`keys-and-secrets.md` records that `App.tsx`'s Gate switches to `<Main>` the
instant `wallets.length > 0 && unlocked`, so committing the store early "skips the
backup screen entirely". FR-3's "walked through recording the seed before the
Wallet is usable" is satisfiable by a screen the user can dismiss. Suggest: "no
Wallet is reachable for any read or write, and no state in which it is reachable
is committed, until the backup step is confirmed."

### L-5 — FR-45's Address Book is the trust anchor for FR-21 but has no integrity requirement

FR-21's first-time-destination warning is only as good as the Address Book it
tests against, and FR-45 makes labels "device-local" with no requirement about
what happens on label edit, import, or corruption. A silently emptied Address Book
turns FR-21 from a safety net into noise (everything is first-time); a silently
*populated* one suppresses the warning for an address the user never approved.
Worth one clause: an address enters the Address Book only by explicit user action,
and FR-21's test is "has the user previously sent here", which is not the same
predicate as "is there a label".

---

## Summary of the answers asked for

1. **Is the XRPL domain reasoning correct?** Mostly yes — the reserve figures,
   drops conversion, activation semantics, and FR-24's fresh-sequence rule all
   check out. Three factual problems: the Spendable formula's input is
   under-defined and the glossary points at the wrong source (H-3); the
   `server_state` unit is unstated and the adjacent method uses different units
   (H-4); freeze scope is narrower than at least one repo source requires and
   omits global freeze (M-1). Two whole mechanisms are missing: partial payments
   (C-1) and required-destination-tag detection (C-2).
2. **Do the security claims force a correct implementation?** **No.** FR-8 excludes
   the "any PIN unlocks" half of the recorded defect but not the "each method
   derives its own key" half, and the repo's own `auth.ts:64` defect proves the
   auth-tag test is insufficient — a valid tag unwrapped a stale wrapper and
   decrypted nothing (H-1). FR-2 compounds it by mandating, on the standard React
   reading of "controlled", the exact pattern `keys-and-secrets.md` forbids (H-2).
3. **Irreversibility.** Enumerated: wallet removal (FR-13, covered), seed reveal
   (FR-3, covered — see L-4), trust-line closure (FR-33, confirm required but
   consequence not, M-5), sending (FR-20, covered but incomplete, H-5), accepting
   an update (FR-48/49, no confirm requirement, M-6), and the eight-failure wipe
   (FR-9, **no requirement of any kind covers the user's awareness of it**, C-3).
   One irreversible action with no confirm requirement and no possible confirm
   step: FR-9.
4. **String/BigInt discipline across display paths.** NFR-1 covers the
   balance-shaped paths and names a single formatter, which is the right shape.
   It does not cover money arriving as a JSON number (H-4), does not enumerate the
   non-balance display paths — reserves, fees, faucet amounts, notice and
   confirm-step copy (M-7) — and says nothing about the *entry* path, where a
   conversion error changes what is signed (M-8).

**Verdict.** The PRD is unusually disciplined about process — evidence hygiene,
counter-metrics, `[ASSUMPTION]` marking, and its refusal to restate other
documents are all genuinely good. But as a *specification* it is not yet tight
enough to force a correct money implementation: three critical gaps would let a
downstream author build a wallet that displays amounts that were never delivered,
sends to an exchange without a required tag, and destroys key material without
ever having warned the user. The code, notably, gets all three right today. The
requirement does not.
