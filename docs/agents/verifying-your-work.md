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
- **Never** keep polishing past the second round. Open-ended self-review burns
  the owner's budget doing worse what a fresh review does better.

## Ask first

- Resetting or erasing local wallet state to get a clean test environment.
  Inspect the persisted metadata first and say what you found — it is encrypted
  seed material, and "it looked like test data" is a judgement the owner should
  get to make.
