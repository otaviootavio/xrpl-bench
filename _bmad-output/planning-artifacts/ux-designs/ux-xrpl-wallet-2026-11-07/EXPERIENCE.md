---
name: XRPL Bench — Offline Signing, Experience Spine
status: final
updated: 2026-11-07
sources:
  - _bmad-output/specs/spec-offline-signing/SPEC.md               # the contract; CAP-n
  - _bmad-output/specs/spec-offline-signing/consequence-texts.md  # approved words, verbatim
  - _bmad-output/specs/spec-offline-signing/route-checks.md       # every refuse / warn / keep rule
  - _bmad-output/specs/spec-offline-signing/glossary.md
  - _bmad-output/specs/spec-offline-signing/stories.yaml
  - _bmad-output/planning-artifacts/prds/prd-offline-signing-2026-11-07/prd.md   # OS-FR-n, OS-UJ-n
  - .memlog.md                                                    # owner decisions for this spine
inherits:
  - DESIGN.md (this folder, the visual delta)
  - DESIGN.md (repo root)
  - _bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md   # chooser; its "Configure" screen is superseded by Local settings (Epic 23)
---

# Offline Signing — Experience Spine

> Delta spine. It describes only what the feature adds or changes. The rules
> are in the spec. This file says where each rule appears, in what order and
> with which words. OS-FR ids are the requirement references and CAP ids are
> the spec's. Marks: `[ASSUMPTION]` is a design guess to be confirmed. `P-n`
> is a proposed string that needs owner approval (§Voice and Tone).
> Mockups in `mockups/` illustrate this spine. The spine wins on conflict.

## Foundation

The foundation is the same as the inherited spine: a phone-first PWA (320px
floor), React 19, Tailwind v4, shadcn in the repo, no backend, and one location
scheme in `src/lib/route.ts`. What is new is that **one operator now holds two
devices**. One is an offline phone with an Offline Wallet. The other is an
online phone or computer with a Transmitter Wallet (OS-UJ-1). They talk only by
QR: one payload per QR, one transaction per round, no relay.

Binding rules, inherited and not restated: the CLAUDE.md non-negotiables,
`docs/decisions.md` §3/§4, the fee cap (§14), the `unknown` outcome (§16) and
FR-58/FR-59. Three rules shape this spine directly:

1. **An Offline Wallet issues no ledger read.** Nothing account-scoped that
   reads mounts for it. Every place an online screen shows a reading shows
   P-1 instead (OS-FR-13).
2. **A failed read is never empty, current or safe.** On a Transmitter, a
   failed read produces no Data to Sign (OS-FR-15). A failed key-state read
   is "Unknown" (OS-FR-21).
3. **Approved words are laid out, never reworded** (OS-FR-12). This spine
   names them by id (Text A–E, W1–W5, OS-FR-23, and the fixed strings in
   `consequence-texts.md`). Builds copy them from that file, character for
   character.

Vocabulary is the glossary's, with no synonyms: Online Wallet, Offline Wallet,
Transmitter Wallet, Sync to an address, Signs for, Was-online mark, Build, Same
Build, Data-to-Sign Request, Data to Sign, Unsigned Transaction, Signed
Transaction, Transmit step.

## Information Architecture

### Surfaces

| Surface | Reached from | Holds | OS-FR |
|---|---|---|---|
| **Chooser** (changed) | Launch; Wallets key | Cards for all three kinds; **Add wallet** and **Add Transmitter wallet** (P-2) keys | OS-FR-1, OS-FR-3 |
| **Create/Import quiz, step 1** (changed) | Add wallet | Create or Import → **"Online wallet or offline wallet?"** with Text A/B (and Text E on Import + Offline) → Label → Network (→ Seed on Import) | OS-FR-2, OS-FR-7, OS-FR-8 |
| **Quiz walk** (changed) | Step 1 Next | Node (Online only), Seed Method, Signature type, Open Check + auto-lock, Signing Check, **"This key signs for another account"** (optional), Review with the OS-FR-23 warning | OS-FR-2, OS-FR-20, OS-FR-23 |
| **Add Transmitter quiz** (new) | Add Transmitter wallet | Label + Network → Node → Open Check + auto-lock → Address (optional, "Sync to an address") → Review | OS-FR-3, OS-FR-4 |
| **Offline Wallet shell** (new tab set) | Open on an Offline card | Tabs: **Send · Tokens · Keys · Local settings** | OS-FR-13, OS-FR-21 |
| **Transmitter Wallet shell** (new tab set) | Open on a Transmitter card | Unsynced: **Transmit · Local settings**. Synced: **Transmit · Balances · History · Tokens · Send · Local settings** | OS-FR-3, OS-FR-4, OS-FR-17, OS-FR-22 |
| **Online Wallet shell** | Unchanged | The six tabs of today | — |
| **Offline round screens** (new task screens) | Offline Send / Tokens / Keys review; Offline Send "Sign a transaction from your Transmitter" (P-3) | Request QR + Data-to-Sign scan → signing review → signed QR + kept Build; retry screens | OS-FR-11, OS-FR-13–16, OS-FR-18 |
| **Transmit tab** (new) | Transmitter shell | One scan plate for both kinds of incoming QR: a Data-to-Sign Request (answered) or a Signed Transaction (transmitted) | OS-FR-9, OS-FR-15 |
| **Transmitter answer screen** (new) | Transmit tab, scanned request | Pre-flight results, key state + W4/W5 for a key change, Data to Sign QR | OS-FR-15, OS-FR-21 |
| **Transmit step screen** (new, shared) | Transmit tab, scanned signed QR; Online sign | Checks, optional "Show the signed transaction before sending" view, outcome | OS-FR-9, OS-FR-10 |
| **Unsigned Transaction screen** (new) | Synced Transmitter Send / Tokens / Keys plate, on its review | Unsigned QR + signed-QR scan → Transmit step | OS-FR-17 |
| **Local settings** (changed, per kind) | Local settings tab | See next table | OS-FR-5–7, OS-FR-10, OS-FR-19, OS-FR-20 |
| **Change kind screens** (new task screens) | Local settings, "Wallet kind" plate | Text C + confirm; Text D + Node + irreversible confirm | OS-FR-5, OS-FR-6 |

### Tabs by kind (owner, 2026-11-07)

| Kind | Tabs, in order | Why |
|---|---|---|
| Online | Balances · Send · Receive · History · Tokens · Local settings | Unchanged |
| Offline | Send · Tokens · Keys · Local settings | No Balances, History or Receive: each is a read. Keys is a tab because a key change is a Build with a QR round, like Send. |
| Transmitter, unsynced | Transmit · Local settings | It can transmit and answer requests (OS-FR-4) and has no Account to show. |
| Transmitter, Synced | Transmit · Balances · History · Tokens · Send · Local settings | Read-only Account view plus the Transmitter-builds route. Send, Tokens and the Keys plate end in an Unsigned QR, never in a signature. |

The tab row keeps its primitive (two rows of three below `sm`). Four tabs form
one row of four below `sm`, and two tabs one row of two. When a Transmitter is
Synced or unsynced, the tab set changes on the next render. If the selected
tab disappears, focus moves to Transmit.

### Local settings plates, per kind (fixed order)

| Plate | Online | Offline | Transmitter | OS-FR |
|---|---|---|---|---|
| This wallet (address or "No address yet", Signature type, Seed Method) | ✓ | ✓ | ✓ (no Seed rows) | — |
| **Wallet kind** (kind stamp, Was-online stamp + P-4, change key) | ✓ "Change to an offline wallet" | ✓ "Change to an online wallet" | ✓ no change key `[ASSUMPTION]` | OS-FR-5–7 |
| **Synced address** ("Sync to an address", change, remove) | — | — | ✓ | OS-FR-4 |
| Name, Address Book | ✓ | ✓ | ✓ | — |
| Checks | ✓ | ✓ | ✓ (Open Check + auto-lock only) | OS-FR-3 |
| Seed | ✓ | ✓ | — | — |
| **Signs for** (address, change) | ✓ | ✓ | — | OS-FR-20 |
| **Keys** (Regular Key, master key) | ✓ replaces "Operating another account" | — (Keys tab) | ✓ Synced only, Builds an Unsigned QR | OS-FR-19, OS-FR-21 |
| **Signed by this wallet** (the signed list, read-only) | — | ✓ | — | OS-FR-16 |
| Node | ✓ | — | ✓ | OS-FR-2, OS-FR-3 |
| **Before sending** ("Show the signed transaction before sending", switch, off) | ✓ | — | ✓ | OS-FR-10 |
| Remove this wallet | ✓ | ✓ | ✓ | — |

Removed from every kind: **Operating another account** and **Two-device
signing** (OS-FR-19, story 12). There is no migration. A Wallet that operates
another account today loses the plate, and nothing replaces it in place.

### Chooser card, per kind (OS-FR-1, OS-FR-20)

The head is unchanged: the name, then a lamp with "Open" or "Locked". The
Network row now starts with the kind stamp.

| Kind | Network row | Address row | Extra lines |
|---|---|---|---|
| Online | `[Online] MAINNET [Real funds]` | address link | "Signs for r…" when it differs from the key address |
| Offline | `[Offline] [Was online] MAINNET [Real funds]` | address, plain text, **not a link**, because the explorer is a read on another device's job `[ASSUMPTION]` | P-4 under the row when marked; "Signs for r…" when different |
| Transmitter | `[Transmitter] MAINNET [Real funds]` | Synced address link, or "Not synced" (P-5) | — |

A locked card still shows its name, kind and Network. The kind and Network are
record fields, not Account reads, so AD-26 holds. `[ASSUMPTION]` The
2026-10-19 rule "a locked card shows its name only" was already relaxed for the
Network row in Epic 22. The kind joins that row.

## Voice and Tone

The voice is ASD-STE100, matching the approved texts: short sentences, one
instruction each, the ledger's own words (Sequence, LastLedgerSequence, Fee,
ledger index) without explanation. Each screen says what happened, what did not
happen and what the user can do. "Nothing was sent" and "Nothing was signed"
are stated every time they are true.

### Approved strings: where each one goes

These are never retyped in a build. Each is imported from one module whose text
is copied from `consequence-texts.md`, and a test compares the two.

| Id | Surface, position | Acknowledge? |
|---|---|---|
| "Online wallet or offline wallet?" | Quiz step 1, the radio group legend, after Create or Import | — |
| Text A | Under the kind radios when Online is chosen | No |
| Text B | Under the kind radios when Offline is chosen. Six plain lines as a list, then each WARNING as its own caution Alert | **Yes, each of the two warnings**, one checkbox each (P-6). Next stays `aria-disabled` with P-7 until both are checked |
| Text B, second WARNING (synced passkey) | Again on the passkey kind statement after the passkey ceremony, when the Wallet is Offline and the passkey is synced or unknown (OS-FR-8) | **Yes** (P-6); Finish waits on it |
| Text E | Quiz step 1 when Import + Offline are both chosen, above the Seed field | **Yes** (P-6) |
| OS-FR-23 | Review step, caution Alert above the final Create/Import key, for every kind that holds a Seed (Online and Offline, create and import) | No, it is shown before the Seed is saved |
| Text C | "Change to an offline wallet" screen, then its steps 1–3 again on the result | Confirm key only |
| Text D | "Change to an online wallet" screen | Irreversible-class confirm |
| W1 | Regular Key Build: the new key is not a Wallet on this device. Also offline signing review (Transmitter-builds) | No |
| W2 | Regular Key Build with a black-hole address; master key off when the Regular Key is a black-hole address | No |
| W3 | Offline signing review of a SetRegularKey this device did not build (Unsigned QR) | No |
| W4 | Master key off: the "Test the Regular Key" key first, then the W4 sentence. On the Offline Build and on the Transmitter answer screen | No; the test is offered, never required |
| W5 | Regular Key Build when one is set. On the Offline Build and on the Transmitter answer screen | No |
| "Was online" | Card stamp, Wallet kind plate stamp; always with P-4 | — |
| "You are signing for Mainnet" | Signing-network well, offline signing review, both routes | — |
| "Data to sign needed" | Title of the request QR plate | — |
| "Expired. Nothing was sent." | Transmit step outcome when the window has passed | — |
| "Send it to the ledger?" | Show-before-sending screen, the question above the two keys | — |
| "This is a new payment" | Retry case (a): the key that signs with the received, higher Sequence | — |
| "Change to an offline wallet" / "Change to an online wallet" | Wallet kind plate key, task screen title, confirm key | — |
| "Sync to an address" | Synced address plate key; Add Transmitter quiz step title | — |
| "This key signs for another account" | Quiz walk optional step title and its checkbox label; Signs for plate | — |
| "Test the Regular Key" | Master key off, before W4's sentence | — |

### Proposed strings (owner approval needed; ASD-STE100)

The spec leaves these to UX (`route-checks.md`, "Exact words are for UX"). They
are drafts until the owner approves them, and a build must not ship one
unapproved.

| Id | Where | Words |
|---|---|---|
| P-1 | Offline Wallet, every place an online screen shows a reading | "Comes from the Transmitter." |
| P-2 | Chooser key | "Add Transmitter wallet" |
| P-3 | Offline Send tab, top plate title and key | "Sign a transaction from your Transmitter" |
| P-4 | Beside "Was online" | "The key of this wallet was on a device that connected to the internet." |
| P-5 | Transmitter card / This wallet plate, unsynced | "Not synced" |
| P-6 | Acknowledge checkbox under a warning | "I read this warning." |
| P-7 | Next blocked reason | "Read and tick each warning to continue." |
| P-8 | Same address as Offline and Transmitter (Add Transmitter, Sync) | "WARNING: An offline wallet on this device has this address. The offline key is then on a device that connects to the internet." |
| P-9 | Request QR plate line | "Scan this code with the Transmitter wallet on your online device." |
| P-10 | Request QR plate, change key, and its line | Key "Change the transaction". Line: "If you change the transaction, the request starts again." |
| P-11 | Data-to-Sign scan plate line | "Scan the data to sign from the Transmitter wallet." |
| P-12 | Signed QR plate lines (OS-FR-11) | "This transaction is not sent. Scan this code with the Transmitter wallet to send it." / "It is valid until ledger {n}, about 10 minutes after {time}." |
| P-13 | Signing review scale mark | "Window: about 10 minutes" (Offline-builds) / "Window: {n} ledgers" (Transmitter-builds) |
| P-14 | Highest-seen ledger warning | "The ledger index is lower than an index this wallet saw before." / "The ledger index is higher than the time since the last index allows." Then: "Make sure that the Transmitter is correct before you sign." |
| P-15 | Window longer than usual (Transmitter-builds) | "This transaction stays valid for longer than usual: {n} ledgers. Anyone who has it can send it until then." |
| P-16 | Refusal heading on the offline device | "Not signed." followed by the reason, P-17 |
| P-17 | Refusal reasons, offline | Request ID or Build hash: "This data is for a different request." · Malformed: "This data has a value that is not correct or is missing." · Fee: "The Fee is more than the fee limit." · Network: "This is for {Network}. This wallet is for {Network}." · Account: "This transaction is for {address}. This wallet signs for {address}." · Unknown type or field: "This app cannot show {name} in words." · Pre-set signature: "This transaction already has a signature." · Partial payment: "This is a partial payment. This app does not sign partial payments." |
| P-18 | Kept Build plate | Title "Kept transaction". Line "This device keeps the transaction until you mark the result. A lock erases it." Keys: "The result is known" · "Start the request again" · "Cancel this transaction" |
| P-19 | Same Build notice at review | "You signed the same transaction before." + the earlier-signing record |
| P-20 | Retry case (a): higher Sequence received | "The earlier transaction probably went through. Its Sequence is used. Check the history on the Transmitter before you pay again." Keys: "Check first" · "This is a new payment" |
| P-21 | Retry case (b): window of the earlier one passed | "The earlier transaction cannot go through now. This signing is the only one." |
| P-22 | Retry case (c): earlier one still valid | "This uses the Sequence of the earlier transaction. Only one of the two can go through." |
| P-23 | Transmit step, `tefPAST_SEQ` on a same-Sequence retry | Outcome legend "Probably sent before". Line "The earlier transaction probably went through. Check before you pay again." Never "Failed". |
| P-24 | Show-before-sending, decline and copy warning (OS-FR-10) | "WARNING: This signed transaction stays valid until ledger {n}. Anyone who has it can send it until then." Decline adds "Nothing was sent." |
| P-25 | Transmit step check list | "Signature: correct" · "Account: {address}, as expected" · "Network: {Network}" · "Window: open until ledger {n}" |
| P-26 | Transmit step refusals | "Not sent." then: "The signature is not correct." · "This transaction is for {Network}. This wallet sends on {Network}." · "This transaction is signed by {address}. The expected account is {address}." · "This is a partial payment. This app does not send partial payments." (Expiry uses the fixed "Expired. Nothing was sent.") |
| P-27 | Transmit step, no expected Account (unsynced, not an answered request) | "Make sure that this is your account: {address}." Key: "This is my account. Send" (commit) |
| P-28 | Transmitter answer screen, failed read | "Could not read the ledger. No data to sign was made." Key "Read again" |
| P-29 | Key state row, failed read | "Unknown. Could not read." |
| P-30 | Regular Key target is a Wallet here | "This key is the wallet {name} on this device." |
| P-31 | Ledger refusals in words (OS-FR-21) | `temBAD_REGKEY`: "The Regular Key cannot be the address of the account." · `tecNO_ALTERNATIVE_KEY`: "The ledger needs a Regular Key or a signer list first." · `tecNEED_MASTER_KEY`: "Only the master key can turn off the master key." |
| P-32 | Delegates plate | "WARNING: A delegate can send transactions for this account." Empty: "None." Failed read: P-29 |
| P-33 | Unsigned QR plate line (Transmitter-builds) | "Scan this code with the offline wallet. Then scan the signed code from it." |
| P-34 | Offline refuse key, and its result | Key "Do not sign". Result: "Nothing was signed." |
| P-35 | Change kind result, Offline → Online refused | "Another wallet on this device has this address on {Network}." |
| P-36 | Scan plate, wrong payload kind | "This is a {kind}. This screen needs a {kind}." Transmit tab, Unsigned scanned: "Scan this with the offline wallet, not here." |
| P-37 | Offline review key | "Show the request" |
| P-38 | Synced Transmitter review key (Transmitter-builds) | "Make the unsigned transaction" |
| P-39 | Typed confirm, Change to an online wallet (Mainnet) | Type “change to online” to confirm (same pattern as today's “turn off”) |
| P-40 | Signs-for step, under the address | "This key must be the Regular Key of that account." |
| P-41 | Add Transmitter, Sync step | "Optional. You can sync later in Local settings." Key "Skip this step" |
| P-42 | Transmit tab, scanner line | "Scan a code from your offline wallet: a request for data to sign, or a signed transaction." |
| P-43 | Change to offline, result | "This wallet is now an offline wallet. The node setting is gone. The network is {Network}." |
| P-44 | Before sending plate, description | "Off by default. Shows the hash, the fields and a copy key, then asks before it sends." |

## Component Patterns

Behavioural. The visual specs are in `DESIGN.md`.

| Component | Use | Behaviour |
|---|---|---|
| **Kind radios** | Quiz step 1 | Native radio group, legend "Online wallet or offline wallet?". **No default**: neither is checked on arrival, so the consequences are read before a choice. Choosing one shows its text in place below the group. Switching resets that text's acknowledgements. Network locks after step 1, as today. |
| **Consequence block** | Texts A–E | Plain lines are a list. Each WARNING is a caution Alert. Where acknowledgement is required, a checkbox (P-6) follows each warning Alert and the step's forward key is `aria-disabled` with P-7 in visible text until every box is ticked. Nothing is collapsed or behind a "more" key. |
| **QR hand-off plate** | Request, Data to Sign, Unsigned, Signed | Shows one payload. It names the payload in its title and the Network in its second row, and shows the scan count ("Scan 1 of 3"). Re-rendering for a changed payload replaces the image. A stale code is never shown under a new title (today's `QrCode` already guarantees this). No auto-advance: the device cannot know the other side scanned it. |
| **Scan plate** | Every receive | Camera key plus paste field (today's `QrScanner`). It accepts only the payload kinds this screen expects. Any other kind is answered with "This is a {kind}. This screen needs a {kind}." `[ASSUMPTION P-36]`, and the scanner stays ready. |
| **Transmit tab scanner** | Transmitter | One scanner. A Data-to-Sign Request opens the answer screen. A Signed Transaction opens the Transmit step. An Unsigned Transaction gets "Scan this with the offline wallet, not here." |
| **Read-placeholder** | Offline Send/Tokens/Keys | In the exact slot of the online reading: legend unchanged, value replaced by P-1 in body text. Never "0", "—", a skeleton, or a cached figure. |
| **Signing review** | Offline, both routes, before the Signing Check | Signing-network well ("You are signing for {Network}"), then the field list of the **complete** transaction (Account, Signs-for key, type, Destination, tag, Amount, Fee, Sequence, LastLedgerSequence, flags in words), then warnings, then keys **Sign** (default) and **Do not sign** (P-34). Sign starts the Wallet's Signing Check. |
| **Field list** | Signing review, Transmit step, show-before-sending | One row per field and flag, in words. `SendMax` reads "At most {amount} can leave your account". A risky row (route-checks.md list) carries its caution Alert directly under it. A refused field ends the list with the P-16/P-17 refusal, and the Sign key is not rendered, because there is nothing left to sign. |
| **Kept Build plate** | Offline, after signing | P-18. It stays on the Send/Tokens/Keys tab that made the Build while the Wallet is unlocked. "Start the request again" re-opens the request QR with a new request ID, using the same Build. |
| **Earlier-signing record** | Retry, Signed-by-this-wallet plate | Read-only. Holds no blob and no key. Survives a lock. |
| **Irreversible confirm** | Change to an online wallet; master key off | Today's master-key pattern: typed phrase on Mainnet (held key until typed), then the Signing Check. |
| **Commit key** | Transmit step only | See §State Patterns, "Transmit step". At most one per screen. |

## State Patterns

### Offline round (Offline-builds route), one device's view

| State | Offline screen | Leaves when |
|---|---|---|
| Building | The Send/Tokens/Keys form with read-placeholders | Review |
| Reviewed | Online-style review plate, any Same Build notice (P-19), key "Show the request" `[ASSUMPTION P-37]` | Show the request |
| **Request shown** | Request QR plate ("Data to sign needed", Scan 1 of 3, P-9, P-10) and the Data-to-Sign scan plate under it (Scan 2 of 3, P-11). The Build fields are read-only. | Data to Sign scanned; Change the transaction (back to Building with a new request ID) |
| Data refused | Refusal Alert (P-16/P-17) under the scan plate. The request QR stays. | Another scan |
| **Signing review** | Signing-network well, complete field list, P-13, P-14 when tripped, W1–W5 when they apply | Sign → Signing Check; Do not sign → Request shown |
| **Signed** | Signed QR plate (Scan 3 of 3, P-12) and the Kept Build plate (P-18). No Send key anywhere. | The result is known / Cancel → Building (empty); Start the request again → Request shown |
| Locked at any point | The kept Build and request ID are erased. On the next unlock the tab opens empty. The signed list stays. | — |

### Retry (OS-FR-16)

A Same Build is detected at **Reviewed**, by content hash, including after a
lock. The review shows P-19 and the record. When the Data to Sign arrives, one
of three things happens:

| Received vs earlier | Screen | Keys |
|---|---|---|
| (a) Sequence higher | Caution Alert P-20 + record; signs nothing yet | "Check first" (back to Request shown) · "This is a new payment" (to the signing review, received Sequence) |
| (b) Same Sequence, index past earlier LastLedgerSequence | Signing review with notice P-21 | Sign · Do not sign |
| (c) Same Sequence, index not past | Signing review with notice P-22. The earlier Sequence is used. | Sign · Do not sign |

In (c), "This is a new payment" is **not offered**. The received Sequence is the
earlier one, so a second Sequence is not available until the first resolves.
`[ASSUMPTION]` This reads route-checks.md's "new Sequence only after the
warning" as applying where a new Sequence exists.

### Transmitter answer (OS-FR-15)

| State | Screen |
|---|---|
| Reading | Plate "Checking {address} on {Network}" with today's reading treatment |
| Read failed | P-28. No QR. "Read again" |
| A check refuses | The online Send words for that check (destination, tag required, reserve, spendable, trust line, frozen line, fee cap). No QR |
| Key change | Key state plate: Regular Key, Master key (On / Off / P-29), Signer list. W5 if a Regular Key is set; W4 with "Test the Regular Key" if the request turns the master key off. Then the QR |
| Answered | Check results as a list (each "passed" in words), then Data to Sign QR plate (Scan 2 of 3), Network row |

### Transmit step (every kind, OS-FR-9, OS-FR-10)

| Situation | What the user does | Commit key |
|---|---|---|
| Online Wallet, setting off | Today's Send dialog, then sign and submit | Today's dialog confirm (unchanged) |
| Online Wallet, setting on | Today's dialog **with a default key** ("Sign"), then the show-before-sending screen | "Send" under "Send it to the ledger?" |
| Transmitter, scanned signed QR, setting off, expected Account known | Scan → checks (P-25) → sent. No extra press (OS-UJ-1). The scan is the deliberate act. | None |
| Transmitter, setting on | Scan → checks → show-before-sending screen | "Send" under "Send it to the ledger?" |
| Transmitter, no expected Account (unsynced, not an answered request) | Scan → checks → P-27 | "This is my account. Send" |

Show-before-sending screen: hash (data face, full), decoded field list, a
**Copy** key (copying shows P-24 inline and keeps it on screen), then "Send it
to the ledger?" with **Send** (commit) and **Do not send** (outline). Do not
send shows P-24 plus "Nothing was sent.", and the blob is dropped from memory.

Outcomes: validated, claimed, failed and unknown, worded as today. Expired is
"Expired. Nothing was sent." `tefPAST_SEQ` on a same-Sequence retry is P-23
(legend "Probably sent before", caution tone), never "Failed". A refusal is
P-26 under "Not sent.". A possibly-applied transaction is never offered a
resend key.

## Interaction Primitives

- **Scan, don't type.** Every hand-off between devices is a scan. The paste
  field is the fallback where there is no camera, never the main path.
  OS-SM-1: three scans and no field typed twice.
- **Scan count.** The Offline-builds route counts 1 to 3: the request (offline
  shows, Transmitter scans), the Data to Sign (Transmitter shows, offline
  scans) and the signed QR (offline shows, Transmitter scans). The
  Transmitter-builds route counts 1 to 2. Both devices show the same number
  for the same code.
- **No auto-advance on a shown QR.** A device that shows a code waits for the
  user, who presses nothing and moves to the other device. The next step on
  the showing device starts when it scans the answer.
- **Restart is explicit.** Changing a Build after the request is shown is one
  key (P-10), and it says the request starts again.
- **Focus.** A new task-screen state moves focus to its heading, as
  `QuizShell` does. A refusal Alert is `role="alert"` and focus stays on the
  scanner.
- **Lock is final.** Auto-lock during a round erases the Build. The unlock
  screen does not offer to restore it.

## Accessibility Floor

Everything in the inherited floor applies. In addition:

- The signing-network well's accessible name is the whole fixed string "You
  are signing for Mainnet". The two-line typesetting is visual only.
- Every QR image has a text alternative naming its payload and Network, for
  example "QR code: data to sign needed, Mainnet". The payload itself is not
  read out.
- Each acknowledgement checkbox is labelled by P-6 and described by its
  warning (`aria-describedby`), so a screen reader hears which warning it
  confirms.
- Kind and Was-online are words, never colour only. The tab sets differ by
  kind, so the visible h1 of each tab names it as today.
- An `aria-disabled` forward key always has its reason in visible text (P-7,
  or the refusal). No control is hidden to show that it is unavailable. The
  exceptions are by spec: an Offline Wallet has no Send key (OS-FR-11), and a
  Transmitter has nothing that signs (OS-FR-3).
- At 320px and 200% text, a QR plate keeps the code at its drawn size and the
  lines wrap beneath it.

## Key Flows

### Flow 1 — Making an offline savings wallet (Otavio, old phone on the desk, radios off)

1. The chooser shows **Add wallet**. He presses it.
2. Step 1: Create. "Online wallet or offline wallet?" Neither is chosen. He
   picks Offline. Text B appears in place: six lines, then two caution Alerts.
3. Next is `aria-disabled` with P-7. He ticks P-6 under each warning.
4. Label "Savings". Network: Mainnet. No Node question follows.
5. The walk asks Seed Method (Stored Seed), Signature type, Open Check with
   auto-lock and Signing Check, all with the Mainnet safeguards as online. The
   written-Seed confirm is required for a passkey-only setup (FR-72).
   "This key signs for another account" is left unticked.
6. Review lists every answer. Above **Create** sits the OS-FR-23 caution: "Do
   not use one seed on more than one network…".
7. **Climax:** the chooser shows his card: `[Offline] MAINNET [Real funds]`,
   with no balance and no link out. Opening it shows Send · Tokens · Keys ·
   Local settings.

Edge: Passkey-Derived Seed with a synced passkey. After the ceremony, the kind
statement shows Text B's second WARNING again with P-6. Finish waits for it,
and nothing is refused (OS-FR-8). Edge: Import + Offline shows Text E above the
Seed field, with P-6.

### Flow 2 — Adding the Transmitter and syncing it (Otavio, daily phone)

1. Chooser → **Add Transmitter wallet** (P-2).
2. Label "Savings (send)". Network Mainnet, locked after this step.
3. Node: built-in. Open Check and auto-lock: required on Mainnet, as for any
   Mainnet Wallet. There is no Seed and no Signing Check question.
4. "Sync to an address": he scans the address from the offline phone's Local
   settings. If this device also holds an Offline Wallet for that address, P-8
   shows. It is a warning only.
5. Review → Add.
6. **Climax:** the card shows `[Transmitter] MAINNET` with the address. Inside
   are Transmit, Balances, History, Tokens, Send and Local settings. Balances
   ends with the Delegates plate: "None.", or the delegate list with P-32.

Edge: he skips the address. The card shows P-5, and the shell shows Transmit and
Local settings only. It can still answer a request and transmit (OS-FR-4).

### Flow 3 — Sending from the offline wallet (OS-UJ-1, Offline-builds, two devices)

Left is the offline phone, right is the daily phone. See
`mockups/key-route-offline-builds.html`.

| # | Offline Wallet (old phone) | Transmitter Wallet (daily phone) |
|---|---|---|
| 1 | Send tab: destination, tag, amount. Spendable, destination check and fee show P-1. **Review** | — |
| 2 | Review → "Show the request": QR plate "Data to sign needed", Mainnet, Scan 1 of 3 | Transmit tab → scanner |
| 3 | Waits; the scan plate for Data to Sign is ready below (Scan 2 of 3) | Scans. "Checking r… on Mainnet". The destination exists, the tag is given, and reserve, spendable and fee cap pass, each shown in words. Data to Sign QR, Scan 2 of 3 |
| 4 | Scans. Checks pass. **Signing review**: well "You are signing for **Mainnet**", the complete transaction, "Window: about 10 minutes" | Waits on the Transmit tab |
| 5 | **Sign** → Signing Check → signed QR, Scan 3 of 3, P-12; Kept transaction plate below | Scans the signed QR (Scan 3 of 3) |
| 6 | — | Checks (P-25) → sent → **Climax: "Validated"** with amount and hash |
| 7 | He presses "The result is known". The Build is cleared. | — |

Edge, slow: at step 6 the window has passed. The Transmitter says "Expired.
Nothing was sent." On the old phone the Kept transaction is still there, and he
presses "Start the request again" with nothing re-typed. The Build is the same,
so the review shows P-19 and the retry table decides (case b).

### Flow 4 — Retrying after "unknown" (Otavio, the network was slow)

1. The Transmitter reported Unknown. He does not know whether it went through.
2. On the old phone the Kept transaction is still there. **Start the request
   again** → request QR → the Transmitter answers.
3. The Data to Sign has a **higher Sequence** → P-20, the earlier record
   (Sequence 4127, hash, valid until ledger 91 204 377, signed 14:02) and the
   keys "Check first" and "This is a new payment".
4. He presses "Check first". On the daily phone, History shows the payment
   validated.
5. **Climax:** he presses "The result is known" on the old phone, and nothing is
   paid twice.

Variant: same Sequence, earlier window still open → P-22, and he re-signs with
the same Sequence. If the earlier one had already applied, the Transmit step
gets `tefPAST_SEQ` and shows P-23, "Probably sent before", not "Failed".

### Flow 5 — Building on the daily phone (OS-UJ-2, Transmitter-builds)

See `mockups/key-route-transmitter-builds.html`.

1. Synced Transmitter → Send: the online form with live reads. Its final
   review key is **Make the unsigned transaction** `[ASSUMPTION P-38]` (default
   key, not commit).
2. Unsigned QR plate, Scan 1 of 2, P-33. The signed-QR scanner is below.
3. Old phone → Send tab → "Sign a transaction from your Transmitter" (P-3) →
   scans.
4. Signing review: the well shows **Mainnet**, every field and flag in words,
   and "Window: 18 ledgers". Risky rows carry their caution (for example
   `SendMax` as "At most … can leave your account").
5. Sign → signed QR, Scan 2 of 2. The daily phone scans it → Transmit step →
   **Climax: "Validated"**.

Edge: the Unsigned Transaction is for Testnet → "Not signed. This is for
Testnet. This wallet is for Mainnet." (P-16/P-17). No Sign key is shown.

### Flow 6 — Moving a wallet offline, and back (OS-UJ-3)

1. An Online Wallet → Local settings → Wallet kind → **Change to an offline
   wallet**.
2. The task screen shows Text C in full: lines, two caution Alerts and the
   three numbered steps. The key "Change to an offline wallet" confirms.
3. **Climax:** the plate now reads `[Offline] [Was online]` with P-4. A
   result plate repeats Text C's "To get a key that was never online" steps.
   The Node plate is gone, and the Network is unchanged.
4. Later: **Change to an online wallet** (a `danger` key) → Text D → choose a
   Node → typed confirm (Mainnet) → Signing Check. The same address on the same
   Network as another Wallet is refused with P-35.
5. Changed back to offline again, "Was online" is still there (OS-FR-7).

### Flow 7 — Handing control to a new key (OS-FR-21, W1–W5)

1. Old phone, Offline Wallet → Keys tab → Regular Key. He scans the new key's
   address on the offline device (it is never taken from the Transmitter).
2. If the address is a Wallet here, P-30 shows. If not, **W1** shows. If it is
   a black-hole address, **W2** shows. If a Regular Key is set, **W5** shows.
   Each is a caution, and none blocks.
3. Review → request → the Transmitter's answer screen shows the key state
   (Regular Key, Master key, Signer list; P-29 where a read failed), then W5
   again on its own screen, then the Data to Sign.
4. Signing review → Sign → signed QR → Transmit → Validated.
5. Master key off: Keys tab → "Turn off the master key" (`danger`) → **"Test
   the Regular Key"** offered (a Wallet here: it signs an empty AccountSet on
   the Regular Key wallet and shows the outcome; elsewhere: it tells him to
   test it in that wallet) → W4 sentence → typed confirm → the round.
6. **Climax:** the ledger accepts it, and he is offered to set the Regular Key
   wallet to "Signs for" this Account (OS-FR-20). A ledger refusal reads as
   P-31, never as a code.

### Flow 8 — Seeing the blob before it goes (OS-FR-10, Online Wallet)

1. Local settings → Before sending → switch on "Show the signed transaction
   before sending" (it is off by default).
2. Send → the dialog's key is now "Sign" (default) → Signing Check.
3. The hash, decoded fields and Copy key. Copy → P-24 appears and stays.
4. **Climax:** "Send it to the ledger?" → **Send** (the screen's one commit
   key) → Validated. Or Do not send → P-24 + "Nothing was sent."

## Coverage: OS-FR → surface → flow → mock

| OS-FR | Surface | Flow | Mock |
|---|---|---|---|
| 1 | Chooser card per kind | 1, 2 | key-chooser-and-transmitter |
| 2 | Quiz step 1 kind radios, Text A/B; Node dropped for Offline | 1 | key-create-kind-step |
| 3 | Add Transmitter quiz; Transmitter shell; P-8 | 2 | key-chooser-and-transmitter |
| 4 | Synced address plate; tab set by sync | 2 | key-chooser-and-transmitter |
| 5 | Wallet kind plate; Text C screen | 6 | key-change-kind |
| 6 | Text D screen, irreversible confirm, P-35 | 6 | key-change-kind |
| 7 | Was-online stamp + P-4; Text E on import | 1, 6 | key-create-kind-step, key-change-kind |
| 8 | Passkey kind statement + Text B warning 2 | 1 (edge) | spine only |
| 9 | Transmit step, P-25/P-26, expiry | 3, 5 | both route mocks |
| 10 | Before sending plate; show-before-sending screen; P-24 | 8 | key-transmit-show-before-sending |
| 11 | Signed QR plate, no Send key, P-12 | 3 | key-route-offline-builds |
| 12 | Every approved string, by id | all | grep check (§Finalize note) |
| 13 | Read-placeholders P-1; Kept transaction P-18; lock erases | 3 | key-route-offline-builds |
| 14 | Request QR plate after review; P-10 restart | 3 | key-route-offline-builds |
| 15 | Transmitter answer screen; P-28; key state | 3, 7 | key-route-offline-builds, key-warnings |
| 16 | Signing review; refusals P-17; P-14; retry table | 3, 4 | key-route-offline-builds, key-retry |
| 17 | Synced Transmitter Send/Tokens/Keys → Unsigned QR | 5 | key-route-transmitter-builds |
| 18 | Field list, risky cautions, refusals, P-15 | 5 | key-route-transmitter-builds |
| 19 | Two plates removed from Local settings | — | spine only |
| 20 | Optional quiz step; Signs for plate; card line | 1, 7 | spine only |
| 21 | Keys tab/plate; W1–W5; P-31 | 7 | key-warnings |
| 22 | Delegates plate on Balances | 2 | key-chooser-and-transmitter |
| 23 | Review caution, every Seed-holding kind | 1 | key-create-kind-step |

## Open Questions

1. **Proposed strings P-1 to P-44** need owner approval. Until then they are
   drafts, and a build should not ship them.
2. **Offline key actions live in a Keys tab**, but Online and Transmitter keep
   them as a Local settings plate. Should Online also get a Keys tab, for one
   location across kinds? (The owner picked the tab set; this only flags the
   asymmetry.)
3. **Transmitter kind change.** The spec defines no change to or from
   Transmitter. This spine offers none.
4. **Retry case (c)** does not offer "This is a new payment" (see §State
   Patterns). Confirm the reading.
5. **Offline card address not linked** to the explorer. Confirm, or link as on
   Online.
6. **Synced-passkey warning timing.** Whether a passkey is synced is known only
   after the ceremony, so the warning comes on the kind statement, after the
   passkey exists. Text B's general warning was already acknowledged at step 1.
7. **Large Builds and one QR** (spec Open Question) are unchanged here. A
   request that does not fit needs a stated refusal. Its words wait on the size
   test.

## Conflicts With Existing Docs

- The 2026-10-19 spine's "Configure" screen and "a locked card shows its name
  only" are superseded by Epics 22–23 in code. This spine follows the code.
- Repo `DESIGN.md` says commit orange has "one call site, the send button in
  `SendTab`". After this feature there are more call sites (the Transmit step,
  show-before-sending, P-27). The rule "one per screen, funds-moving only"
  holds. When the feature ships, the repo DESIGN.md's call-site sentence needs
  updating.
