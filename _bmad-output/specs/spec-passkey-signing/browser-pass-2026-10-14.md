# Browser passes, stories 1–11 (2026-10-14)

**Build under test:** `775ade7` on `feat/passkey-signing-s1` (working tree clean; no temporary code switches). The previous build for the migration pass was `03cb41f` (`dev`).
**How driven:** a Playwright driver (`playwright-core`, Chromium 1148, headless) with a CDP virtual authenticator (ctap2, internal, resident key, UV, automatic presence, PRF) against `bun run dev --port 5176`. Throwaway Testnet and Devnet wallets only, funded through the in-app faucet; no Mainnet wallet was created or confirmed. The screenshots (180 files) and driver scripts were in the job scratchpad and are not kept in the repo; the cited ones were opened by the driver's author.
**Widths and themes:** 320, 390 and 1280 px, light and dark, for the layout pass only. The creation, edit, control and migration passes were run at 1280 px, light.

## Result by story

| Story | Pass | Result |
|---|---|---|
| 1 Per-Wallet locks, migration | A vault made by `03cb41f` (with and without a registered passkey), opened by this build | Met: same address, balance readable, ciphertext byte-identical, `lock:legacy` added, Open Check reads `either` / `pin`, Standard, a payment validates, "Use on Devnet" adds a view over the same Seed. Not run: rollback, the not-activated update path. |
| 2 Network and Node | Header, Settings Node section, Devnet Wallet, Add dialog | Met: Devnet notice on Balances, Send and Settings; plate "Not stable"; a Devnet Node on a Testnet Wallet is refused naming both network ids and stores nothing; a custom Testnet Node is used; "Use built-in Nodes" restores; Add dialog pre-selects Testnet. **Defect 7** (picker trigger clips the network suffix). Not run: Mainnet "Real funds" plate, custom-Node failover. |
| 4 Open Check, auto-lock, locked view | Locked passkey-lock Wallet; `none` lock | Met: name only, 0 websocket frames carrying its address, no Lock button or "Lock now" for a `none` lock. |
| 5 Creation, check policy | Each Signing Check, Open Check none / PIN / passkey, `aria-disabled` reasons, real payments | Met: shapes as specified, Signing Check asked after the confirm step (one assertion for passkey, PIN dialog after "Confirm and send", none for Standard), wrong PIN shows tries remaining, reasons visible as text. Capability was simulated (this Chromium has no `getClientCapabilities`). |
| 6 Passkey-Derived | Testnet, new and existing passkey | Met: domain warning first, ordinal shown once with the kind statement, send validated. On `localhost` Mainnet Passkey-Derived is not disabled, as the origin rule says (only `*.b-cdn.net`); the `b-cdn.net` disabled state was not run. |
| 7 Written Seed, reveal | Mainnet + passkey-only reached the confirm step and stopped; Reveal for every check kind | Met: three groups by character range, a wrong group keeps the step and clears the answers, Cancel writes nothing; Reveal asks the Wallet's check after the confirm step; no Seed text in local/session storage, URL or IndexedDB. Not run: confirming a Mainnet Wallet (deliberately). |
| 8 Edit checks | PIN → passkey Open Check plus a passkey Signing Check | Met: current check asked first, address unchanged, new lock, older-version warning, the Wallet then opens by passkey and signs. Escape during the write did not close the dialog, but the write was only slowed by delaying `credentials.create`. |
| 9 Controlling Wallet | Set, replace, real payment through the controlled view | Met, except **defect 1** (a former Regular Key cannot be set again). |
| 10 Master key | Off with the exact-consequence confirm, then on from the Regular Key view | Met; offers `aria-disabled` with reasons in each wrong state. **Defect 2** (send with the master key off). |
| 11 Two-device | Online/offline contexts over paste, expiry, the three new offline refusals | Met, 320 px glance clean. The camera path cannot run headless and was not run. |

## Defects found

**Fixed after the pass in `74ab34d`:** 1, 2, 4 and 5, each with a test (the fixes were not re-run in a browser). Open: 3, 6, 7, 8, 9, 10.

1. **A former Regular Key cannot be set again** (medium-high). After replacing B with C, B's stale view of the Account stays ("Not controlled"), and `eligibleTargets` / the guard in `setRegularKey` (`src/lib/control.ts`) exclude any Seed that already has a view of the Account, whatever the ledger says. Workaround: remove the stale view in Settings. Confirmed by reading the code.
2. **Send from an Account whose master key is off ends as "expired before validating"** (medium). No warning on Send; the cause is never named and retry cannot work. The node's result code was not read, so "master key disabled" is inferred. Fixed by a choke-point guard that reads the flag before the Signing Check.
3. **Toasts never expire and outlive their Wallet** (medium-low): "Cancelled. The wallet stays locked.", "Incorrect PIN…" and "expired" stay for the whole session.
4. **Control result loses the Wallet's name** (low): "Done.  now operates this account." The label comes from `target`, which has left the eligible list by then (`ControlWalletDialog.tsx:233`). Confirmed by reading the code.
5. **Wrong copy when removing a controlled view** (low): it says the Seed stays because the Wallet is set up "on another network"; the other view is the same network, a different Account.
6. **The Wallet picker cannot tell apart** a Wallet and its controlled view, nor two locked Wallets with the same name (low).
7. **The picker trigger clips the network suffix** (low): "· Testnet" hidden at about 160 px, "My Wallet · Devnet" clipped at 320 px; the plate beside it still names the network.
8. **320 px Settings** (low): "Remove all wallets from this device" overflows its card; the custom Node input shrinks to about 16 characters.
9. **Per-row Settings buttons share one accessible name** (low): eight "Reveal seed" buttons are indistinguishable.
10. **Console noise** (low): "Select is changing from controlled to uncontrolled" in the creation dialog.

## Not run

Camera scan (no `BarcodeDetector` headless); Mainnet "Real funds" plate and the `b-cdn.net` rule; any Mainnet Wallet; rollback to the previous build; the tampered-return, wrong-network and wrong-Account QR cases; the Devnet explorer links.
