# Quiz steps

The order is FR-60's. Pre-selections are FR-60's and are not restated here. Each step reads its options and their reasons from `describeOptions`.

| # | Step | Asks | Shown when | Notes |
|---|---|---|---|---|
| 1 | Label and Network | Label; Network | always | Network first: it decides later legality (FR-65). Label validation text stays here. |
| 2 | Recommended setup | nothing: a read-only list | always, every Network | Primary **Create wallet**, secondary **Walk me through it**. On Mainnet names the forced rules in text. |
| 3 | Node | Built-in Nodes or a Node you choose, with its test | walk only | A failed test stays on this step (CAP-7). |
| 4 | Seed Method | Stored Seed or Passkey-Derived Seed; the Passkey choice and the app-domain warning when Passkey-Derived | walk, Generate only | Skipped in Import: the Seed fixes it. |
| 5 | Signature type | Ed25519 or secp256k1 | walk, Generate only | Skipped in Import: the Seed fixes it. |
| 6 | Open Check and auto-lock | Open Check; auto-lock minutes | walk | Mainnet floor: an Open Check is required, auto-lock at least 1 minute. Assumption: paired. |
| 7 | Signing Check | Standard, passkey only, or App PIN only | walk | Options the Network or device cannot support stay visible with the reason. |
| R | Review | nothing: every answer with **Change** | end of the walk | **Create wallet** here equals step 2's. |

The step counter counts the steps the user will actually see for that mode and Network: Import omits steps 4 and 5.

After **Create wallet**, the flow continues exactly as today: PIN entry where an App PIN is chosen, the written-Seed confirmation, the Seed backup, then done. None of that is part of the quiz.
