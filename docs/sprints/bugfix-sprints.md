# Bug-Fix Sprint Plan

Derived from the systematic XRPL feature review (2026-09-01) of the whole `src/` tree against `docs/user-stories/INDEX.md`, `docs/decisions.md` §3 guardrails / §4 enforced patterns, and the `xrpl-dev` skill's `security.md` + `client-sdk.md`.

Finding IDs (C*/H*/M*/L*) are canonical and carried through from that review.

> **STATUS: all seven sprints completed 2026-09-01.** Every finding below is
> fixed, except the items explicitly resolved as decisions rather than code —
> see `docs/decisions.md` §5. Verification at the bottom of this file.

## Sequencing rationale

Seven sprints, ordered by *blast radius first, then dependency*:

1. **S1** — the app is unusable or unrecoverable. Ship first, independently.
2. **S2** — key-custody correctness. Before S3 because C3 changes vault setup, which S3's reset flow touches.
3. **S3** — irreversible-action confirmations. Depends on S2 (`wipeVault` semantics).
4. **S4** — ledger read correctness. Independent of S1–S3; parallelizable.
5. **S5** — send-path safety. Depends on S4 (needs `freezePeer` + correct balances).
6. **S6** — harness/guardrail enforcement. Deliberately after S1–S5 so the new lint rule lands on already-clean code.
7. **S7** — unshipped product decisions + polish.

S4 can run concurrently with S1–S3 by a second person; everything else is sequential.

---

## Sprint 1 — Unusable / unrecoverable states

**Goal:** no crash, no dead end. **Findings:** C1, H0, H6, H7.

| ID | File | Fix |
|---|---|---|
| C1 | `SendTab.tsx:48` | Drop the `BigInt(...) >= 0n` clause entirely — it throws on decimal balances (`BigInt('10.5')` → `SyntaxError`) and is a no-op anyway (abs value is always ≥ 0). Filter on `l.balance !== '0'` alone; add a decimal-safe positivity helper in `money.ts` if a real check is wanted. |
| H0 | `Unlock.tsx:26-35,71-80` | `lockoutMsg` disables both buttons for the *temporary* backoff, but `refreshLockout()` runs only on mount and in the failure `catch`. Add an interval/timeout that re-checks while `remainingMs > 0` and clears the message on expiry. Separate `hardLocked` (permanent) from `locked` (transient) in the gating. |
| H6 | `Unlock.tsx` + `auth.ts` | Hard lock tells the user to re-import but offers no way to. Add a "Reset this device and re-import" action on the Unlock screen calling `wipeVault()`. Currently `wipeVault` is only reachable from Settings — behind the lock. |
| H7 | `auth.ts:149-152` | The blanket `catch` counts a user-cancelled WebAuthn sheet as a failed attempt (8 dismissals → bricked, via H6). Distinguish `NotAllowedError`/`AbortError` and config errors from a genuine unwrap failure; only call `recordFailure()` for the latter. |

**Done when:** a fractional token balance renders in the Send picker; 3 wrong PINs recover without a reload; 8 cancelled passkey prompts do not lock the wallet; a hard-locked wallet is recoverable in-app.

**Risk:** H7 must not weaken the real check — only an *unwrap* failure is a failed attempt. Re-read `decisions.md` §4 before touching `auth.ts`.

---

## Sprint 2 — Key custody & auth correctness

**Goal:** close guardrail #3 violations and the wrong-key unlock. **Findings:** C3, C2, H4.

| ID | File | Fix |
|---|---|---|
| C3 | `auth.ts:60-61` | `setUpVaultAuth` spreads the old `VaultMeta`, preserving `wrappedMasterKeyForPasskey` from a *previous* master key while generating a new one at `:54`. Build the new meta from scratch (explicitly clearing both wrappers) instead of spreading. Reachable via remove-all-wallets → Onboarding; a passkey then unwraps successfully but decrypts nothing. |
| H4 | `auth.ts:23,78` | Master key is generated `extractable: true` (needed to wrap) and that same key is persisted to the session store, contradicting the invariant documented at `db.ts:29-32`. Re-import via `importMasterKey` (already non-extractable at `:32`) before `putUnlockedSession` and before returning to the store. |
| C2 | `SettingsTab.tsx:38,70`; `Onboarding.tsx:35,71` | Decrypted seed held in React state; guardrail #3 names React state explicitly. Pass the seed to `<SeedReveal>` through a ref or a render-prop that never persists it in state, and clear on unmount. |

**Also:** `handleRemove` (`SettingsTab.tsx:77-86`) deletes wallet rows but never the vault — the precondition that makes C3 reachable. Decide here whether removing the *last* wallet should wipe the vault; if yes it partly subsumes C3, but fix C3 regardless.

**Done when:** re-onboarding after removing all wallets leaves no stale passkey wrapper; the session-store key is non-extractable; no plaintext seed is reachable from React state or devtools.

---

## Sprint 3 — Confirmations on irreversible actions

**Goal:** satisfy §4 "every destructive/irreversible action requires an explicit confirm step stating the exact consequence." **Finding:** C4.

| Action | File | Fix |
|---|---|---|
| Remove all wallets | `SettingsTab.tsx:228` | Wipes the vault and reloads with no dialog. Add a confirm naming the consequence (all seeds gone from this device, unrecoverable without a backup). |
| Reveal seed | `SettingsTab.tsx:174` | Decrypts and displays immediately. Gate behind a confirm. |
| Close trust line | `TrustLinesTab.tsx:114` | Submits `TrustSet` limit `0` immediately. Confirm, stating the owner reserve is released and the line closed. |
| Send payment | `SendTab.tsx:124-130` | No confirmation whenever `isKnownDestination`. Widened by `:101`, which auto-adds the destination after a successful send — so the **second** payment to any address, and every one after, is unconfirmed. Make the confirm step unconditional (amount + asset + destination + fee), keeping the first-time warning as an *additional* escalation. |

**Done when:** all four paths require an explicit second action stating the consequence in plain language.

**Risk:** don't regress the resolved bug documented at `SendTab.tsx:116-123` — the first-time warning must stay a send-time gate, not an on-blur field warning.

---

## Sprint 4 — Ledger read correctness

**Goal:** what the UI shows matches the ledger. **Findings:** H1, H2, H3, H8, H5, C5, plus M-tier read issues. *Parallelizable with S1–S3.*

| ID | File | Fix |
|---|---|---|
| H1 | `reads.ts:50-58,71` | `freeze` is "**this account** has frozen this line"; `freeze_peer` is the peer/issuer (confirmed in `node_modules/xrpl/src/models/methods/accountLines.ts:57-63`). Add `freezePeer` to the `TrustLine` interface, map `l.freeze_peer`, and point `TrustLineRow.tsx:14`'s "Frozen by issuer" badge at it. Blocks H2. |
| H2 | `SendTab.tsx:48`; `BalancesTab.tsx:110-115` | decisions.md §2 requires disabling sends of a frozen asset. Filter frozen lines out of `heldTokens`; add the frozen badge to the Balances token rows too ("trust lines/balances"). |
| H3 | `reads.ts:61-78` | `account_lines` never follows `marker`; accounts past ~200 lines under-report in Balances, Tokens, and the Send picker. Loop until the marker is exhausted. |
| H8 | `reads.ts:146` | History skips every non-`Payment`, so `TrustSet` — which this app submits itself — is invisible, and `limit: 25` + marker paging returns sparse pages. Render other types with a sensible summary rather than dropping them. |
| H5 | `useIncomingPaymentNotifications.ts:13-14` | `seenHashes`/`isFirstLoad` never reset on address/network change, so switching replays the new account's whole history as "Received" toasts. Reset both when the key changes. |
| C5 | `SendTab.tsx:57,60` | `fetchAccountState`/`fetchAccountLines` called directly in an `onBlur`; §4 bans reads in event handlers too. Move to a TanStack Query hook keyed on the destination, enabled once it's non-empty. |
| M1 | `reads.ts:149` | `delivered_amount === 'unavailable'` falls back to `DeliverMax`, overstating old partial payments. Skill `security.md`: treat as partial — render as an upper bound. |
| M4 | `writes.ts:19` | `tec*` is classed identically to `tef`/`tem`, so users are never told the tx **is in a validated ledger and the fee was consumed**. Give `tec` its own outcome status and message. |

**Done when:** an issuer-frozen line badges correctly and can't be sent; a >200-line account lists fully; `TrustSet` appears in history; switching wallets fires no toasts.

---

## Sprint 5 — Send-path safety

**Goal:** fail in the form, not at the ledger. **Findings:** M5, M6, M2, M7, M3. *Depends on S4.*

| ID | File | Fix |
|---|---|---|
| M5 | `SendTab.tsx:140` | `canSend` checks format only. Compare against `spendableDrops` **with the fee reserved on top** (XRP) and against the held balance (issued), so a max-send doesn't fail at `tecUNFUNDED_PAYMENT`. |
| M6 | `SendTab.tsx`, `TrustLinesTab.tsx` | No validation before building a tx. Use `isValidClassicAddress` for destination + issuer; validate currency codes (3-char or 40-hex); range-check `destTag` (`SendTab.tsx:80`) to uint32. |
| M2 | `writes.ts:12` | No `maxFeeXRP` on `autofill()` — relies on the xrpl.js 2 XRP default. Cap it per the skill's fee-protection guidance. |
| M7 | `writes.ts:72-76` | `TrustSet` omits `tfSetNoRipple`. Holders should not ripple; skill `security.md` says NoRipple "prevents unexpected balance shifts." |
| M3 | `writes.ts:30` | Expiry is detected by `err.message.includes('LastLedgerSequence')` — a wording change in xrpl.js silently reclassifies it. Match on the error type/code, or verify by comparing the validated ledger index against the tx's `LastLedgerSequence`. |

**Done when:** an over-balance send is blocked in the form with a clear reason; a malformed address never reaches `autofill`.

---

## Sprint 6 — Guardrail enforcement & teardown

**Goal:** make the harness enforce §3/§4 rather than relying on review. **Findings:** M10, M9, M11, L12.

| ID | File | Fix |
|---|---|---|
| M10 | `.oxlintrc.json` | Only `react/rules-of-hooks` is enabled — **`react-hooks/exhaustive-deps` is not configured**, so guardrail #2 is unenforceable. Enable it and fix fallout (e.g. the empty-dep effect at `Unlock.tsx:21-24`). Land after S1–S5 so it applies to clean code. |
| M9 | `SettingsTab.tsx:77-95` | Guardrail #7 teardown is incomplete: `handleRemove` clears neither the Query cache nor SW caches; `handleFullReset` clears the Query cache but never SW caches (no `caches.delete()` anywhere in `src/`). `lock()` also leaves balances/history warm. Add a shared teardown covering IndexedDB + Query cache + `caches.delete()`. |
| M11 | `app-store.ts:56-67` | zustand `persist` has no `storage`, so it defaults to **localStorage**, while decisions.md §1 specifies IndexedDB for app state. Payload is non-secret, so this is a stack deviation, not a #3 breach — switch to an IndexedDB adapter, or amend the decision and say why. |
| L12 | new | No test setup at all. Add vitest + unit tests for `money.ts` (BigInt edges, C1's decimal case), tx building in `writes.ts`, and the wrap/unwrap unlock paths; then a testnet integration pass per skill §4. |

**Done when:** `bun run lint` enforces exhaustive-deps clean; logout/removal leaves no warm cache; the C1 regression is covered by a test.

---

## Sprint 7 — Unshipped decisions & polish

**Goal:** close the §2 product decisions that were never built, plus the Low tier. **Findings:** M13, M14, M8, M12, L1–L14.

| ID | Fix |
|---|---|
| M13 | Web Push for incoming payments (decisions.md §2) is unimplemented — only an in-app `toast` (`useIncomingPaymentNotifications.ts:41`). `ReceiveTab.tsx:33-34` currently tells users to "keep this app open," the very behaviour the decision removes. |
| M14 | No RPC failover. §2 promises "one hardcoded public endpoint per network **plus one hardcoded backup**"; `networks.ts` has a single `wsUrl`/`rpcUrl` and `client.ts:14` has no fallback. |
| M8 | `SettingsTab.tsx:53` — the Settings import path skips the disabled-master-key probe that `Onboarding.tsx:76-84` performs. §2 states the check unconditionally for import. |
| M12 | `useAutoLock.ts:13` `BACKGROUND_GRACE_MS = 30_000` contradicts §2 "Immediate lock on app backgrounding on mobile." The code comment justifies it as a resolved UX bug but the decision doc was never updated. **Doc-vs-code decision, not a code fix** — reconcile one way and record it. |
| L1 | `BalancesTab.tsx:91-98` hand-rolls `<a href={accountExplorerUrl(...)}>` — the one place bypassing `<AddressLink>` (§4). |
| L2–L14 | Duplicate `account_tx` polling · faucet amount typed as `number` (`faucet.ts:5,25`) · missing date → 2000-01-01 (`reads.ts:160`) · history filter only spans loaded pages · unbounded `seenHashes` · cleanup reconnects just to unsubscribe (`useAccountLiveUpdates.ts:58`) · live updates miss rippling txs (`:40`) · "Lock now" is a `<Switch>` that never toggles (`SettingsTab.tsx:225`, guardrail #9) · PBKDF2 300k vs OWASP 600k (`pin.ts:3`) · unused `react-router-dom` · buffer spread in `encoding.ts:2` · import stored before the master-key warning (`Onboarding.tsx:78`). |

---

## Out of scope

Not defects — do not fold into these sprints:

- **Reserve values.** The `xrpl-dev` skill's `SKILL.md` says 10 XRP / 2 XRP; those are stale pre-2024 figures contradicted by the skill's own `client-sdk.md` (1 / 0.2). `INDEX.md` is correct and the code reads `server_state` live. No change.
- **Deferred XRPL features** (Checks, Escrow, Payment Channels, multi-sign/regular-key rotation) — explicitly out of the initial core set per `INDEX.md`.
- **Fiat-equivalent display** — explicitly deferred in §2.

## Coverage

All 10 epics are implemented; every finding is a gap *inside* an epic, not a missing one. Findings map to sprints with none dropped: C1→S1, C2/C3→S2, C4→S3, C5→S4, H0/H6/H7→S1, H1/H2/H3/H5/H8→S4, H4→S2, M1/M4→S4, M2/M3/M5/M6/M7→S5, M9/M10/M11→S6, M8/M12/M13/M14→S7, L1–L14→S7, L12→S6.


---

## Completion record (2026-09-01)

All seven sprints executed. Verification after the final change:

- `tsc -b` — clean
- `oxlint` (now including `react-hooks/exhaustive-deps`) — clean, apart from
  pre-existing `react/only-export-components` warnings on shadcn primitives
- `vitest run` — 27 tests passing across 4 files
- `bun run build` — succeeds; built `dist/sw.js` still registers no RPC
  runtime caching (guardrail #6 holds)

### Resolved as decisions rather than code

- **M12** background auto-lock → decisions.md §5.1 (immediate on mobile via
  `pointer: coarse`, 30s grace on desktop — honours both the original "on
  mobile" qualifier and the resolved alt-tab UX bug)
- **M13** Web Push → decisions.md §5.2 (deferred; needs a push server, which
  §1's no-backend architecture rules out)
- **Skill reserve figures** → decisions.md §5.7 (repo docs authoritative)

### Notable deviations from the plan as written

- **H1/H2/H3/H4 were pulled forward into S1.** C1's fix needed `freezePeer` to
  exist, so the `account_lines` mapping (H1), frozen-send blocking (H2) and
  pagination (H3) landed with it rather than waiting for S4. H4 landed in the
  same pass through `auth.ts` as C3.
- **C2 grew.** The plan covered the two `revealedSeed`/`pendingSeed` state
  slots; the controlled seed *input* fields held the secret in state too, so
  both were converted to uncontrolled refs. `SeedReveal` now takes a getter
  and writes to the DOM from an effect, which keeps the secret out of both
  React state and render-time ref reads.
- **New files:** `lib/teardown.ts` (shared guardrail #7 teardown),
  `hooks/useDestinationInfo.ts` (C5), `hooks/useClearCacheOnLock.ts`,
  `lib/xrpl/query-reads.ts` (§5.4), `vitest.config.ts`, four test files.
- **L12 partially open.** Unit tests cover `money.ts`, the vault wrap/unwrap
  paths (including the C3 regression), the amount validator and result codes.
  The skill's suggested **live testnet integration pass is not automated** —
  still worth doing manually before any release.
