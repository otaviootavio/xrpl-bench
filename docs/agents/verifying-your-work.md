# Scenario: you are about to claim something works

Reasoning: `docs/decisions.md` §6.12 (the standing verification prerequisite),
plus incidents recorded in [anti-patterns.md](anti-patterns.md).

## The gates, and what each one cannot see

| Command | Catches | Blind to |
|---|---|---|
| `bunx tsc -b` | types | everything visual, every runtime behaviour |
| `bun run lint` | oxlint rules | contrast, layout, semantics |
| `bun run test` | 29 unit tests | anything that needs a browser |
| `bun run check:contrast` | every token pair, both themes | anything not expressed as a token |
| `bun run build` | typecheck + bundle + PWA manifest | whether the result is usable |

All five green means nothing is *provably* broken. It does not mean the change
works. Contrast failures are invisible to `tsc`; a clipped control is invisible
to all five.

## Definition of done for a UI-touching story

A story is UI-touching when its diff changes anything that renders: a
component, a page, a token or stylesheet, `index.html`, the manifest, or copy
the operator reads. Such a story moves from `review` to `done` only after a
browser pass whose screenshots were opened and whose result is recorded in the
story spec's Verification section: the build or commit under test, how the
browser was driven, the widths and themes, and each criterion marked met or not
met. The four gates do not substitute for it, and neither does a measurement
script. If the pass cannot be run, the story stays in `review` and its spec says
what blocked it. The passkey is no longer a valid blocker: see the recipe below.

Reasoning: the Epic 5 retrospective
(`_bmad-output/implementation-artifacts/epic-5-retro-2026-09-30.md`, P1–P3 and
action item 7). Every browser pass that ran in that epic found a defect that the
gates and three layers of review had passed.

## Always

- **Test with more than one wallet.** This is a standing prerequisite, not a
  nicety. Several surfaces only render past a state threshold: the header wallet
  selector at two wallets, the zero-balance trust-line notice, "Load more" in
  history. A single unfunded test account renders none of them.
- **Test with a funded account.** An unactivated address shows an activation
  notice and no balance, so a screenshot of it proves nothing about the readout.
  On Testnet, fund via the in-app faucet button.
- **Test both themes.** They are two different materials, and a defect in one
  is routinely invisible in the other. Emulate `prefers-color-scheme`; do not
  fake it by overriding tokens.
- **Test 320px, 390px, and a desktop width.** 320px and 200% zoom are supported
  conditions. A clipped or unreachable control at either is an escalation, not
  a nitpick.
- **Measure the component, not the document.** `document.scrollWidth ===
  clientWidth` is blind to a child that scrolls internally — it will pass while
  half your navigation sits off-screen. Measure the element's own `scrollWidth`
  and each item's bounding rect.
- **Open every screenshot before citing it.** A capture is evidence only when
  you have looked at it and confirmed it shows what its filename claims: no
  mid-load skeletons, no blank regions, no wrong screen behind a right name.
  Wait on a real settled signal — a specific value being visible — not a fixed
  sleep.
- **Batch verification into rounds.** Build fully, inspect once across all
  viewports and themes together, fix everything in one batch, confirm with at
  most one more round. Then stop.

## Never

- **Never** report a task complete on the strength of the five gates alone if
  the change was visual.
- **Never** cite a screenshot you have not opened.
- **Never** describe your own verification in stronger terms than you ran. "The
  gates pass" is a claim you can support; "no issues remain" is not.
- **Never** move a UI-touching story to `done` without the browser pass above.
- **Never** record "needs a virtual authenticator" or "the passkey prompt never
  resolves" as a blocker. Use the recipe below.
- **Never** keep polishing past the second round. Open-ended self-review burns
  the owner's budget doing worse what a fresh review does better.

## Ask first

- Resetting or erasing local wallet state to get a clean test environment.
  Inspect the persisted metadata first and say what you found — it is encrypted
  seed material, and "it looked like test data" is a judgement the owner should
  get to make.

## Recipe: a browser pass past the passkey

Wallet setup registers a passkey (`registerPasskey`, `src/lib/crypto/webauthn.ts`)
and asks for user verification and the PRF extension. In a headless or
automated browser, nothing answers `navigator.credentials.create()`, so setup
hangs at "Setting up…". A CDP virtual authenticator answers it. This recipe has
two sources:

- **The recorded passes** (`spec-5-3-fee-read-not-zero.md`,
  `spec-5-4-amount-upper-bound.md`, `spec-5-5-one-invalidation-group.md`,
  `spec-5-4-history-failed-row-clipping.md`,
  `spec-retro-5-send-guards-fail-closed.md`). They record `ctap2`, `internal`,
  resident key and PRF.
- **`webauthn.ts`**, which requires user verification. The UV and
  presence-simulation options below come from there, not from the recorded
  passes.

1. **Serve the tree under test.** Run `bun run dev -- --port 5176 --strictPort`
   (any free port works). Note the commit you are testing; the spec records it.
2. **Drive Playwright Chromium**, either the Playwright MCP tools or a script.
3. **Attach the authenticator before the first click on setup or unlock.** It
   belongs to the page's CDP session:

   ```js
   const cdp = await page.context().newCDPSession(page)
   await cdp.send('WebAuthn.enable')
   await cdp.send('WebAuthn.addVirtualAuthenticator', {
     options: {
       protocol: 'ctap2',
       transport: 'internal',
       hasResidentKey: true,
       hasUserVerification: true,
       isUserVerified: true,             // registration and unlock both require UV
       automaticPresenceSimulation: true, // answers the prompt without a click
       hasPrf: true,                     // the vault's passkey unlock needs PRF output
     },
   })
   ```

   Without `hasPrf`, registration still succeeds, but `auth.ts` skips wrapping
   the vault key for the passkey (`if (prfSupported)`). The wallet then unlocks
   by PIN only, and the passkey path goes untested.
4. **Use throwaway Testnet wallets only.** Never Mainnet, and never a seed that
   holds anything. The credential exists only as long as that browser session
   does. A wallet registered with it can afterwards be unlocked only with the
   PIN set during setup, so record the PIN in the session, not in the repo.
5. **Reach the states the story needs.**
   - Fund the account with the in-app faucet.
   - Create a second wallet, because the selector and other surfaces only
     render from two wallets (see Always).
   - Produce real ledger outcomes rather than mocked ones. For example, 0.5 XRP
     to an unfunded address gives a real `tecNO_DST_INSUF_XRP`.
6. **Force a failed or in-flight read only with a temporary switch.** The
   recorded passes used a `localStorage` flag read by a temporary branch in
   `src/lib/xrpl/reads.ts`. Revert it, and confirm `git status` is clean before
   you commit. Name the forced state in the spec so a reader knows it was not
   observed naturally.
7. **Capture.** Take screenshots at 320, 390 and 1280 px, in both themes. Set
   the theme with `page.emulateMedia({ colorScheme })` and wait on a specific
   settled value, never on a sleep.
   - Write screenshots to the session scratchpad, not the repo.
   - Open every one before citing it.
   - To count ledger reads per action, log the frames from
     `page.on('websocket', …)` (as in the 5.5 pass).
