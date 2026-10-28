---
title: 'Lock key on open cards'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: 'f0d1658edcd494d436b8ecb6e31724a20c508b39'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-17-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/DESIGN.md'
warnings: []
deferred:
  - summary: >-
      The live region is written with `textContent`, so a second identical announcement (relock after reopen) may not be re-read by some screen readers.
    evidence: |-
      Clearing the node first, or `aria-atomic`, would help; behaviour differs by screen reader and needs a real one to settle.
    location: >-
      src/pages/Chooser.tsx
    severity: low (unverified)
  - summary: >-
      `tearDownLock` closes the lock and then removes cached data; if the second step threw, the lock would be closed while the card says nothing.
    evidence: |-
      The failure text is hidden once the card flips, and the cache is also cleared by `useClearCacheOnLock` for any lock that closes, so no data is left readable. Keep in mind if `tearDownLock` ever becomes async.
    location: >-
      src/lib/teardown.ts
    severity: low
  - summary: >-
      The Lock key's wrapping, the shared-lock line under the title and the No Open Check line are unverified at 320, 390 and desktop in both themes.
    evidence: |-
      jsdom cannot observe layout or contrast; run the final browser pass.
    location: >-
      src/components/wallet/WalletCard.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** A user who left a wallet open (leaving does not lock it) can close that lock only by re-entering the wallet and using its header Lock key. The Chooser shows open cards but gives no way to lock one, no word on cards that share a lock, and no word on cards that have nothing to lock.

**Approach:** An open card with an Open Check gets a **Lock** key that closes its lock through `tearDownLock`, so every card on that lock flips to Locked in place, with a line naming the others that locked with it and a polite announcement. An open card with no Open Check shows why there is nothing to lock. Lock-state changes on the Chooser are announced from one polite region. This closes Story 5's deferred note about one `aria-live` region per card.

## Boundaries & Constraints

**Always:** The open card's action row (below its network rows) shows, when `group.allowsLock` is true, a **Lock** key (`Button variant="outline" size="sm"`, visible legend `Lock`, accessible name `Lock {name}`, wrapping and 44px on coarse pointers like the other card keys). Pressing it calls `tearDownLock(queryClient, group.lockId)` from `@/lib/teardown`; nothing on the Chooser calls `closeLock` or `queryClient.clear` (AD-16, AD-45). The lock closing flips every card sharing that `lockId` to Locked in place (the store already does this); order and the user's position do not change. When `allowsLock` is false the card shows no Lock key and the visible line `No Open Check: this wallet opens itself, so there is nothing to lock.` Locking names the other wallets that locked with it: a visible line under the Chooser title, `Locking {name} also locked {other names}: they share one lock.` (other names comma-separated in card order; shown only when at least one other card was on that lock; replaced by the next Lock and cleared when the Chooser unmounts). Names are computed from the groups before the teardown. If `tearDownLock` throws, the card stays open and shows persistent visible text `Could not lock this wallet. It is still open.` (`role="alert"`, never auto-dismissed, cleared when the card flips or Lock succeeds); no other card is changed. One polite live region (`role="status"`, `aria-live="polite"`, visually hidden) on the Chooser announces each card's lock-state change by its name and new state (`{name}: Locked.` / `{name}: Open.`), whatever caused it (Lock key, auto-lock expiry, backgrounding); remove the per-card `aria-live` attributes added in Story 5. No announcement on first render. The Chooser stays read-only toward the ledger (AD-36): no hook that reads a ledger or a wallet is added. No `:focus` styling, no `outline-none`, no new colour token. After Lock, focus stays on the Chooser (move it to the Chooser h1, since the Lock key unmounted with its open-card action row). Locked cards are unchanged.

**Never:** No Rename, Remove or Configure keys (Stories 9, 10, 14). No Lock key on a locked card. No lock close outside `tearDownLock`. No new store field.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lock | open card, `allowsLock` | `tearDownLock(queryClient, lockId)` runs; card shows Locked; focus on the h1; announcement `{name}: Locked.` | n/a |
| Shared lock | two cards on one lock, one pressed | both flip to Locked; line `Locking A also locked B: they share one lock.` | n/a |
| No Open Check | open card, `allowsLock` false | no Lock key; line `No Open Check: this wallet opens itself, so there is nothing to lock.` | n/a |
| Failure | `tearDownLock` throws | card stays open; persistent `Could not lock this wallet. It is still open.` | other cards unchanged |
| Auto-lock | timer expires with the Chooser showing | card flips; polite announcement; no note line | n/a |
| First render | mount | nothing announced | n/a |
| Locked card | closed lock | no Lock key, no No-Open-Check line | n/a |

## Code Map

- `src/components/wallet/WalletCard.tsx` -- `OpenCard` (add action row: Lock key or the No Open Check line), `LockedCard`/`OpenCard` `StatusLegend aria-live="polite"` (remove). Reads only `group`.
- `src/pages/Chooser.tsx` -- computes groups; add the shared-lock line, the failure state per card, the single `role="status"` region, focus to `#chooser-heading` after Lock; owns `useQueryClient()`.
- `src/store/wallet-groups.ts` -- `OpenGroup.allowsLock`, `lockId`, `label`; read only.
- `src/lib/teardown.ts` -- `tearDownLock`.
- `src/pages/__tests__/chooser.test.tsx` -- Chooser tests (AD-36 read budget; mocks); extend, never weaken. `src/components/__tests__/` for card tests.
- chooser `EXPERIENCE.md` (Exact strings, State Patterns: Shared lock, Open card) and `DESIGN.md`.

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/WalletCard.tsx` -- Lock key, No Open Check line, no per-card `aria-live` -- FR-84, UX-DR12
- `src/pages/Chooser.tsx` -- `tearDownLock` wiring, shared-lock line, failure text, one live region, focus after Lock -- AD-45, AD-38, UX-DR11
- Tests: Lock calls `tearDownLock` with the group's `lockId` and no inline `closeLock` or `queryClient.clear` (assert on source or spies); shared-lock flip and note naming the others; No Open Check line and no key; failure keeps the card open with persistent text; announcement on Lock and on an auto-lock style `closeLock` from the store, none on first render; read budget still holds (empty query cache, no client). A test fails if the Lock key bypasses `tearDownLock`.

**Acceptance Criteria:**
- Given an open card whose Open Check is not `none`, when Lock is pressed, then that card and every card on the same lock flip to Locked in place through `tearDownLock`, announced politely, and a line names the others that locked with it.
- Given an open card whose Open Check is `none`, then it shows no Lock key and the No Open Check line.
- Given the lock cannot be closed, then visible persistent text shows and the card stays open.
- No `closeLock` or `queryClient.clear` is called inline.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 11, edge-case hunter 9, verification gap 2 plus 2 notes, intent alignment descriptive; grouped by root cause into the rows below — medium 1 and low 3 (patched), low 3 deferred, rest false or rejected as low
- findings:
  - `[medium]` `patch` A failed Lock's alert came back when its card flipped (auto-lock) and was opened again, and another card's successful Lock wiped it (all four layers) — the failure is now cleared during render once its card is not open, and a successful Lock clears only its own card's failure; tests added for retry, flip-and-reopen.
  - `[low]` `patch` A failed Lock left an earlier "also locked" line standing — it is cleared on failure; test asserts no note and no focus move.
  - `[low]` `patch` The shared-lock line was never shown replaced — test added; `tearDownLock` mock history is reset in `beforeEach`.
  - `[low]` `defer` Repeated identical announcements, a partial `tearDownLock`, and the layout checks — see deferred.
  - `[false]` `reject` `tearDownLock` may be asynchronous and reject unseen — it is synchronous (`closeLock`, then `removeLockedAccountData`), as its signature and the existing header caller show.
  - `[low]` `reject` Source-scan test uses a cwd-relative path and a broad regex, no pre-action hint on shared cards, note placement, new groups unannounced, `onLock` required prop, import placement — the scan runs under the repo's own test command and the spy test is the real guard; the rest are cosmetic or specified elsewhere (a hint before pressing Lock is a new feature the story does not ask for).

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Browser pass of the open card action row and the shared-lock line at 320, 390 and desktop in both themes, deferred to the final pass.

## Auto Run Result

Status: done

- Summary: An open card with an Open Check has a Lock key that closes its lock through `tearDownLock`, flipping every card on that lock in place, with a line naming the others locked with it; an open card with no Open Check says why there is nothing to lock; a failed Lock shows persistent text and the card stays open. One polite live region announces every lock-state change; the per-card `aria-live` attributes are gone.
- Files: `src/components/wallet/WalletCard.tsx`, `src/pages/Chooser.tsx`, `src/pages/__tests__/chooser.test.tsx`.
- Review: 3 patches applied (1 medium, 2 low), 3 deferred, the rest rejected with reasons above.
- Follow-up review recommended: false.
- Verification: `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass after patches.
- Residual risk: no browser pass yet for the new key and lines.
