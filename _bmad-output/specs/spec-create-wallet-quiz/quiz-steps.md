# Quiz steps

The order is FR-60's. Pre-selections are FR-60's and are not restated here. Each step reads its options and their reasons from `describeOptions`. There is no shortcut step (decided 2026-10-30).

| # | Step | Asks | Shown when | Notes |
|---|---|---|---|---|
| 1 | Create or Import, Label, Network | Create a new Wallet or import one; Label; Network (Import: the Seed field) | always | Network first: it decides later legality (FR-65). Network and the path are locked once the user leaves this step: later steps and the review show Network as text only. Changing either here resets every later answer to its pre-selection, with a polite status line (CAP-2, CAP-6). |
| 2 | Node | Built-in Nodes or a Node you choose, with its test | always | A failed test stays on this step (CAP-7). |
| 3 | Seed Method | Stored Seed or Passkey-Derived Seed; the Passkey choice and the app-domain warning when Passkey-Derived | Create only | Skipped in Import: the Seed fixes it. |
| 4 | Signature type | Ed25519 or secp256k1 | Create only | Skipped in Import: the Seed fixes it. |
| 5 | Authentication to open the wallet, and auto-lock | the Open Check; auto-lock minutes | always | On Mainnet: an Open Check is required, auto-lock at least 1 minute, said in text. Assumption: paired. |
| 6 | Authentication to sign a transaction | Nothing is asked for signing; passkey only; App PIN only | always | Options the Network or device cannot support stay visible with the reason. |
| R | Review | one "Your answers" plate: every answer with **Change** (a row with no Change, Network, shows "Locked" and its reason as text), and the create-consequence line last in the same plate; then the App PIN plate last where needed, directly above the footer | end of the walk | **Create wallet** (**Import wallet**) is here. Plate styling, not a dark well. |

The step counter counts the steps the user will actually see: Create is 7 steps (6 plus the review), Import is 5.

After **Create wallet**, the flow continues exactly as today: PIN entry where an App PIN is chosen, the written-Seed confirmation, the Seed backup, then done. None of that is part of the quiz.
