# Issue map

Traceable IDs from the Impeccable audit of `origin/dev` e07fd9a. Slice order: S1→S5.

| # | Sev | Issue | Where | CAP / slice |
|---|---|---|---|---|
| 1 | P1 | Task flows in confirm-sized dialog; primary action 300–1000px below fold at 320×568 | SettingsTab.tsx:332, EditChecksDialog.tsx:80, TwoDeviceSign.tsx:62, ControlWalletDialog.tsx:48 | CAP-2 / S2 |
| 2 | P1 | Two-device role buttons overflow sideways at 320/375 | TwoDeviceSign.tsx:77-85 | CAP-2 / S2 |
| 3 | P1 | On-screen keyboard can hide title, close, submit (iOS/Chrome unverified) | dialog.tsx | CAP-1 / S1 |
| 4 | P1 | 13px inputs/buttons zoom iOS on focus; use 16px on coarse pointers, never disable zoom | input.tsx, button.tsx:76 | CAP-3 / S3 |
| 5 | P2 | Focus falls to `<body>` after 9 of 11 dialogs; only Add wallet and Add trust line restore it | all dialogs | CAP-4 / S4 |
| 6 | P2 | Touch targets <44px: close 28, buttons 36, radios 13 | dialog.tsx, button.tsx | CAP-3 / S3 |
| 7 | P2 | Back leaves the app with a dialog open | all dialogs | CAP-4 / S4 |
| 8 | P2 | No scroll cue in dialog scroll areas on phones | dialog.tsx | CAP-1 / S1 |
| 9 | P2 | Gutter tap (16px) closes working dialogs; Edit checks and Add wallet lose state | dialog.tsx | CAP-4 / S4 |
| 10 | P2 | At 200% text zoom ~3 screens of scrolling to Save (Edit checks, Add wallet, Control wallet) | those dialogs | CAP-2 / S2 |
| 11 | P3 | No `dvh` or safe-area handling | dialog.tsx | CAP-1 / S1 |
| 12 | P3 | PIN prompt stacks over still-open confirm | PinPromptDialog.tsx | CAP-1 / S1 |
| 13 | P3 | 11px field labels in dialogs | dialogs | CAP-3 / S3 |
| 14 | P1 | Master-key-off: danger outline confirm, no typed acknowledgement on Mainnet; needs destructive style + alert plate with Regular Key address | MasterKeyControl.tsx:134 | CAP-5 / S5 |
| 15 | P1 | Create-wallet: 8 questions, ~20 radios, no summary | CreateWalletFlow | CAP-6 / S5 |
| 16 | P2 | New screens ignore panel vocabulary (native radios, raw select, plain h2, sentence-case legends) | ControlWalletDialog.tsx:192, check-controls.tsx:57-63 | CAP-7 / S5 |
| 17 | P2 | Settings wallet row: 9 equal buttons; "Use on Mainnet" one click; "Remove all wallets…" 322px at 320px | SettingsTab.tsx | CAP-7 / S5 |
| 18 | P3 | Status legends are whole sentences in capitals | MasterKeyControl.tsx:14-16 | CAP-7 / S5 |
| 19 | P3 | `:focus` styling; check skip-link exception | select.tsx:79, Main.tsx:97 | CAP-8 / S5 |

Verified in repo: DESIGN.md:444 exempts only skip-link *landing targets*; `Main.tsx:97` skip link reveals itself with `focus:` classes; `select.tsx:79` uses `focus:bg-accent`. `docs/agents/ui-and-design-system.md:46` bans styling `:focus`.
