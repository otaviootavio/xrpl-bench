# Epic: App Versioning & User-Controlled Updates

Covers how the wallet identifies which build it is running, how it learns a
newer release exists, and how the **user** — never the app, never the server —
decides when to move onto it. See the [Index](./INDEX.md) for scope and shared
XRPL facts.

This epic is the only one in this set that is not about the ledger, so its
stories close with **Relevant mechanism** rather than *Relevant XRPL mechanism*.

**Why this epic exists.** The wallet's source is public and the wallet is
delivered over the web, which means the
code that signs transactions is re-fetched rather than installed once. Whoever
controls the origin can therefore change the signing code between two visits.
A silent auto-update makes that substitution invisible; requiring the user to
accept each version makes it an event they can inspect, and — because the
source is public — verify. This is a deliberate trade of convenience for
sovereignty, consistent with `PRODUCT.md`'s "nothing leaves the device".

**The consequence for implementation:** the service worker must be
prompt-based, not `autoUpdate`. A new worker installs and then **waits**;
nothing calls `skipWaiting()` on its own. `docs/decisions.md` guardrail #6 still
applies — cache versions increment per release and stale caches are purged on
activate — but activation is now user-triggered.

---

### US-1: See exactly which build I am running
As a user, I want the wallet to tell me its version and the exact source commit it was built from, so that I know what code is holding my keys and can look it up myself.

**Acceptance Criteria:**
- Settings shows the release version, the short commit SHA, and the build date.
- These values are **baked in at build time**, never fetched at runtime, so they are correct offline and cannot be changed by a later network response.
- The commit SHA links to that commit in the public repository.
- The version is never rendered as "unknown", "dev", or empty in a release build; a missing build stamp fails CI rather than shipping.
- The same values are reachable without unlocking the wallet, so a user can identify a build before entering a PIN.

**Relevant mechanism:** Build-time injection of the git tag and commit SHA into the bundle. Because the source is public, a version string is only meaningful if it maps to a specific published commit — a bare semver with no commit reference is not sufficient for this epic's purpose.

---

### US-2: Be told a newer version exists, without being moved onto it
As a user, I want to be informed that an update is available and left alone until I act, so that the code running my wallet never changes underneath me.

**Acceptance Criteria:**
- On startup, and when the user asks, the wallet checks for a newer release.
- If one is found, a **non-blocking** indicator appears (Settings row plus a persistent, quiet marker). No modal, no interstitial, no redirect.
- The running code is not replaced. A newly downloaded service worker stays in the *waiting* state; `skipWaiting()` is never called automatically, and the page is never reloaded by the app.
- If the check fails — offline, blocked, rate-limited — the wallet works exactly as before and reports that the check could not run, distinguishing "no update" from "could not tell".
- The check requests only the origin's own release metadata. It is never cached by the service worker, and it never touches a ledger endpoint.
- A "Check for updates" action lets the user re-run it on demand.

**Relevant mechanism:** `vite-plugin-pwa` configured with `registerType: 'prompt'`, exposing the waiting-worker state to the UI. Release metadata is a static JSON manifest on the app's **own** origin (V3) — never a third-party API — served with a minimal cache lifetime, consistent with the shell-caching rules in `docs/agents/shipping-and-ci.md`.

---

### US-3: Apply an update deliberately
As a user, I want to install a new version through an explicit action that tells me what will happen, so that an update is something I chose rather than something I noticed afterwards.

**Acceptance Criteria:**
- The update row shows: the new version, its release date, a link to what changed (US-6), and a link to how to verify the build (US-7).
- An **Install update** control applies it. Before proceeding, a confirm step states the exact consequence in plain language: the app will reload onto the new version, and any unsaved form input is lost.
- Applying it activates the waiting worker and reloads once. It does not silently retry, and it does not leave the app in a half-updated state where some assets are new and others are cached.
- After reload, Settings reports the new version (US-1), so the user can confirm the update actually took effect rather than trusting that it did.
- If activation fails, the user keeps the version they had and is told the update did not apply.

**Relevant mechanism:** Explicit `skipWaiting()` + `clients.claim()` triggered by the user's action only. Cache version increments per release and stale caches are purged on activate (`docs/decisions.md` guardrail #6).

---

### US-4: Decline an update and keep working
As a user, I want to stay on the version I have for as long as I like, so that I am never forced onto code I have not chosen to trust.

**Acceptance Criteria:**
- **Not now** dismisses the prompt and keeps the current version running indefinitely.
- The quiet indicator remains available so the update is not lost, but the user is not re-prompted with a dialog on every launch.
- Declining is remembered per version: a *newer* release may surface again, the declined one does not nag.
- There is no expiry, no countdown, and no forced update path. The wallet never applies an update the user has not accepted, under any circumstance.

**Relevant mechanism:** Dismissal recorded per release identifier in the same IndexedDB-backed app state as other non-secret preferences (`docs/decisions.md` §5.3) — never `localStorage`.

---

### US-5: Never be updated while a transaction is in flight
As a user, I want the wallet to refuse to update while a payment is being signed or is awaiting validation, so that a reload can never leave me unsure whether my money moved.

**Acceptance Criteria:**
- While a transaction is signing, submitted, or awaiting validation, the **Install update** control is rendered `aria-disabled` with the reason in visible text — never hidden (`docs/decisions.md` §6.4).
- Once the transaction reaches a terminal state — validated, failed, `tec*` with fee charged, or expired — the control becomes available again.
- No code path reloads the app between signing a transaction and learning its outcome.

**Relevant mechanism:** The in-flight submit state already tracked by the send and trust-line paths, including `LastLedgerSequence` expiry (`docs/decisions.md` §5.5). A reload mid-submit would lose the client's view of an outcome that is nevertheless real on the ledger, which is precisely the ambiguity this wallet exists to avoid.

---

### US-6: Know what changed before I accept it
As a user, I want to read what a release changes, so that accepting an update is an informed decision and not a leap.

**Acceptance Criteria:**
- Every release has a changelog entry, reachable from the update prompt and from Settings.
- Entries state user-visible changes in the product's own vocabulary, and explicitly flag anything touching key handling, the send path, or money formatting.
- Prominence follows the semver bump (V4): a **major** release presents the update more insistently — a persistent, clearly-worded notice — while **minor** and **patch** releases surface quietly in Settings.
- A release that fixes a security issue is **marked as such** independently of its bump, and says so in the prompt. If a security fix ships as a patch, the marking is what carries the urgency, not the version number.
- No release, however marked, is ever forced. The wallet may say an update is strongly recommended and why; it may not apply it without acceptance.

**Relevant mechanism:** Changelog published with the release tag in the public repository. The "strongly recommended but not forced" position is the deliberate consequence of US-4: a wallet that can push code without consent has the same trust properties as a custodial one, whatever its intentions.

---

### US-7: Verify a build independently
As a technically capable user, I want to check that the code being served matches the published source, so that I do not have to take the maintainer's word for it.

**Acceptance Criteria:**
- Each release publishes the source tag and the cryptographic hashes of the built assets.
- The wallet links to verification instructions; it does **not** claim to verify itself. An app served from a compromised origin cannot attest to its own integrity, and must not imply otherwise.
- Instructions describe rebuilding from the tag and comparing the resulting asset hashes against both the published values and what the origin actually serves.
- The build is reproducible: the same tag produces the same asset hashes.

**Relevant mechanism:** Reproducible builds plus published per-commit asset hashes. **Subresource Integrity is not a substitute** — an attacker controlling the origin controls `index.html` and therefore the integrity attributes themselves, so SRI cannot defend against origin compromise. Verification is meaningful because it can be performed by a third party, not because every user will perform it.

---

### US-8: Recover if an update leaves the app broken
As a user, I want a way back if a new version fails to start, so that a bad release cannot separate me from my funds.

**Acceptance Criteria:**
- Recovery **never requires clearing site data.** Clearing storage destroys the encrypted vault, so any instruction to "clear your browser data" is a funds-loss instruction and must not appear in a recovery path.
- Documented recovery is: reload, then reinstall the PWA, then — only as a last resort — re-import from the seed on a clean install.
- The seed remains the ultimate backstop, which is why backup confirmation is mandatory at onboarding (see [account-onboarding.md](./account-onboarding.md) US-6).
- Release notes for any version that changes vault or storage format state explicitly whether a downgrade is possible.

**Relevant mechanism:** The precache from the previous release is not discarded until the new version has started successfully, so a failed activation leaves a working shell rather than none. Vault data in IndexedDB is independent of the shell cache and survives shell replacement — the two must never be torn down together, unlike the deliberate joint teardown on lock or wallet removal (`docs/decisions.md` guardrail #7).

---

### US-9: Keep using the installed version offline
As a user, I want the wallet to open and work without a network, so that an update check is never a precondition for reaching my own wallet.

**Acceptance Criteria:**
- Startup never blocks on the update check. A failed or slow check does not delay the app.
- The installed shell runs offline. Ledger-dependent surfaces state honestly that they cannot report a balance without a connection, rather than showing a stale one (`docs/decisions.md` guardrail #6).
- The version shown in Settings (US-1) is correct offline.

**Relevant mechanism:** Static shell precached cache-first; all ledger and RPC traffic network-first and never cached. The update check is treated as ordinary network work, not as part of boot.

---

## Open decisions this epic depends on

Recorded rather than assumed, because each changes what gets built:

All four are now answered (2026-09-02). Kept as a record of what was decided
and why, because each one shapes acceptance criteria above.

| # | Decision |
|---|---|
| ~~**V1**~~ | **Moved, not answered here.** The licence is one decision and now lives in `PRODUCT.md` `## Licence` (`FSL-1.1-ALv2`), tracked as `L1` in [`../sprints/cicd-sprints.md`](../sprints/cicd-sprints.md). It was recorded in two places by mistake; this row exists only to point at the single source. |
| ~~**V2**~~ | **Semantic versioning.** `MAJOR.MINOR.PATCH`, starting from the first published release. `package.json` currently reads `0.0.0`. |
| ~~**V3**~~ | **A static JSON manifest on the app's own origin.** Not the GitHub Releases API. Two reasons: a check against GitHub would tell a third party which addresses' owner is running this wallet and when, which contradicts "nothing leaves the device"; and it would make the update path fail wherever GitHub is blocked. Metadata from the app origin adds **no new trust assumption** — the origin is already trusted for the code itself — whereas GitHub would add a second party for no security gain. |
| ~~**V4**~~ | **Prominence follows the semver bump.** A **major** release warns harder; **minor** and **patch** warn softly. See US-6. |

**Consequence of V2 + V4: the version number is load-bearing.** Choosing
`MAJOR` vs `MINOR` for a release is no longer bookkeeping — it directly sets how
insistently the wallet asks the user to move. A security fix that ships as a
patch will whisper. Decide the bump with that in mind, and treat "which bump is
this" as part of the release decision rather than a detail.
