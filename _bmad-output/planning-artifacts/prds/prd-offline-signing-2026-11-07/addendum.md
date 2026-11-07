# Addendum: Offline signing

Technical notes for architecture. Not requirements.

## What exists today (to reuse, not rebuild)

- `src/lib/qr-codec.ts` (AD-30): payloads `xrplbench:1:u:` (unsigned, with a
  `network_id` envelope field, since the ledger's `NetworkID` field exists only
  above 1024) and `xrplbench:1:s:` (signed blob). One payload is one QR, max
  2,331 bytes at error correction M. The Data-to-Sign Request and Data to Sign
  need two new kinds in the same codec (for example `r:` and `d:`).
- `src/lib/two-device.ts` (FR-78, CAP-13): builds the unsigned transaction,
  checks it on the offline side (refuses another Account, unknown fields, Fee
  over the cap, missing LastLedgerSequence), verifies the returned signature
  before submit, and reports expiry as expired. Covers XRP payment, Regular Key
  and master key only. Window is about four to six minutes.
- `src/lib/xrpl/writes.ts` `submitAndClassify`: the online choke point
  (autofill, fee cap, master-key check, Signing Check, ledger read, sign,
  submit). The Transmit step (OS-FR-9) is the "submit and classify" half of it,
  split out so a scanned Signed Transaction enters at the same point.

## Why the Offline-builds route is the safer one

The amount and destination come from the trusted (offline) device; the online
device supplies only Sequence, Fee, the validated ledger index and the Network;
the offline device sets LastLedgerSequence itself (OS-FR-16). The
offline side must still cap the Fee and check the numbers, because a
compromised online device could inflate the Fee or pick the wrong Network. In
the Transmitter-builds route the offline screen is the only defence against a
changed destination, so every field must be shown in words.

## Network: agreed, not signed

An Offline Wallet has a Network but no Node. On Mainnet, Testnet and Devnet the
signed bytes carry no network (`NetworkID` must be omitted at 1024 or below), so
the same key signs identically on every network. The Network is agreed between
the devices: it travels in the request, Data to Sign and the signed envelope,
both screens show it, and the Transmitter sends only on it. That stops a
mistake. A compromised Transmitter can still send elsewhere if the Account and
Sequence match there and LastLedgerSequence allows it; Mainnet's much higher
ledger index makes Testnet-to-Mainnet replay need a Mainnet-sized
LastLedgerSequence. Accepted risk; the warning is OS-FR-23. Sources:
`fact-check.md` case 1.

## Regular Key and master key (research, 2026-11-07)

- xrpl.org: keep the master key offline, use a Regular Key day to day, test the
  Regular Key (AccountSet with no fields, check `SigningPubKey`) before turning
  the master key off; "no one can restore it for you".
  https://xrpl.org/docs/concepts/accounts/cryptographic-keys ,
  https://xrpl.org/docs/tutorials/how-tos/manage-account-settings/assign-a-regular-key-pair ,
  https://xrpl.org/docs/tutorials/how-tos/manage-account-settings/disable-master-key-pair ,
  https://xrpl.org/docs/tutorials/how-tos/manage-account-settings/change-or-remove-a-regular-key-pair
- Black holes: an arbitrary Regular Key address cannot be proved held; ACCOUNT_ZERO
  `rrrrrrrrrrrrrrrrrrrrrhoLvTp` and ACCOUNT_ONE `rrrrrrrrrrrrrrrrrrrrBZbvji`.
  https://xrpl.org/docs/concepts/accounts/blackholed-accounts
- Xaman and GemWallet allow any Regular Key address and master-key disable with
  a danger hint only; no app-side block found.
  https://help.xaman.app/app/getting-started-with-xumm/how-to-disable-the-master-key ,
  https://gemwallet.app/docs/api/gemwallet-api-reference
- Scam pattern: phishing site asked users to sign SetRegularKey to the
  attacker's address (2022).
  https://ripplenews24.com/xumm-support-warned-of-a-new-scam-trick/
