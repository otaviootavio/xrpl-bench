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
- **Hold a plaintext seed in a ref, and clear it.** `CreateWalletFlow` keeps the
  generated seed in `seedRef` (Onboarding keeps an imported one in
  `pendingImportSeedRef`) and a typed one in an *uncontrolled*
  input — a controlled input would put the seed into React state on every
  keystroke. Both are cleared the moment the flow that needs them completes.
- **Treat any new unlock method as a wrap/unwrap contract.** Adding one means
  wrapping the existing master key with it, not deriving a second independent
  key.
- **Tear down account data on lock or wallet removal:** the in-memory key, the
  persisted session, and the TanStack Query cache. A lock is per-lock
  (`tearDownLock`): it drops that lock's key and session and removes only its
  Wallets' account-scoped query data, keeping an Account another open lock also
  holds. Never read a Wallet's address, balance or network while its lock is
  closed — mount no ledger hook for it. A warm cache behind a lock
  screen is a documented shared-device vulnerability.
- **Create a Wallet only through `keystore.createStoredWallet`.** It asks
  `policy.ts` first (the only place that says which combinations are legal; a
  screen renders `describeOptions` and never decides), gives the Wallet a lock of
  its own whatever its Open Check, and writes the Seed in exactly one form: under
  the lock's Open Key for a Standard Signing Check, or under a Signing Key that
  only the PIN or a passkey unwraps (`sealedSeed` + `signing`, no
  `encryptedSeed`), so the session can never open it. Every salt and `info`
  string is generated and stored on the record. A failure after the lock is
  written removes that lock; removing a Wallet's last view removes its lock
  (never the legacy one). A PIN Signing Check is asked through the PIN dialog
  (`usePrompts()`), never `unavailablePrompts`.
- **A Passkey-Derived Seed is computed, never stored.** Only
  `keystore.createDerivedWallet` makes one, and its record has no
  `encryptedSeed`, `sealedSeed` or `signing`: just the public `derived` inputs
  (credential id, rpId, ordinal, backup-eligible flag). The Seed is
  `Wallet.fromEntropy(HKDF(PRF(SHA-256('xrpl-bench:seed:v1' | ordinal))))`
  (`derive.ts`), held for one signature or reveal and dropped. Its salt and info
  string are frozen — `derive.test.ts` pins a vector; never "tidy" them. There is
  no ciphertext to decrypt, so the unlock proof is the address: a derived address
  that differs from the record's is `wrong-credential` and counts; a cancelled
  prompt never does. When the same passkey is also the Open Check, the lock keeps
  its own random PRF salt and `hkdfInfo`.
- **A Mainnet Wallet whose only check is a passkey is created only after its
  Seed is written down and confirmed.** `policy.ts` decides
  (`requiresWrittenSeed`); `createStoredWallet` and `createDerivedWallet` call
  `ctx.confirmWrittenSeed(seed)` after the Seed exists and before any credential,
  lock or Wallet is written (`false` is `cancelled` and writes nothing, no callback
  is `refused`). The flow holds the Seed in `seedRef` for that step only and the
  typed groups in uncontrolled inputs (`seed-confirmation.ts`). Revealing a
  Standard Wallet's Seed re-passes its Open Check with `openLock(..., { persist:
  false })`: a reveal never writes or extends a session. No copy may claim a key
  is unrevealable; a test scans for that wording.
- **Change a Wallet's checks only through `keystore.editChecks`.** It resolves the
  result with `policy.ts` and judges it with the same `checkWalletRequest` as
  creation, then passes the current check the change affects (an Open Check or
  auto-lock edit re-passes the lock's Open Check; a sealed Wallet's Signing Check
  edit passes its Signing Check) before any credential is built, asks for the
  written Seed when the result needs it, and commits the new lock record and the
  Wallet in one transaction with a compare-and-swap on `rev` (`db.commitWalletEdit`).
  Never write the Seed's ciphertext, a lock or `signingCheck` any other way. An Open
  Check edit makes a new lock for this Seed record only; the legacy lock is never
  deleted and its other Wallets are untouched. The keystore touches no session: the
  caller swaps the locks. A component renders `describeEditOptions` and decides
  nothing.
- **Every rpId comes from `getRpId()`** (`webauthn.ts`), which reads the build's
  `__RP_ID__` (set per branch in `vite.config.ts`) and falls back to
  `location.hostname` only when none is set. Nothing else reads the page host. Every new
  credential record stores the rpId it was registered under; later assertions
  pass it. The Mainnet refusal for a Passkey-Derived Seed on `*.b-cdn.net` lives
  in `policy.ts`, not in a component.
- **Tests reach WebAuthn through `substituteCredentials` / `resetCredentials`**
  (AD-12), not by stubbing `navigator`.
- **Register every new persistence owner in `lib/teardown.ts`**
  (`PERSISTED_ACCOUNT_DATA`). "Remove everything" calls `tearDownAllLocalState`
  and clears nothing field by field.

## Never

- **Never** put a seed or private key in `localStorage`, `sessionStorage`,
  React state, a Zustand store, the URL, a query param, a log line, or anything
  that reaches `JSON.stringify`. Including in development builds.
- **Never** commit the app store to a state where a wallet exists before the
  seed-backup step has been confirmed. `App.tsx`'s Gate switches to `<Main>` the
  instant `wallets.length > 0` (there is no app-wide unlock any more; each
  Wallet's own lock gates its panels), so an early commit skips the backup
  screen entirely — see `Onboarding.tsx` and `CreateWalletFlow.tsx`, which commit only after the backup.
- **Never** add a third-party script, analytics, session replay, or verbose
  error reporting that could observe an unlock or seed surface. This includes
  fonts and other subresources: the app's faces are self-hosted for this reason.
- **Never** let a `title` attribute or a hidden element be the only carrier of a
  security-relevant explanation.
- **Never** clear the service-worker cache on lock or single-wallet removal. It
  holds only the precached shell, never account data, and deleting it stops the
  app opening offline. Only "remove everything" clears it, and it unregisters
  the service worker too, so the reload precaches the shell again —
  `docs/decisions.md` §13 (AD-16).

## Ask first

- Any change to the number of unlock methods, the backoff/lockout thresholds,
  or what a hard lock requires. These are product decisions recorded in
  `docs/decisions.md` §2, not implementation details.
- Anything that would make a seed leave the device, for any reason.
