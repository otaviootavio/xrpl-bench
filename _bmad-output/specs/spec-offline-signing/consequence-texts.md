# Consequence texts and warnings (verbatim)

Copied mechanically from the PRD. Approved by the owner on 2026-11-07, written
in ASD-STE100. UX may lay these out; it never rewords them without a PRD change
(OS-FR-12). Bold marks a warning line.

## Texts A to E (OS-FR-12)

### Text A. Online wallet (create quiz)
- This device keeps the key and connects to the XRP Ledger.
- This device can show your balance and history.
- This device can sign and send transactions without help.
- The key is on a device that connects to the internet. Malware or a dangerous
  browser extension can find it.
- Use an online wallet for small amounts and for daily payments.

### Text B. Offline wallet (create quiz)
- This device keeps the key. It does not connect to the XRP Ledger.
- This device cannot show your balance or history.
- To send a transaction, you must have a second device with a Transmitter
  wallet.
- You move each transaction between the two devices with a QR code.
- The offline wallet does not connect to the network. Before you sign, make
  sure that the network on the screen is correct.
- Use an offline wallet for large amounts.
- **WARNING: The app cannot make your device offline.** You must disconnect it
  before you create this wallet. Turn off Wi-Fi, mobile data and Bluetooth. Do
  not connect the device again.
- **WARNING: Do not use a synced passkey for an offline wallet.** A synced
  passkey goes to the cloud. If the key comes from a synced passkey, the wallet
  is not offline.

### Text C. Change an online wallet to an offline wallet
- This wallet stops all connections to the XRP Ledger.
- This device does not show the balance or history of this wallet after the
  change.
- The node setting goes away. The network does not change.
- The address and the funds do not change.
- To send a transaction after the change, you must have a Transmitter wallet on
  a second device.
- **WARNING: This change does not make your key safe.** The key was on a device
  that connected to the internet. If malware found the key before the change,
  the malware still has it. The change cannot remove that risk.
- To get a key that was never online:
  1. Create a new offline wallet on a device that is disconnected.
  2. Move your funds to the new address, or set the new key as the Regular Key
     of this account.
  3. If you set a Regular Key, turn off the master key of this account. You
     must sign this with the old key.
- **WARNING: The app cannot make your device offline.** Disconnect the device
  before you sign with this wallet.

### Text D. Change an offline wallet to an online wallet
- This wallet connects to the XRP Ledger.
- The wallet keeps its network. You must select a node.
- This device shows the balance and history of this wallet.
- This wallet can sign and send transactions without a second device.
- Signed transactions that you did not send are still valid until they expire.
- **WARNING: The key will be on a device that connects to the internet.**
  Malware or a dangerous browser extension can find it. After this change, the
  key is not an offline key.
- **WARNING: You cannot undo this risk.** If you change the wallet back to
  offline later, the key is still a key that was online. For a large amount,
  keep this wallet offline.

### Text E. Import a seed into an offline wallet
- **WARNING: An offline wallet does not make an unsafe seed safe.** The app
  cannot know where the seed was before. If malware or another person found
  the seed, they can take the funds. Make sure that you made the seed on an
  offline device. Make sure that the seed was only on paper. If you are not
  sure, do not import the seed. Create a new offline wallet. Then move your
  funds to its new address.

("Create" and "import" are kept although they are not ASD-STE100 approved
verbs, because they are the app's own button names.)

## Key warnings W1 to W5 (OS-FR-21)

The user can continue after each. Each appears in its situation, before the
Signing Check.

- **W1. The key is not in this app.** "This app cannot sign with this key. Make
  sure that you hold the key in a different wallet."
- **W2. A black-hole address** (`rrrrrrrrrrrrrrrrrrrrrhoLvTp`,
  `rrrrrrrrrrrrrrrrrrrrBZbvji`). "Nobody holds the key for this address. If you
  turn off the master key, nobody can use this account again. The funds are
  lost. A delegate can still act for the account, and old offers and escrows
  can still run."
- **W3. A "set Regular Key" that this device did not build** (a QR from a
  Transmitter, or a transaction from a website). "This transaction gives control
  of your account to the key below. Sign it only if you hold that key. Scammers
  use this to take accounts."
- **W4. Before the master key is turned off.** The app offers "Test the Regular
  Key". If the Regular Key is a Wallet in this app, the test signs an AccountSet
  with no changes with that key and shows whether it was validated. If the key is
  elsewhere, the app tells the user to test it in that wallet. The test is
  offered, never required. Then: "After this, the master key cannot sign for
  this account. Only the Regular Key or a signer list can turn on the master
  key again."
- **W5. Replacing a Regular Key that is set.** "The old Regular Key stops
  working."

## One Seed on one Network (OS-FR-23)

"Do not use one seed on more than one network. A transaction signed for one network can be sent on another."

## Fixed short strings

| Where | Words | OS-FR |
|---|---|---|
| Offline Wallet card and settings | "Was online" (plus one sentence on why it matters) | OS-FR-7 |
| Offline review, before the Signing Check, large type | "You are signing for Mainnet" (the Wallet's Network) | OS-FR-16 |
| Data-to-Sign Request screen | "Data to sign needed" | OS-UJ-1 |
| Transmitter, window passed | "Expired. Nothing was sent." | OS-UJ-1 |
| Show-before-sending prompt | "Send it to the ledger?" | OS-FR-10 |
| Retry of a Same Build with a new Sequence | "This is a new payment" (after a warning that the earlier one may have been applied) | OS-FR-16 |
| Wallet settings | "Change to an offline wallet" / "Change to an online wallet" | OS-FR-5, OS-FR-6 |
| Create quiz step 1 | "Online wallet or offline wallet?" | OS-FR-2 |
| Transmitter Wallet | "Sync to an address" | OS-FR-4 |
| Create/import, optional step | "This key signs for another account" | OS-FR-20 |
| Before master key off | "Test the Regular Key" | OS-FR-21 W4 |
