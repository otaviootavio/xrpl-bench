# Scenario: you are touching key material

Seeds, PINs, passkeys, the vault, unlock, lock, teardown.
Reasoning: `docs/decisions.md` guardrail #3, #10, §4, §5.3.

This is the area where a mistake is unrecoverable and silent. Read the whole
file before editing anything under `src/lib/crypto/`.

## Always

- **Prove an unlock by decrypting, never by deriving.** Deriving a key from a
  wrong PIN or a wrong passkey assertion *always succeeds*. The only real check
  is whether that key can unwrap known ciphertext — AES-GCM's auth tag fails on
  a wrong key. One random master key is generated at setup and wrapped once per
  configured unlock method; every attempt unwraps it.
- **Build vault metadata from scratch.** Never by spreading the previous meta.
  See the comment at `src/lib/crypto/auth.ts:64` — spreading carried a stale
  passkey wrapper, wrapping a *previous* master key, into a vault whose master
  key had just been regenerated. The passkey then unwrapped successfully, with a
  valid auth tag, and decrypted none of the newly stored seeds.
- **Hold a plaintext seed in a ref, and clear it.** Onboarding keeps the
  generated seed in `pendingSeedRef` and the typed one in an *uncontrolled*
  input — a controlled input would put the seed into React state on every
  keystroke. Both are cleared the moment the flow that needs them completes.
- **Treat any new unlock method as a wrap/unwrap contract.** Adding one means
  wrapping the existing master key with it, not deriving a second independent
  key.
- **Tear down completely on lock or wallet removal:** the in-memory key, the
  persisted session, the TanStack Query cache, and the service worker cache. A
  warm cache behind a lock screen is a documented shared-device vulnerability.

## Never

- **Never** put a seed or private key in `localStorage`, `sessionStorage`,
  React state, a Zustand store, the URL, a query param, a log line, or anything
  that reaches `JSON.stringify`. Including in development builds.
- **Never** commit the app store to a state where a wallet exists and the app
  is unlocked before the seed-backup step has been confirmed. `App.tsx`'s Gate
  switches to `<Main>` the instant `wallets.length > 0 && unlocked`, so an early
  commit skips the backup screen entirely — see `Onboarding.tsx:20`.
- **Never** add a third-party script, analytics, session replay, or verbose
  error reporting that could observe an unlock or seed surface. This includes
  fonts and other subresources: the app's faces are self-hosted for this reason.
- **Never** let a `title` attribute or a hidden element be the only carrier of a
  security-relevant explanation.

## Ask first

- Any change to the number of unlock methods, the backoff/lockout thresholds,
  or what a hard lock requires. These are product decisions recorded in
  `docs/decisions.md` §2, not implementation details.
- Anything that would make a seed leave the device, for any reason.
