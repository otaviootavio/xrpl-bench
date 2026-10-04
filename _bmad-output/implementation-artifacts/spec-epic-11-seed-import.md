---
title: 'Importing a Seed is the same operation wherever you do it — warn before the write, accept pasted whitespace'
type: 'fix'
created: '2026-10-04'
status: 'done'
route: 'unattended'
review_loop_iteration: 1
baseline_commit: 'b23eb74'
context:
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/keys-and-secrets.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-sealed-boundaries.md'
---

## Intent

**Problem (G-24, stories 11.1 and 11.2).** The two Seed-import screens did not
do the same thing.

- **Onboarding import was broken on `dev`.** It was not part of the
  backlog's description, and it is the most important finding here. The Seed
  input lives only in the `import-seed` step's tree. When "Continue" moves the
  flow to `vault-setup`, React unmounts the input and sets `importSeedRef.current`
  to `null`. `handleVaultSetup` then read `importSeedRef.current?.value ?? ''`,
  so it got `''`. The address derivation threw xrpl.js's own error, which was
  shown raw. Onboarding import never reached the probe or the write. This was
  confirmed in two ways. A jsdom render of the unmodified screen called the
  derivation with `''`. In a real browser, with the baseline `Onboarding.tsx`
  restored temporarily, importing a valid funded Testnet Seed left 0 wallets
  stored and showed the raw notice "invalid_input_size: decoded data must have
  length >= 5" on the PIN screen (screenshot 20). A test pins the fix and fails
  if it is reverted.
- **Settings wrote to the vault first and warned afterwards.** Its
  disabled-master-key check ran before `importAndStoreWallet`, but the warning
  was only shown after the write, behind a "Got it" button.
- **Neither screen trimmed its input.** A Seed pasted with a trailing newline
  read as malformed.
- **A malformed Seed was reported differently on each screen.** Onboarding
  said "That seed looks invalid…". Settings showed whatever `Wallet.fromSeed`
  threw.
- **A failed probe was shown as a raw transport error on both screens**, and
  the import stopped there.

**Approach.** There is one shared procedure, and both screens follow it:
parse, check, then write.

1. **Parse:** `parseSeedInput` in the keystore is the single trim, and it uses
   the existing `isValidSeed`, so there is still one validator.
2. **Check:** `checkBeforeImport` in `lib/seed-import.ts` receives an address,
   never the Seed. It answers `null` (write now), `'master-key-disabled'` or
   `'unchecked'`.
3. **Write:** this happens immediately when the check answers `null`.
   Otherwise it happens only after the operator chooses "Import anyway".

Both screens use the same words: `INVALID_SEED_MESSAGE` and
`IMPORT_WARNING_COPY`. Between steps, the parsed Seed lives in a ref, never in
state. On Onboarding, it is copied out of the input before the input unmounts.

## Boundaries & Constraints

**Always:**
- No Seed enters React state, a store, storage, the URL, or a log (guardrail
  #3).
- Both inputs stay uncontrolled.
- The pending Seed ref is cleared on completion, on cancel, and on any dismissal
  of the warning.
- No vault write happens before the check has answered, and none happens while
  a warning is unanswered.
- A failed or timed-out read is never the permissive answer (AD-13).

**Never:**
- No change to what an account with an enabled master key, or an account that
  does not exist yet, goes through. Both write with no extra step.
- No controlled Seed input.
- No new dependency.
- No change to the onboarding order of vault setup and probe. The probe still
  runs after the PIN is set, as before. See Decisions.

## I/O & Edge-Case Matrix

| Input (either screen) | Ledger | Result |
|---|---|---|
| valid Seed | account exists, master key enabled | written immediately, no extra step |
| valid Seed | account not found (`actNotFound`) | written immediately — nothing can have disabled its key |
| valid Seed | `lsfDisableMaster` set | "Master key disabled" warning; **no write**; "Import anyway" writes once; "Cancel import" (Settings also: Escape, overlay click, ✕) writes nothing and clears the Seed |
| valid Seed | read fails (socket closed, connect refused) | "Master key not checked" warning, same choices — not the raw error, not a silent write |
| valid Seed | browser reports offline (`navigator.onLine` false) | same as a failed read. `fetchAccountStateOnce` uses `networkMode: 'always'`, so the fetch is not paused forever |
| valid Seed | read hangs | `'unchecked'` after `IMPORT_CHECK_TIMEOUT_MS` (15 s) |
| `"  <seed>\n"`, `"<seed>\r\n"`, tabs | any | trimmed, then as the rows above. The trimmed value is what gets stored |
| whitespace inside the value | — | `INVALID_SEED_MESSAGE`. Not repaired |
| whitespace only, or empty | — | `INVALID_SEED_MESSAGE` (not ignored) |
| malformed / a classic address | — | `INVALID_SEED_MESSAGE`; no probe, no write |
| Settings: Add dialog closed while the check runs | — | not possible. The dialog refuses to close while `busy`, so a write cannot land behind a closed dialog |
| double-click Add / Import anyway | — | `busy` guard; one write |

## Code Map

- `src/lib/crypto/keystore.ts`: adds `parseSeedInput`, the single trim, built
  on `isValidSeed`.
- `src/lib/seed-import.ts` (new): adds `INVALID_SEED_MESSAGE`,
  `ImportWarning`, `IMPORT_WARNING_COPY`, `checkBeforeImport` and
  `IMPORT_CHECK_TIMEOUT_MS`. It receives an address only.
- `src/lib/xrpl/query-reads.ts`: `fetchAccountStateOnce` gets
  `networkMode: 'always'`. Its only callers are the two import screens.
- `src/pages/Onboarding.tsx`:
  - parses at "Continue" into `pendingImportSeedRef`;
  - probes through `checkBeforeImport`, which adds the `unchecked` warning;
  - takes its copy from `IMPORT_WARNING_COPY`.
- `src/pages/tabs/SettingsTab.tsx`:
  - parse, then check, then write, or warn and hold the Seed in
    `pendingImportSeedRef`;
  - the warning dialog now has "Cancel import" and "Import anyway" (it used to
    have "Got it"), and any dismissal cancels;
  - `busy` state.
- Tests:
  - `src/lib/crypto/__tests__/keystore.test.ts` (`parseSeedInput`);
  - `src/lib/__tests__/seed-import.test.ts` (the check, offline, timeout);
  - `src/pages/__tests__/seed-import-screens.test.tsx` (both screens through
    one `describe.each`, plus Settings dismissal and the Onboarding unmount
    regression).

## Tasks & Acceptance

- [x] **11.1 / order.** *Given* an account with its master key disabled,
  *when* a Seed is imported from Onboarding or from Settings, *then* the
  warning is shown and `importAndStoreWallet` has not been called. *And* it is
  called exactly once, only after "Import anyway".
- [x] **11.1 / comment.** *Given* the old comment at `SettingsTab.tsx:70-71`,
  *when* the import handler is read, *then* the comment states that the check
  comes before the write, not merely that it exists.
- [x] **11.1 / ordinary path.** *Given* an enabled master key or an account
  that does not exist yet, *when* either screen imports, *then* the Seed is
  written with no extra step.
- [x] **11.1 / failed probe.** *Given* the account cannot be read (error,
  offline, or hang), *when* either screen imports, *then* both show the same
  "Master key not checked" warning and write nothing until "Import anyway".
- [x] **11.2 / whitespace.** *Given* a Seed with leading or trailing
  whitespace, *when* it is imported from either screen, *then* it is accepted
  and stored trimmed. *And* the trim lives only in `parseSeedInput`.
- [x] **11.2 / same words.** *Given* a malformed Seed, *when* it is entered on
  either screen, *then* both show `INVALID_SEED_MESSAGE` and no raw xrpl.js
  message.
- [x] **11.2 / refs.** *Given* guardrail #3, *then* parsing reads the
  uncontrolled input's value, and the parsed Seed is held only in a ref. *And*
  the input is cleared after a completed import.
- [x] **11.2 / whitespace only.** *Given* a whitespace-only value, *then* it is
  reported as malformed.
- [x] **Onboarding regression.** *Given* the Onboarding flow, *when* the import
  step unmounts, *then* the Seed that was typed (not `''`) reaches the probe and
  the write.

## Decisions (made unattended, for Otavio to check)

1. **"Not checked" warns and lets the operator continue; it does not refuse.**
   - AD-13 is met either way, because an unread account is never treated as
     "master key fine".
   - Refusing outright would make an import impossible without a ledger
     connection. It would also be stricter than the known-bad case: a
     *confirmed* disabled master key can already be imported with one click.
   - Importing a Seed moves no money.
   - If you would rather refuse, the change is one branch in each screen.
2. **New copy.** The warning titles are "Master key disabled" and "Master key
   not checked".
   - Both bodies now end "The seed has not been saved yet."
   - The Settings dialog gains the description "Check this before the seed is
     saved to this device." Its buttons are now "Cancel import" and "Import
     anyway", as on Onboarding. They replace "Got it", which had nothing left
     to acknowledge once the write moved after the warning.
   - Onboarding's alert title changes from "Heads up" to the specific title.
3. **Whitespace inside a Seed is rejected, not stripped.** Only leading and
   trailing whitespace is removed, including `\r\n`, tabs and anything else
   `String.prototype.trim` covers.
4. **A 15-second bound on the pre-flight check.** Without it, the browser pass
   saw Settings sit at "Checking…" for about 41 s when the connection dropped
   under an already-open client. A slow read that would have succeeded now
   costs a warning, never a silent write.
5. **The Settings Add dialog cannot be closed while a check or write is
   running.** Closing it reads as "stop", and the old handler would still have
   written behind it. The check is bounded (decision 4), so the lock lasts at
   most about 15 s.
6. **Onboarding still sets up the vault (PIN) before probing.** Moving the
   probe ahead of the PIN step would be a larger flow change than this epic
   asks for. As before, "Cancel import" on Onboarding returns to the first
   screen after the vault has been set up.

## Spec Change Log

- Added the 15-second bound (decision 4) after the first browser pass measured
  a 41 s "Checking…" with the browser set offline under an open socket.

## Review triage (adversarial self-review of the diff)

| # | Finding | Disposition |
|---|---|---|
| 1 | Onboarding read the Seed from an input that had already unmounted, so import never worked | **fixed**: `pendingImportSeedRef`; regression test; mutation-checked |
| 2 | `fetchQuery` under the default `networkMode: 'online'` pauses forever when the browser is offline, so a screen would wait at "Checking…" with no way out | **fixed**: `networkMode: 'always'`; test with `onlineManager.setOnline(false)`; mutation-checked |
| 3 | A socket that dies without closing held the check for about 41 s | **fixed**: 15 s bound; fake-timer test; mutation-checked |
| 4 | Settings: Escape, the overlay or ✕ on the warning must not write, and must not keep the Seed | **fixed**: every dismissal routes to `cancelImportWarning`, which clears the ref; test; mutation-checked (dismiss→accept fails the test) |
| 5 | Closing the Add dialog mid-check would still write behind it | **fixed**: the dialog refuses to close while `busy` |
| 6 | Double-click on Add or Import anyway could write twice | **fixed**: `busy` guard on both handlers and buttons |
| 7 | The Seed is passed into a `lib/xrpl` module | **avoided**: `checkBeforeImport` receives the derived address only |
| 8 | A cached account-state answer up to 15 s old satisfies the check | **accepted**: it is a read that succeeded for this exact address and network (the shared cache entry), within the existing `staleTime` |
| 9 | Other failures in the write (IndexedDB, encryption) still toast `err.message` | **accepted**: not a Seed-parse path; the ACs concern malformed-Seed reporting. Unchanged behaviour |
| 10 | Importing a Seed that is already in the vault adds a second entry | **out of scope**: pre-existing; recorded in `deferred-work.md` |
| 11 | An earlier "seed looks invalid" error notice stays in the band after a later successful import | **out of scope**: notice-band behaviour (Epic 3); recorded in `deferred-work.md` |

## Verification

**Commands.** `bun run lint && bun run build && bun run test && bun run
check:contrast` all exit 0.

**Mutation checks.** Each mutation below was applied by this session, the
three new suites were run, and the mutation was reverted.

| Mutation | Result |
|---|---|
| Settings writes before showing the warning | 4 tests fail |
| `checkBeforeImport` returns `null` on a failed read | 4 tests fail |
| `parseSeedInput` does not trim | 2 tests fail |
| `networkMode: 'always'` removed | 1 test fails |
| Onboarding reads the Seed from the (unmounted) input at vault-setup | 3 tests fail |
| Settings shows its own message for a malformed Seed | 2 tests fail |
| Settings warning dismissal accepts instead of cancelling | 1 test fails |
| Onboarding warns only on `master-key-disabled`, not `unchecked` | 1 test fails |
| the 15 s bound removed | 1 test fails |

**Browser pass, 2026-10-04: RUN.** There were two scripted runs.

- **Main run: 25 criteria.** 22 were met as originally evidenced. Three
  invalid-Seed checks were later than the first in their context: Onboarding
  malformed, Settings whitespace-only and Settings malformed. The persisting
  notice (triage #11) was already on screen for them, so their `>= 1` count
  proved nothing.
- **Clean re-run: 9 of 9 met.** Those three were re-run in fresh contexts,
  asserting zero matching notices before each action and exactly one after it.
  In Settings the earlier notice was dismissed between cases. The build under
test was `fix/epic-11-seed-import` on `dev` `b23eb74`, with the 15 s bound in
place. Its `src/` is byte-identical to the PR's head commit: only this spec
changed after the runs, and `dev` did not move, so no rebase was needed. It was served by `bun run dev --port
5175`.

How it was driven:
- Playwright Chromium (playwright-core 1.49.1).
- A CDP virtual authenticator (ctap2, internal, resident key, UV, PRF).
- Testnet.
- Three fresh isolated browser contexts. No existing wallet was touched.

Fixtures:
- Two Testnet accounts were funded from the faucet. On one, a script ran
  `SetRegularKey` and then `AccountSet SetFlag 4`. Both returned `tesSUCCESS`,
  and `account_info` confirmed `lsfDisableMaster`.
- Three never-funded Seeds were used for the unreachable cases.
- Vault writes were counted by reading the `wallets` store in IndexedDB
  directly.

| Context | Width / theme | Exercised | Result |
|---|---|---|---|
| 1 | 390 light (Onboarding) | whitespace-only and malformed Seeds | shared message; no advance |
| 1 | 390 light (Onboarding) | disabled account, `"  seed\n"` | warning shown with 0 wallets stored; 1 stored after "Import anyway"; the wallet shown is the disabled account |
| 1 | 1280 light (Settings) | whitespace-only and malformed Seeds | shared message; no write; no raw xrpl.js text |
| 1 | 1280 light (Settings) | disabled account | warning before the write (count unchanged); Escape closes and writes nothing; "Import anyway" writes exactly once |
| 1 | 1280 light (Settings) | enabled account, `"seed\n  "` | written with no warning |
| 1 | 1280 light (Settings) | browser offline, unread account | "Master key not checked" after 15.4 s (it was 41 s before the bound); nothing written; Cancel writes nothing |
| 2 | 320 dark (Onboarding) | every websocket closed by route, `navigator.onLine` still true | "Master key not checked" in 1.3 s; nothing written; no horizontal overflow; Cancel writes nothing |
| 3 | 390 dark (Onboarding) | browser offline after load | "Master key not checked" in 1.3 s; "Import anyway" writes once |
| 3 | 320 dark (Settings) | disabled account | warning dialog fits 320 px (element and viewport measured) |
| 4 (clean re-run) | 390 light (Onboarding) | malformed Seed, starting from zero notices | exactly one shared message |
| 5 (clean re-run) | 1280 light (Onboarding → Settings) | enabled account via Onboarding (no extra step); then Settings whitespace-only, dismissed, then malformed | 0 → 1 shared message each time; no raw xrpl.js text; nothing written |
| 6 (baseline) | 390 light (Onboarding at `b23eb74`) | valid enabled-account Seed | **fails on the baseline**: raw `invalid_input_size…` notice, 0 wallets stored — the regression this epic fixes |

**Screenshots.** Sixteen were taken, and each was opened and judged. They are
held in this session's scratchpad, not committed:
- 01/02: Onboarding invalid-Seed notice;
- 03: Onboarding disabled warning;
- 04: Balances after the import, showing the disabled account's 99.999976
  XRP;
- 05/06: Settings invalid-Seed notice;
- 07: Settings disabled warning;
- 08: three wallets after the import;
- 09: Settings "not checked";
- 10/11: Onboarding "not checked", dark at 320 and 390;
- 12: Settings warning, dark at 320;
- 20: baseline Onboarding's raw error;
- 21/22/23: the clean re-run of the invalid-Seed notices.

**Gaps, stated plainly:**
- 200% zoom was not exercised.
- The busy "Checking…" label was not screenshotted.
- The Onboarding "Cancel import" path after the vault was created was exercised
  for "writes no wallet". Where a reload lands afterwards was not examined.
- Mainnet was not touched.
