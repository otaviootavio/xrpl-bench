---
title: 'Turn the Account Master Key off and on from Settings'
type: 'feature'
created: '2026-10-12'
status: 'done'
baseline_revision: '3524982923186bab4a8ca03219a6f3a20eedc25b'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/docs/agents/ui-and-design-system.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-passkey-signing-2026-10-10/ARCHITECTURE-SPINE.md'
warnings: []
deferred:
  - summary: >-
      Turn-off needs only a Regular Key set on the ledger; it may be one no wallet on this device can sign with, which locks the funds out.
    evidence: |-
      The spec asks only for a read Regular Key; the confirm states that losing the Regular Key loses the funds. A local-wallet match check or extra confirm line would need a spec decision.
    location: >-
      src/lib/master-key.ts masterKeyAction
    severity: medium
  - summary: >-
      No browser or real-ledger pass: the AccountSet disable and re-enable have only met fakes.
    evidence: |-
      The spec's Testnet manual check was not done.
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** An Account's Master Key can only stay on (CAP-12, FR-77). Once a Regular Key is validated, the owner has no way to turn the master key off, so a leaked or lost master Seed stays a live way to move funds, and no way to turn it back on.

**Approach:** From Settings, a Wallet row shows the Account's master-key state read from the ledger and one action: turn it off (from a Wallet that holds the master key) or on (from a Wallet that signs as the Regular Key), through an `AccountSet` signed by that Wallet's Signing Check after a confirm that states the exact consequence (AD-29).

## Boundaries & Constraints

**Always:**
- State is read, never stored (AD-29): `masterKeyStatus(accountState)` is `on`, `off` or `unknown` (read errored, still loading, or the Account does not exist). An errored read renders "unknown" and blocks the action, `aria-disabled` with the reason as visible text; never shown as on or off. The action's guard uses `fetchAccountStateFresh`, not the cache.
- Which key signs which (AD-29): **turn off** is offered only through a Wallet that holds the Account's master key (`holdsMasterKey`: key address equals its Account), only when the fresh read shows `regularKey` set and `disableMasterKey` false. **Turn on** (`ClearFlag`) is offered only through a Wallet that operates another Account (`operatesAnotherAccount`) whose key is the read's Regular Key (`controlStatus` is `controlled`), only when `disableMasterKey` is true. Any other Wallet gets the action `aria-disabled` with its reason in words (no Regular Key yet; master key already off, turn it on from the Regular Key's wallet; not this Account's Regular Key; read failed). The role is decided by the Wallet's view, never inferred by the caller.
- Flow: one function in `src/lib` (`setMasterKey(walletId, enable, ctx)`; no secret in state), taking `confirmed: true` from the UI's confirm step and refusing without it. Fresh read, guard re-judged, then sign through `signingHandleFor` and submit via `submitAndClassify` (add a thin `submitMasterKeyFlag` in `src/lib/xrpl/writes.ts`: `AccountSet`, `Account` = the handle's Account, `SetFlag` or `ClearFlag` `asfDisableMaster`). Only `validated` is success; `claimed`, `failed`, `expired`, a cancelled or wrong check each report plainly. After any submission, invalidate the Account's query data and re-read; the reported state is what the re-read shows; a failed re-read reports "submitted, could not confirm" and the status renders unknown. Nothing is remembered.
- Confirm copy (plain words, exact consequence): turning off says the master key, and any Controlling Wallet that holds it, can no longer sign for this Account, that only the Regular Key can, and that losing the Regular Key loses the funds (for a passkey, losing it); it names the current Regular Key. Turning on says the master key can sign again and is signed by the Regular Key. Mainnet stays unmistakable ("real funds"). Never say "open source".
- Reuse `describeFailure` from `lib/control.ts` (export it); no second copy of outcome wording. A Wallet's own checks, floors and Seed Method rules are unchanged. No Seed, key or typed PIN in state, store, storage or URL; every ledger read through the one query-key factory; nothing styles `:focus`, `outline-none` banned; colour never alone.

**Never:**
- Removing or changing a Regular Key, QR signing (story 11), a local "master key off" flag, a second copy of the rule in a component, editing `submitAndClassify`, offering turn-off from a Wallet that signs as a Regular Key, or turning it off without a read showing a Regular Key.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Turn off | Master-holding Wallet, Regular Key set, master on | Consequence confirm, Signing Check, `AccountSet` validated, re-read shows off | Cancel at the confirm sends nothing |
| Turn on | Regular-Key Wallet, master off | Confirm, Signing Check, `ClearFlag` validated, re-read shows on | As above |
| No Regular Key | Read shows none | Turn off `aria-disabled`, reason in words | Nothing signed |
| Read errored | `account_info` fails or Account unfunded | Status "unknown", action `aria-disabled` | Nothing signed |
| Wrong role | Regular-Key Wallet, master on; or master Wallet, master off | `aria-disabled` with the reason | Nothing signed |
| Not validated | tec/tef/expired, cancelled or wrong check | Plain outcome, state re-read | Wrong PIN counts, cancel does not |
| Re-read fails after validation | Validated, then read errors | "Submitted, could not confirm", status unknown | None remembered |
| No confirm | `confirmed` not true | Refused, nothing signed | n/a |

</intent-contract>

## Code Map

- `src/lib/control.ts` -- `controlStatus`, `holdsMasterKey`, `operatesAnotherAccount`, `describeFailure` (export it), `setRegularKey` flow is the template (fresh read, `signingHandleFor`, `SigningCheckError` mapping).
- `src/lib/xrpl/writes.ts` -- `submitSetRegularKey` (L297) is the template; add `submitMasterKeyFlag`; `AccountSet` / `AccountSetAsfFlags` from `xrpl`.
- `src/lib/xrpl/reads.ts` (`AccountState.disableMasterKey`, `regularKey`), `query-reads.ts` (`fetchAccountStateFresh`), `query-keys.ts` (`invalidateAccountScoped`), `src/hooks/useAccountState.ts` -- reuse.
- `src/components/wallet/ControlWalletDialog.tsx` and `ControlledNote.tsx` -- dialog and status-text patterns (`StatusLegend`, `usePrompts`, `useWalletOpenKey`, dismissal locked while busy).
- `src/pages/tabs/SettingsTab.tsx` -- row at L388-440 (`ControlledNote` L408 inside the open-lock block); mount the new control there.
- Tests to copy: `src/lib/crypto/__tests__/control.test.ts` (flow), `src/components/wallet/__tests__/control-wallet-dialog.test.tsx` (component), `src/lib/xrpl/__tests__/writes.test.ts` (L857, `installFakeClient`).
- Docs: `docs/decisions.md` §15.1 (add §15.2), `docs/agents/keys-and-secrets.md` (L79-85).

## Tasks & Acceptance

**Execution:**
- `src/lib/xrpl/writes.ts` -- `submitMasterKeyFlag` -- AD-29, choke point unchanged.
- `src/lib/control.ts` -- export `describeFailure` -- one wording.
- `src/lib/master-key.ts` (new) -- `masterKeyStatus`, `masterKeyAction` (offer + reason), `setMasterKey` -- AD-29, FR-77.
- `src/components/wallet/MasterKeyControl.tsx` (new) -- status text, action, confirm dialog; render only -- FR-77.
- `src/pages/tabs/SettingsTab.tsx` -- mount for a Wallet whose lock is open.
- Tests and docs -- every matrix row; decode the signed blob (`AccountSet`, flag, `Account`); no stored flag; UI aria-disabled + reasons; docs §15.2 and keys-and-secrets bullet.

**Acceptance Criteria:**
- Given a Regular Key validated on the Account and the master key on, when the master-holding Wallet confirms and passes its Signing Check, then an `AccountSet` sets `asfDisableMaster` and the shown state is the one the fresh read reports.
- Given the master key off, when the Regular Key's Wallet confirms and passes its Signing Check, then `ClearFlag` is signed and the state re-read.
- Given an errored read, no Regular Key, or the wrong role, when the action is requested, then it is `aria-disabled` with the reason as text and nothing is signed; state shows unknown on an errored read.
- Given the confirm step, then it states the exact consequence before anything is signed.
- Given the four gates, `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass
- verdicts: 30 findings — high 0, medium 3, low 8, false 0, maybe-false 0 (rows repeat across layers; grouped by claim, remaining rows rejected as low)
- findings:
  - `[medium]` `patch` unconfirmed result left the control unknown and blocked until remount (blind, edge, gap) — readFailed forced while unconfirmed, "Check again" refetch button, test added
  - `[medium]` `patch` non-signing-check throw after submit returned `refused` without a re-read (blind, edge) — re-read; unconfirmed when failed or changed; tests added
  - `[medium]` `patch` no test that SettingsTab mounts the control only for an open lock (gap, intent) — case added to settings-locks test
  - `[low]` `patch` passkey wording derived from the acting wallet, not the Regular Key's (blind, edge) — copy is now unconditional
  - `[low]` `patch` "Done." on a validated change whose re-read differs (blind) — "Validated. The ledger now shows…"
  - `[low]` `patch` unreadable role check (blind) — `holdsMasterKey(wallet) === enable`
  - `[medium]` `defer` turn-off ignores whether the Regular Key is usable on this device (blind, edge, intent) — spec decision needed
  - `[low]` `reject` double click before busy re-renders (edge, blind) — the Signing Check prompt serialises; narrow
  - `[low]` `reject` dialog snapshot of Regular Key, result stale on wallet change (edge) — row is keyed per wallet; ledger refuses a bad change
  - `[low]` `reject` live-region mounting, Cancel `disabled`, double read, harness duplication, stray blank line, unasserted reason wording, flow-test structure (blind, gap) — cosmetic or test hygiene with no named harm
  - `[low]` `reject` Testnet check unverified (intent, gap) — recorded under deferred

## Design Notes

The role is the view, not a parameter: a view whose key equals its Account signs with the master key, any other signs as the Regular Key (story 9), so the guard derives the role from `WalletMeta` and refuses a mismatch with the ledger read.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all tests pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- On Testnet, with a browser, disable then re-enable the master key of a controlled Account. Note if not done; unverified against a real ledger.

Status: done

**Summary:** The Settings Wallet row shows the Account's master-key state read from the ledger and one action by role: turn off from the master-holding Wallet (Regular Key set, master on), turn on from the Wallet that signs as the Regular Key. A confirm states the exact consequence, the Signing Check runs through `signingHandleFor`, and `AccountSet` (`asfDisableMaster`) goes through `submitAndClassify`. The reported state is a fresh re-read; a failed re-read reads unknown with "Check again".

**Files:** `src/lib/master-key.ts` (rules, flow), `src/lib/xrpl/writes.ts` (`submitMasterKeyFlag`), `src/lib/control.ts` (export `describeFailure`), `src/components/wallet/MasterKeyControl.tsx`, `SettingsTab.tsx` (mount), docs §15.2 and keys-and-secrets, tests.

**Review:** patches applied 6 (medium 3, low 3); deferred 2; the rest rejected with reasons above.

**Follow-up review recommended:** true — three medium patches (unconfirmed recovery, post-throw re-read, mount test), and the flow has never run in a browser or against a real ledger.

**Verification:** `bun run lint`, `bun run build`, `bun run test` (83 files, 1184 tests), `bun run check:contrast` pass. No browser or ledger run.

**Residual risks:** see deferred: a Regular Key unusable on this device can lock funds out after turn-off.

**Browser pass (2026-10-14, `775ade7`):** run; result and defects in `../browser-pass-2026-10-14.md`.
