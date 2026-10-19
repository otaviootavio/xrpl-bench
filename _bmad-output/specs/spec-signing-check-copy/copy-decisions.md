# Copy decisions

Issue IDs 8a–8g and the wording are decided (source: `docs/sprints/signing-check-copy-findings.md`). Locations were re-checked against `12d3c49` plus the uncommitted `fix/dialogs-mobile` tree.

| ID | Sev | Location | Before | After |
|---|---|---|---|---|
| 8a | HIGH | `CreateWalletFlow.tsx:642`, `EditChecksDialog.tsx:442` | Signs once the wallet is open, with no further check. | Signs without asking again once the wallet is open. |
| 8b | MEDIUM | `CreateWalletFlow.tsx:653` | A passkey prompt for every signature. | Asks for your passkey on every signature. |
| 8c | MEDIUM | `CreateWalletFlow.tsx:664`, `EditChecksDialog.tsx:452` | The App PIN for every signature. | Asks for your App PIN on every signature. |
| 8d | MEDIUM | `EditChecksDialog.tsx:461` | A passkey prompt for every signature. Named after this wallet. | Asks for your passkey on every signature. The passkey is named after this wallet. |
| 8e | MEDIUM | `SettingsTab.tsx:60` | This wallet has no further check: confirming here shows the seed. | After you confirm, the Seed is shown with no further prompt. |
| 8f | LOW | `EditChecksDialog.tsx:460` | A new passkey (label, when the current Signing Check is a passkey) | Passkey only: a new passkey |
| 8g | LOW | `CreateWalletFlow.tsx:618`, `EditChecksDialog.tsx:415` | No Open Check (no detail) | detail: Opens without asking. Testnet and Devnet only. Passed only when `state.available`; unavailable shows its policy reason alone. |
| 8h | LOW | `CreateWalletFlow.tsx:584`, `EditChecksDialog.tsx:403` | Named after this wallet. | The passkey is named after this wallet. |
| 8i | LOW | `EditChecksDialog.tsx:402` | A new passkey (Open Check label, when the current Open Check is a passkey) | Passkey: a new passkey |

## Tests that name the old text

- `settings-reveal.test.tsx:92` matches `/no further check/` (8e).
- `edit-checks-dialog.test.tsx:114` matches `/A new passkey/` (8f).
- `No Open Check` radio lookups (`edit-checks-dialog.test.tsx:104,106,123`, `create-wallet-flow.test.tsx:186,201,202,253,255,297,644`) are expected to pass: `Choice` puts `detail` in `aria-describedby`, not the name.
- `edit-checks-dialog.test.tsx:114` also names `/A new passkey/`; 8i changes the Open Check label to "Passkey: a new passkey", so check whether that lookup targets the Open Check or the Signing Check radio.
- No test asserts the old detail strings of 8a–8d.

## Evidence for 8g

`Unlock.tsx:27` states a lock with no Open Check is Testnet and Devnet only. `edit-checks-dialog.test.tsx:104` shows the option `aria-disabled` on Mainnet with a policy reason.
