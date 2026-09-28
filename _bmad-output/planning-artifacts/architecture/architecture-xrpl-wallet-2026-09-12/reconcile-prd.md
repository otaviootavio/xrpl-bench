# Reconcile — PRD (`prd.md` + `addendum.md`) against `ARCHITECTURE-SPINE.md`

**Input:** `_bmad-output/planning-artifacts/prds/prd-xrpl-wallet-2026-09-12/prd.md`
(status `final`, updated 2026-09-15) and `addendum.md` beside it.
**Spine:** `ARCHITECTURE-SPINE.md` (updated 2026-09-15, AD-13/AD-14/AD-15 and
three new map rows).
**Companion:** `GAP-REGISTER.md` (G-10, G-11, G-12 open).
**Code read:** `src/` at commit `b359058`.

Per the reconcile brief, the spine omitting PRD prose is **not** a finding: it is
a terse build substrate that links rather than restates and deliberately carries
no visual requirements. Findings below are about *routing* — a requirement with
no architectural home, a map row pointing at the wrong module, or a rule the
spine states more weakly or more strongly than the PRD.

---

## 1. Coverage — FR-1..FR-58, NFR-1..NFR-11

`Mapped` = has a row in the Capability → Architecture Map. `AD only` = governed
by an AD or a Conventions row without a map row. `Neither` = no architectural
home in the spine.

| Requirement | Status | Home | Governed by |
|---|---|---|---|
| FR-1, FR-2, FR-3 (generate / import / backup Seed) | AD only | `lib/crypto/keystore.ts` | AD-3 (binds "seed generation, import, signing, reveal, unlock"), AD-5, Conventions "New unlock methods" |
| FR-4 (activation status vs. zero balance) | AD only | `lib/xrpl/reads.ts`, `BalancesTab` | AD-15 in spirit (an absent Account is not a zero balance); no map row |
| FR-5 (view own address in full) | **Neither** | `components/wallet/AddressDisplay.tsx` | — (AD-10 governs the *link*, not the reveal) |
| FR-6..FR-12 (unlock, backoff, auto-lock, teardown) | Mapped | "Unlock and key custody" → `lib/crypto/auth.ts`, `keystore.ts` | AD-3, AD-5 |
| FR-13..FR-15 (multi-wallet) | Mapped | "Wallet and network selection" → `store/app-store.ts` | AD-6 |
| FR-16..FR-25 (send path) | Mapped | "Payments and trust-line writes" → `lib/xrpl/writes.ts` | AD-2, AD-9, AD-7 |
| FR-19 (destination-tag guard) | Mapped + AD | `SendTab` + `useDestinationInfo` | AD-13 (see §5) |
| FR-22, FR-23 (submitted vs. validated; result codes) | Mapped **twice, one wrongly** | writes row (correct) **and** the new read-failure row (wrong — see F-1) | AD-9, Conventions "Result codes" |
| FR-26, FR-27 (share address / QR / tag) | **Neither** | `components/wallet/QrCode.tsx`, `ReceiveTab` | — |
| FR-28 (incoming-payment notice) | **Neither** | `hooks/useIncomingPaymentNotifications.ts` → `lib/notify.tsx` | AD-8 covers the surface; the Notices map row cites only FR-53..56 |
| FR-29, FR-30, FR-35, FR-36 (balances, tokens, pagination, history) | Mapped | "Ledger reads" → `lib/xrpl/reads.ts` via `hooks/` | AD-2, AD-4, AD-6 (+ AD-14, AD-15 unstated in the row) |
| FR-31..FR-33 (trust lines) | Mapped | writes row | AD-2, AD-9, AD-7 |
| FR-34 (frozen marked wherever shown) | Covered elsewhere | `DESIGN.md` is authoritative | Not a finding — visual, deliberately out of the spine |
| FR-37 (transaction detail) | **Neither** | `HistoryTab` row expansion over `TxSummary` | Should fold into the FR-57 row — FR-57 names FR-37 explicitly |
| FR-38..FR-41 (network, faucet, failover) | Mapped | selection row; failover in `lib/xrpl/client.ts` | AD-6, AD-2, AD-12 |
| FR-42..FR-44 (explorer cross-check) | Mapped | `AddressLink.tsx`, `TxLink.tsx` | AD-10 |
| FR-45 (Address Book) | **Neither** | `store/app-store.ts` (`addressBook`) | AD-6 names app-store for `network` + `activeWalletId` only |
| FR-46..FR-52 (versioning and updates) | Mapped | `lib/sw-register.ts`, `hooks/useAppUpdate.ts` | AD-11, AD-9 |
| FR-53..FR-56 (notices) | Mapped | `lib/notify.tsx`, `Annunciator.tsx` | AD-8 |
| FR-57 (delivered amount) | Mapped | `lib/xrpl/reads.ts` | AD-2 (see F-3) |
| FR-58 (never `tfPartialPayment`) | Mapped | `lib/xrpl/writes.ts` | AD-2, AD-9 — neither of which states the rule (see F-2) |
| NFR-1 (money is strings/BigInt) | Mapped | `lib/xrpl/money.ts` | AD-7, Conventions "Money in transit" |
| NFR-2 (no serializable secret) | AD only | `lib/crypto/` | AD-3, AD-5 (the `CryptoKey` exception, named) |
| NFR-3 (every read through a keyed hook) | AD only | `hooks/`, `lib/xrpl/query-keys.ts` | AD-4 `[GATED]`, AD-6, Conventions "Hooks"/"Query keys" |
| NFR-4 (SW caches the shell only, never an RPC response) | **Neither** | `vite.config.ts` PWA config | AD-11 governs the *registration path*, not the caching rule (see F-5) |
| NFR-5 (nothing styles `:focus`) | **Neither** | — | `docs/decisions.md` §6.3 |
| NFR-6 (colour never alone; contrast gate) | **Neither** | `scripts/check-contrast.mjs` | `docs/decisions.md` §6.2, §7.5 |
| NFR-7 (irreversible actions state consequence) | AD only | Conventions "Irreversible actions" | matches PRD; see F-6 for the missing counterweight |
| NFR-8 (keyboard + SR pass per component) | **Neither** | — | process, not structure — correctly absent |
| NFR-9 (320px, 200% zoom) | **Neither** | — | visual; deliberately out of the spine |
| NFR-10 (`prefers-reduced-motion`) | **Neither** | `components/ui/skeleton.tsx` records the policy | see §3 — correctly absent |
| NFR-11 (no array index as a React key) | **Neither** | — | see §3 — recommend a Conventions row, not an AD |

**Totals:** 58 FRs — 41 mapped, 5 AD-only, 11 with no architectural home
(FR-5, FR-26, FR-27, FR-28, FR-37, FR-45, plus FR-4 only loosely). 11 NFRs —
1 mapped, 4 AD-only, 6 unhomed, of which 4 (NFR-5, NFR-6, NFR-8, NFR-9) are
correctly outside a build substrate that carries no visual requirements.

---

## 2. Correctness of the three new map rows

### F-1 — The read-failure row cites the wrong FRs — **Medium-High**

The row reads: *Read-failure reporting (FR-22, FR-23) → `components/wallet/QueryErrorState.tsx` → AD-8, AD-14, AD-15.*

FR-22 (submitted vs. validated) and FR-23 (result codes reported plainly) are
**write outcomes**, not read failures. AD-8's own second sentence routes them the
other way: "Anything the user *did* … reports through `src/lib/notify.tsx`."
The code agrees:

- `components/wallet/TxStatusBadge.tsx` renders `Pending` / `Validated` /
  `Expired — not applied` / `Failed — fee charged (tec…)` / `Failed (…)`.
- `lib/xrpl/result-codes.ts` (`describeResultCode`) supplies the meaning.
- `pages/tabs/SendTab.tsx:~288` renders the outcome box, adding
  "The network fee was still charged for this attempt" on `claimed`.

`QueryErrorState.tsx` contains none of this, and FR-22/FR-23 are *already*
inside the FR-16..FR-25 writes row — so the new row both double-routes them and
sends them to the wrong module. A builder following the map would put result-code
copy into the read-error component.

Two further points: read-failure reporting corresponds to **no FR at all** — it
is derived from AD-8/AD-14/AD-15 and from the PRD's §9.1 honesty stance, not from
a numbered requirement. **Fix:** either cite the FRs whose *reads* the surface
guards (FR-29, FR-30, FR-35, FR-36, and FR-19's destination check), or drop the
FR citation and label the row by AD.

### F-2 — FR-58 is correct by absence, with no rule behind it — **Medium**

Verified: `lib/xrpl/writes.ts` builds `Payment` objects with no `Flags` field at
all (`submitXrpPayment:~226`, `submitIssuedPayment:~241`); the only `Flags` in
the module is `TrustSetFlags.tfSetNoRipple` on `TrustSet` (FR-31). The behaviour
is right. **The routing is not:** AD-2 governs connection ownership and AD-9
governs the in-flight flag and result classification. Neither says "never set
`tfPartialPayment`", so the row points at a module governed by rules that do not
carry the requirement. FR-58 is a correctness property held only by nobody having
typed a line — exactly the case the spine's own Conventions row "Pinning a
rendering rule" exists for, and there is no test that fails if `tfPartialPayment`
is added. **Fix:** a Conventions row ("Payment flags — a `Payment` this app
builds sets no `Flags`; `tfPartialPayment` is prohibited by FR-58") plus a test
in `lib/xrpl/__tests__/` asserting the built transaction has no `Flags`.

### F-3 — The FR-57 row is correctly located, and the code behind it has a sentinel gap — **Medium**

`lib/xrpl/reads.ts:182-195` prefers `meta.delivered_amount` over
`tx.DeliverMax ?? tx.Amount`, and sets `amountIsUpperBound` when the ledger
returns the literal `'unavailable'`. `HistoryTab.tsx:109-157` renders the `≤`
prefix and a caution alert; `useIncomingPaymentNotifications.ts:70` renders
"up to ". That satisfies FR-57's second bullet *for the `'unavailable'` case*.

The defect: `deliveredUnavailable` is keyed to the literal string only. When
`delivered_amount` is **absent** from the metadata, the code falls through to
`DeliverMax`/`Amount` and sets no upper-bound flag — a requested figure rendered
as a delivered one, which FR-57 permits only when labelled as an upper bound.
One-line fix: `amountIsUpperBound: isPayment && (!delivered || deliveredUnavailable) ? true : undefined`.

**F-3b — `fetchTx` bypasses FR-57 entirely — Low (latent).** `reads.ts:208`
exports `fetchTx` as a raw `client.request({command:'tx'})` passthrough with no
`delivered_amount` normalisation. It has **zero call sites** today (FR-37's
detail view expands the already-normalised `TxSummary`), so nothing is wrong on
screen — but it is an exported read inside the very module the FR-57 row names,
and the first caller that renders its `Amount` violates FR-57. Either delete it
or give it the same normalisation.

---

## 3. NFR-10 and NFR-11 — no AD, no map row

**Recommendation: neither deserves an AD. NFR-11 earns one Conventions row;
NFR-10 stays exactly where it is.**

An AD exists to stop two independently-built units from diverging — it names an
owner, a choke point, or a dependency edge. Neither NFR is that shape:

- **NFR-10** (`prefers-reduced-motion`) is a per-call-site CSS discipline. There
  is no module that could own it and no second unit to diverge from, because the
  app's policy is that animation exists essentially nowhere:
  `components/ui/skeleton.tsx` records that policy, and the gap register's
  2026-09-15 re-verification found the guard on every animated element. An AD
  here would be a rule with one call site. `docs/decisions.md` §3 plus review is
  the right home. **Correctly absent.**
- **NFR-11** (no array index as a React key) is also per-call-site, and I
  verified it independently: `grep -rn "key={i\b\|key={index\|key={idx" src/`
  returns nothing. It does **not** need an AD. But it is not purely cosmetic
  either, and this is what separates it from NFR-10: the PRD couples it to
  FR-14 — "per-row state sticks to the wrong item after a Wallet switch, which
  is FR-14's guarantee failing in a way FR-14 cannot see." That makes it a
  correctness consequence of AD-6 and AD-14, and the PRD's own verification-gaps
  section records that the multi-wallet UI has never been exercised with more
  than one Wallet present — so the failure it prevents is precisely the one
  nobody has looked for. **Recommend one Conventions table row**: *"List keys —
  row identity comes from the item, never the array index. An index key re-binds
  per-row state to the wrong item across an AD-6 wallet or network switch."*
  A row, not an AD: it changes no ownership and opens no dependency edge.

**Severity of the omission as it stands: Low** (NFR-11), **none** (NFR-10).

---

## 4. Quiet requirements the AD structure drops

### F-4 — §9.1's restraint clause has no counterweight in the spine — **Low**

The PRD's §9.1 is two-sided. The spine carries the first side and not the
second. Its Conventions row reads: *"Irreversible actions — a confirm step
naming the exact consequence, per `docs/decisions.md` §4. No exceptions for
'obvious' cases."* That is NFR-7's floor, correctly stated and matching the PRD.

What is dropped is §9.1's ceiling: **"Explanation earns its place only where the
ledger's behaviour is genuinely surprising or where money is at stake — nowhere
else… A surface that explains everywhere is not safer, only slower to read."**
This is a restraint *rule*, not prose, and it is the one the spine's own framing
makes easy to lose: an agent reading only the spine gets "explain more, never
less" and no signal to stop. **Fix:** one clause on that same Conventions row —
"…and only there: §9.1 forbids explanation where the ledger is not surprising
and no money is at stake." A pointer, not a restatement.

### Positive confirmations (no finding)

- **"Unavailable controls — `aria-disabled` with the reason in visible text.
  Never hidden."** Matches §9.1 and FR-25 exactly. Note that the spine here sides
  with the PRD *against* `DESIGN.md`, which documents only the true `disabled`
  state — the PRD's §10 and `addendum.md` §7 already record `DESIGN.md` as the
  stale document, so the spine is right and needs no change.
- **NFR-7 generally:** carried by the Conventions row plus AD-3 (seed reveal) and
  FR-13/FR-33's confirm steps. Not dropped.
- **§9.6 evidence discipline:** the spine's only factual claims about itself are
  the Stack table ("re-read from `package.json` on 2026-09-15") and the Deferred
  section's "four screen-level tests now pin the error paths of AD-13, AD-14 and
  AD-15, each written to fail if the rule is removed." I counted:
  `pages/tabs/__tests__/` contains `balances-error.test.tsx`,
  `history-error.test.tsx`, `send-destination-error.test.tsx`,
  `trustlines-error.test.tsx` — **four, exactly as claimed.** The spine does not
  overstate its own evidence. `GAP-REGISTER.md`'s "Not gaps" section likewise
  distinguishes verified from assumed and withdraws two entries found to be
  wrong. §9.6 is honoured.

### F-5 — NFR-4's caching rule has no home; only its registration half does — **Low**

AD-11 seals the *registration path* (`sw-register.ts` is the sole importer of
`virtual:pwa-register`), and `scripts/check-sw-register.mjs` gates exactly that.
NFR-4's substantive half — "the service worker caches the static shell only,
never an RPC response" — is stated in no AD, no Conventions row, and no map row,
and lives in `vite.config.ts`, a file the spine's Structural Seed does not cover.
It holds today (the register confirms there is no `runtimeCaching` at all,
stronger than required) and it is FR-52's and SM-C2's load-bearing property.
**Fix:** one clause on AD-11, or a Conventions row naming the PWA config as the
owner.

### F-6 — Six FRs have no architectural home — **Low**

FR-5, FR-26, FR-27, FR-28, FR-37 and FR-45 appear in no map row and under no AD.
Grouped because they share a cause — they are local, non-ledger, non-key
surfaces that no boundary happens to cross:

- FR-5, FR-26, FR-27 → `AddressDisplay.tsx`, `QrCode.tsx`, `ReceiveTab.tsx`.
- FR-45 (Address Book) → `store/app-store.ts` holds `addressBook`, but AD-6
  names app-store as the owner of `network` and `activeWalletId` only. This
  compounds the contract gap the PRD's §4.11 and §11 already record (no epic
  file, no acceptance criterion anywhere), so the spine is currently the *only*
  document that could say where it lives, and it does not.
- FR-28 → `useIncomingPaymentNotifications.ts`; AD-8 governs the surface, but the
  Notices map row cites FR-53..56 only.
- FR-37 → folds into the FR-57 row, which names FR-37 explicitly; extend that
  row's FR list rather than adding one.

**Fix:** extend the Notices row to `FR-28, FR-53..FR-56`; extend the FR-57 row to
name FR-37; add one row for local device state (`FR-5, FR-26, FR-27, FR-45 →
store/app-store.ts + components/wallet/` → AD-6, AD-10).

---

## 5. FR-19 versus AD-13, and what the code actually does

**They agree, and neither is weaker.** FR-19 states the rule for one case
(`lsfRequireDestTag`, "an indeterminate read blocks too — a failed read must
never coerce to the permissive answer"); AD-13 generalises it to every
read-backed guard on a money-moving action and adds the closing sentence
"Absence of a prohibition is not permission." AD-13 is a strict superset. No
divergence, no finding.

**Is FR-19 satisfied by the current code, or also violated?**
**FR-19 as worded is satisfied; AD-13 is violated.** The distinction is real and
worth stating precisely, because it changes what G-10 is evidence of.

`SendTab.tsx:68` computes `destCheckFailed = destQuery.isError && !destQuery.data`,
and `canSend` requires `!destCheckFailed && (!destInfo?.requireDestTag || destTag.length > 0)`.

- **FR-19's case** — "the destination's flags cannot be read." If the read has
  never succeeded, `data` is undefined, `destCheckFailed` is true, and the send
  is blocked with a `QueryErrorState` that says so. **FR-19 holds.**
- **G-10's case** — the flags *were* read successfully for the address currently
  on screen, and only a later refetch failed. FR-19's text does not reach this:
  the flags *were* readable. **AD-13 does reach it** — "neither an errored read
  nor data retained from an earlier input satisfies it" — and the code lets the
  retained answer satisfy the guard. **AD-13 is violated; FR-19 is not.**

So G-10 is correctly filed as a gap between the spine and the code, not as a PRD
violation, and the register's "why this is a gap and not a ratification"
reasoning stands: a blocked send is recoverable, a tagless send to an exchange
is not.

**One addition for the register, genuinely new.** `useDestinationInfo` sets
`staleTime: 30_000` and nothing marks merely-stale data as unusable. A read that
succeeded 31 seconds ago and has not been refetched satisfies the guard with
`isError === false` — so G-10's stated fix ("widen `destCheckFailed` to cover a
failed refetch and a read whose input no longer matches the address on screen")
does **not** cover that third path. AD-13's "a read that succeeded for the input
currently on screen" arguably admits it; if the intent is stricter, the fix needs
a freshness condition (`dataUpdatedAt`), and if it is not, AD-13 should say that
a successful read within its stale window counts. **Severity: informational —
it is a scoping gap in G-10's fix, not a new defect.**

**Related, and clean:** FR-2's `lsfDisableMasterKey` warning is the same class of
read-backed claim and it fails closed correctly. `pages/Onboarding.tsx:101-108`
probes the account before anything is written to the Vault, and a read failure
that is not `actNotFound` propagates out of `fetchAccountState` and aborts the
import in the outer `catch`. The import never completes on an unread flag. The
only nit is the message ("Setup failed") not naming the unreadable ledger — copy,
not architecture.

---

## Findings by severity

| # | Finding | Severity |
|---|---|---|
| F-1 | The new read-failure map row cites FR-22/FR-23, which are write outcomes owned by `TxStatusBadge.tsx` + `result-codes.ts` + `notify.tsx`; it also double-routes them | Medium-High |
| F-2 | FR-58's map row points at `writes.ts` under AD-2/AD-9, neither of which states the prohibition; no test pins it | Medium |
| F-3 | `amountIsUpperBound` fires only on the literal `'unavailable'`; an absent `delivered_amount` renders the requested figure unlabelled, against FR-57 | Medium |
| F-3b | `fetchTx` is an exported, uncalled read that bypasses FR-57 normalisation | Low (latent) |
| F-4 | §9.1's restraint clause ("nowhere else") has no counterweight to the spine's irreversible-action row | Low |
| F-5 | NFR-4's "never cache an RPC response" has no AD, row, or owner; only AD-11's registration half is covered | Low |
| F-6 | FR-5, FR-26, FR-27, FR-28, FR-37, FR-45 have no architectural home | Low |
| — | NFR-11 would benefit from a Conventions row (not an AD); NFR-10 correctly absent | Low |
| — | G-10's fix does not cover the `staleTime: 30_000` path | Informational |

**Confirmed correct, stated so they are not re-raised:** the spine's
irreversible-action and unavailable-control Conventions rows match the PRD
exactly (and correctly side with it against a stale `DESIGN.md`); the "four
screen-level tests" claim is accurate; FR-19 and AD-13 agree with AD-13 the
strict superset; FR-2's import warning fails closed; no array index is used as a
React key anywhere in `src/`.
