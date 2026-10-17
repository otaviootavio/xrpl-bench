# Version and fact review: ARCHITECTURE-SPINE.md (passkey signing), as of 2026-10-10

Method: installed `node_modules/xrpl` 5.1.0 read directly; live `server_info` queries; W3C WebAuthn editor's draft (w3c.github.io/webauthn) fetched and grepped; xrpl.org pages; web search. "Training only" marks anything I could not confirm.

## Verdict
Mostly sound. No claim is flatly false. Three claims are under-specified in ways that would mislead an implementer (items 1-3), and two are asserted without a source (items 4-5).

## Claim table

| Claim | Status | Evidence |
|---|---|---|
| `Wallet.fromEntropy(entropy, {algorithm})` exists; `fromSeed(seed, {algorithm, masterAddress})` exists | CONFIRMED | xrpl 5.1.0 `Wallet/index.d.ts`: both take `masterAddress?` and `algorithm?`. `package.json` pins `^5.1.0`, installed 5.1.0. |
| Entropy length | NOT STATED IN SPINE | `ripple-keypairs` asserts `entropy.length >= 16` and silently uses only the first 16 bytes. HKDF output must be at least 16 bytes; anything past 16 is ignored, so the effective seed is 128 bits. |
| Exactly one Regular Key per Account | CONFIRMED (weakly) | xrpl.org SetRegularKey describes a single key pair; omitting `RegularKey` removes it; the key cannot equal the master key. The page does not literally say "maximum one", but the ledger object has one `RegularKey` field. |
| `asfDisableMaster` needs a Regular Key or signer list | CONFIRMED | xrpl.org "Disable Master Key Pair": otherwise `tecNO_ALTERNATIVE_KEY`. `asfDisableMaster = 4` in installed `accountSet.js`; `lsfDisableMaster` is 0x00100000. |
| `network_id` Mainnet 0, Testnet 1, Devnet 2 | CONFIRMED | Live `server_info` today: xrplcluster.com returns 0, s.altnet.rippletest.net returns 1, s.devnet.rippletest.net returns 2. The docs do not list these numbers; this is empirical. |
| autofill `LastLedgerSequence` = validated + 20 | CONFIRMED | `LEDGER_OFFSET = 20` in `sugar/autofill.js:22`, applied at line 249. |
| PRF: `eval.first` per assertion | CONFIRMED | Spec: `AuthenticationExtensionsPRFInputs { eval, evalByCredential }`; salt = SHA-256("WebAuthn PRF" \|\| 0x00 \|\| first). Matches the repo's `webauthn.ts`. |
| BE bit 3, BS bit 4; BE permanent | CONFIRMED | Spec flags section; "The value of the BE flag is set during authenticatorMakeCredential and MUST NOT change." |
| BE readable at registration | CONFIRMED | `AuthenticatorAttestationResponse.getAuthenticatorData()` exists (spec 5.2.1) and returns authData from the attestationObject; flags byte is at offset 32. Level 3 only; fall back to parsing `attestationObject` CBOR on older engines. |
| HKDF/PBKDF2 in WebCrypto | CONFIRMED (training, plus spec) | Both are normative WebCrypto algorithms. Not re-fetched; low risk. |
| Changing `rp.id` loses PRF output | CONFIRMED, but the spine understates it | See finding 3. |

## Findings

1. **AD-29 and FR-77: disabling the master key must be signed by the master key.** xrpl.org: the `asfDisableMaster` AccountSet "MUST be signed with the master key pair". AD-29 says a controlled Wallet "signs with `masterAddress` set" and routes `AccountSet` through `signForWallet`, but never says which key signs this one transaction. If the Account is controlled by a different Wallet's Regular Key, that Wallet cannot disable the master. The spine should state that this transaction is signed by the Account's own master key, before the Regular Key takes over. Re-enabling (`ClearFlag`) is the reverse: it needs the Regular Key or a signer list. I also recall (training only) that rippled returns `tecNEED_MASTER_KEY` for a regular-key-signed disable, but I did not confirm that code.

2. **AD-24: the PRF-at-registration wording is a gap.** The spec says authenticators may not evaluate PRF at creation. The existing code correctly uses `prf: {}` and reads `enabled`. The spine says "PRF is capability-detected per credential" but does not say that the first `eval` result needs a separate assertion right after creation (a second prompt). That is a UX cost for FR-62/FR-63. Support is also uneven in 2026 (search, secondary sources): Chrome/Android with Google Password Manager is strongest, Safari 18+ for platform authenticators, Safari with CTAP2 hardware keys has a reported bug (WebKit bug 311099, March 2026), a 1Password browser-extension regression was reported in June 2026, and Firefox is platform-dependent. The spine's "browser-provided; capability-detected, not pinned" is acceptable but should add a deliberate test on a real device, because a derived Seed that cannot be re-derived on another provider is a fund-loss path.

3. **`rp.id` change: stronger than "lose PRF output".** A credential is scoped to its RP ID (spec, 5.1.3 and the registrable-domain-suffix rule). A different rp.id cannot assert that credential at all, so the passkey, the PRF output and the derived Seed are all unreachable. PRF salts are hashed without the RP ID, so nothing makes the output portable. The only exception is Related Origin Requests (Level 3, `/.well-known/webauthn` on the rpId host, shipped in Chrome 128/129): the rpId stays fixed while another origin uses it. Browser support beyond Chrome is unconfirmed (a Firefox 140 failure was reported in October 2026; no Safari data found). The spine's Deferred item on the production origin should name ROR as the only non-destructive way to move origin, with its support caveat. Also: `rp.id` must be a registrable-domain suffix of the origin's effective domain, so a bare `localhost` or a `*.pages.dev`-style public suffix behaves differently in dev and in preview deploys.

4. **AD-30 "+75 about five minutes" is unsourced.** XRPL ledgers close roughly every 3-5 seconds, so 75 ledgers is roughly 4 to 6 minutes. The ratio is plausible but not confirmed here; call it approximate. The spine is right that `autofill` gives +20.

5. **AD-30 `network_id` in the QR payload is an envelope field.** The installed xrpl.js only puts `NetworkID` into a transaction when the network id is above 1024 (`RESTRICTED_NETWORKS`; `txNeedsNetworkID`). Mainnet, Testnet and Devnet transactions therefore carry no `NetworkID`. The offline device must compare the envelope `network_id`, not a transaction field. Worth one sentence.

6. **Minor.** BE/BS "Yubico docs call the flags deprecated hints unless backed by trusted attestation": the synced vs device-bound label in FR-71 is advisory, and BS can flip after registration. AD-24 already reads BE once; add that BS is not stored.

## Sources
- xrpl.org SetRegularKey; Disable Master Key Pair (fetched)
- W3C WebAuthn editor's draft, sections 5.2.1, 6.1, PRF extension (fetched and grepped)
- Live `server_info`: xrplcluster.com, s.altnet.rippletest.net, s.devnet.rippletest.net (2026-10-10)
- Installed xrpl 5.1.0 and ripple-keypairs in `node_modules`
- Web search: Corbado PRF guide, WebKit bug 311099, Chrome 129 ROR post, Firefox ROR thread (secondary; treat as indicative)
