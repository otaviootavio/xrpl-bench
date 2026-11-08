# Spine Pair Review — xrpl-wallet offline signing

Reviewed: `DESIGN.md` (213 lines), `EXPERIENCE.md` (550 lines), `.memlog.md`, nine files in `mockups/`, `.working/gen_mocks.py`. Contract: `_bmad-output/specs/spec-offline-signing/` and the offline-signing PRD. Line numbers are those of the reviewed files on 2026-11-07. `E` means EXPERIENCE.md and `D` means the delta DESIGN.md.

## Overall verdict

The pair is ready to build from after a short fix pass. Every OS-FR and every OS-UJ has a surface, a flow or a coverage row, and a mock. Every token reference resolves. The approved texts are referenced by ID and pulled into the mocks by script. The memlog overrides (orange Send on every Transmitter round, Receive on Offline) are applied everywhere.

Five high findings remain. Each one is a place where a builder would either guess or follow the spine into something wrong:

- Offline warnings that need a ledger read (W5, W4's test) are placed on the offline Build.
- The Transmitter-builds route has no state table.
- Turning the master key off by the Transmitter-builds route has no stated confirm.
- The risky-field warnings have words for SendMax only.
- The mocks frame a tec ledger refusal as "Not sent."

There are no critical findings.

## 1. Flow coverage — adequate

### Findings
- **[high]** Route-checks' risky-field row ("Strong warning in words": `Paths`, `DeliverMin`, memos, `Delegate`, `TicketSequence`, irreversible account and trust-line flags) has words for `SendMax` only (E L239, Flow 5 step 4 L438). This is the only Refuse or Warn row in `route-checks.md` without a stated place and words. The mock adds an unnumbered sentence, "This transaction has a SendMax. At most … more than the amount above." (`key-route-transmitter-builds.html`, row 3). *Fix:* add one P-n per risky field or flag class, plus the generic irreversible-flag line, to §Proposed strings, and point the Field list row at them.
- **[high]** Turning the master key off by the **Transmitter-builds** route has no stated place for W4, "Test the Regular Key", or the irreversible-class typed or held confirm. The W4 row (E L155) names only "the Offline Build and the Transmitter answer screen". Flow 7 covers only Offline-builds. The Transmitter Keys plate (E L103) only says it "Builds an Unsigned QR". The Transmitter cannot sign, so it can neither run the test nor give the Signing Check. The spec requires a typed or held confirm plus the Signing Check (SPEC Constraints). *Fix:* add a Transmitter-builds variant to Flow 7. State on which device W4 and the typed confirm appear (most likely the offline signing review when it decodes an `AccountSet` with `asfDisableMaster`). State what "Test the Regular Key" does from a Transmitter.
- **[medium]** OS-FR-21 also covers "replace or remove the Regular Key, and turn the master key off **or on**". The spine has keys and words only for "Set a Regular Key" and "Turn off the master key" (P-47, E L222). There is no flow, key or place for removing the key or turning the master key on, although P-31's `tecNO_ALTERNATIVE_KEY` on removal implies one. *Fix:* add the two keys to P-47 and to the Keys plate and tab, and add a line to Flow 7.
- **[medium]** P-8 (same address on an Offline and a Transmitter Wallet) is placed only at Add Transmitter and Sync (E L183, Flow 2 step 4). CAP-3 warns about the pair in whichever order it comes about. Creating or importing an Offline Wallet, or using "Change to an offline wallet", while a Transmitter is Synced to that address gets no warning. *Fix:* add those two places to the P-8 row.
- **[medium]** OS-FR-20's "after a Regular Key change built in this app, offer to set the new key's Wallet to Sign for that Account" appears only as a climax clause (Flow 7 step 6, E L475). It has no P-string, no key words, and no surface for when the Regular Key Wallet is on this device or elsewhere. *Fix:* add a P-n and its place on the outcome screen.
- **[low]** Flows 3 and 5–8 name no protagonist in the heading, and Flows 2 and 8 have no failure path: an invalid or unreadable Sync address; `unknown` or a failed Signing Check after "Send it to the ledger?". *Fix:* name Otavio and the device in each heading, and add one edge line to each flow.
- **[low]** OS-FR-22 asks for "what each [delegate] may do". The spine gives only the warning, "None." and the failed-read text (P-32, E L207, Flow 2 L385). The mock invents a "May do" row. *Fix:* state the delegate row's fields in the Delegates plate entry.

## 2. Token completeness — strong

### Findings
- **[low]** `typography.signing-network` (D L18–24) copies `readout`'s weight, line height and tracking as literals instead of references, and drops `fontFeature: "'tnum' 1, 'zero' 1"`. It also uses the `{typography.readout.fontFamily}` deep-path form, which the root file never uses, so it is unverified whether the tooling resolves it. *Fix:* reference every readout property, or note that the role is `readout` with no feature change.
- **[low]** `kind-stamp` (D L26–32) gives its 1px control-edge border only in the note. *Fix:* add `borderColor: "{colors.enamel-control-edge}"` so the contrast pair can be traced.
- **[low]** §Shapes (D L148) says the 0.125rem radius applies to "every new plate, stamp". The stamps use `{rounded.sm}` (`calc(0.125rem - 1px)`). *Fix:* say "stamps use `rounded.sm`, as the root Badge does".

## 3. Component coverage — thin

### Findings
- **[medium]** The two component inventories do not match. DESIGN's "Transaction field list" is EXPERIENCE's "Field list". The kind stamp, Was-online stamp and signing-network well have no Component Patterns row (the well appears only inside "Signing review"). Kind radios, Read-placeholder, Kept Build plate, Transmit tab scanner, Signing review and Irreversible confirm have no DESIGN Components entry. As a result, the Kept Build plate's three keys ("The result is known", "Start the request again", "Cancel this transaction") have no variant, and the read-placeholder's visual ("body text", E L237) sits in the behaviour file. *Fix:* use one name per component in both files, and give each new component a line in each file.
- **[medium]** Several plates are introduced with no visual or behaviour entry: the Delegates plate, the Key state plate (Transmitter answer), the Synced address plate, the Before sending plate (switch), the Signed by this wallet plate, and the Transmitter answer's check-results list. *Fix:* one Component Patterns row each, or one sentence saying they are plain `card-plate` plus `dl` with the root rules.
- **[medium]** The change-kind confirm has two shapes. D L185–189 says the confirm "is the existing irreversible-class dialog (typed or held confirm, `destructive` fill)". E IA L76, Flow 6 and `key-change-kind.html` show a task screen with the Node choice and the typed phrase inline. *Fix:* pick one and state it in both files.
- **[medium]** The root `nav` tabs primitive is "grid-cols-3 below `sm`, grid-cols-6 from `sm` up". The spine sets the layout below `sm` only (E L87–90). The Offline Wallet's 5 tabs and the unsynced Transmitter's 2 tabs have no stated layout at `sm` and up, and "one row of two" below `sm` conflicts with the primitive's 3 columns. *Fix:* state the column count per tab set at both breakpoints, owned by the primitive.

## 4. State coverage — adequate

### Findings
- **[high]** The **Transmitter-builds route has no State Patterns table** for either device, while the Offline-builds route has a full one (E L247–257). These states are unspecified:
  - Transmitter: building; Unsigned shown and waiting; wrong payload scanned; the Transmitter locked mid-round, or its Sync removed, with an Unsigned Transaction outstanding; the window passed before the signed scan.
  - Offline device: Unsigned scanned, then review, then Sign or "Do not sign" (where P-34's "Nothing was signed." shows and what screen follows); refused (P-16/P-17); whether a Transmitter-builds signing enters the "Signed by this wallet" list and the Same Build check.

  *Fix:* add a two-device state table for OS-UJ-2 like the Offline-builds one.
- **[medium]** The Transmitter answer screen has no state for a request whose Network differs from the Transmitter's own, or whose Account differs from the Synced address (E L276–284). Today the round would only fail later, on the offline device (P-17 Network). *Fix:* state what the answer screen shows: a refusal in words with no QR, or a caution. Confirm against CAP-9 "uses its own Network".
- **[medium]** Offline tab states are partly missing.
  - The Offline Tokens tab normally lists trust lines, which is a read. The spine does not say whether the list area shows P-1 or is hidden.
  - "Signed by this wallet" has no empty state. P-49 reads as a description, not as "nothing signed yet".

  *Fix:* add a row for each to §State Patterns.
- **[low]** The Add Transmitter quiz has no error states: a malformed address, or a second Transmitter for the same address on the same Network (allowed or refused?). *Fix:* one row each.
- **[low]** The unsynced "This wallet" plate says "No address yet" (E L96) while P-5 says "Not synced" (E L180). The same row puts Signature type on a Transmitter, which holds no key (the mock correctly omits it). *Fix:* use P-5 in both places, and remove Signature type for Transmitter.

## 5. Visual reference coverage — adequate

### Findings
- **[medium]** Only two of nine mocks are linked at the place they illustrate (E L396, L432). The other seven appear only as bare stems in the Coverage table (E L490–514), with no path. IA, State Patterns, and Flows 1, 2, 4, 6, 7 and 8 carry no composition reference, and DESIGN links no mock. The synced-passkey screen (a create-flow screen) lives in `key-local-settings.html`. *Fix:* add a `→ mockups/<file>.html` line under each IA sub-table, state table and flow, and move the passkey row into `key-create-kind-step.html` or link it as it is.
- **[medium]** The mocks show UI strings that are neither approved nor in the P-list, and `verify.py` checks only approved lines. Examples:
  - "Scan this code with the offline wallet." (Data to Sign plate; no P-n exists for that plate line)
  - "Checked on Mainnet", and the check results "exists", "given (50211)", "enough", "under the fee limit"
  - "Scan the data to sign", "Scan the signed code from the offline wallet."
  - "Stop the camera", "Scan an address with the camera"
  - the SendMax sentence (see §1)

  A builder copying a mock ships unapproved words. *Fix:* give each one a P-n, or mark mock-only filler visibly.
- **[low]** The Coverage table cites "grep check (§Finalize note)" for OS-FR-12 (E L503). No such section exists. *Fix:* point to `.working/verify.py`.
- **[low]** The mocks clamp the signing-network size at 3rem; the token is `clamp(2.25rem, 11vw, 5rem)`. The spine wins, but the mock understates the scale. *Fix:* regenerate with the token value.

## 6. Bloat — strong

### Findings
- **[low]** The commit-orange rationale is stated in full twice: D §Colors L92–99, and E §Transmit step L288–294 plus the Component Patterns "Commit key" row. *Fix:* keep the rule in DESIGN and the per-situation table in EXPERIENCE, and have each point to the other.
- **[low]** Open Question 6 (E L530–532) is a statement of the design, not a question. *Fix:* phrase what the owner must confirm, or move it to State Patterns.

## 7. Inheritance discipline — adequate

### Findings
- **[high]** Two offline warnings need a ledger read and are placed on the offline Build.
  - W5 is placed "On the Offline Build" (E L156), and Flow 7 step 2 (L465) shows it on the old phone's Keys tab. The Offline Wallet makes no read (rule 1, E L41; CAP-8), so it cannot know a Regular Key is set. The mock says the opposite: "No W5 here: this device cannot know…" (`key-warnings.html`, row 1).
  - W4's "Test the Regular Key" is also placed on the Offline Build (E L155). At Build time the offline device does not know the Regular Key: the mock shows "Regular Key: Comes from the Transmitter" directly above the Test key. "Shows whether it was validated" needs a transmit round.

  *Fix:* `route-checks.md` lets Data to Sign carry the key state "for display", so move W5 to the offline **signing review**, fed from that key state, and keep it on the Transmitter answer screen. For W4, state that the test runs from the Regular Key Wallet's own device or round, and that the offline Build shows only W4's sentence.
- **[high]** The ledger-refusal framing is wrong in the mock and absent from the spine. `key-warnings.html` shows "Not sent." over `tecNEED_MASTER_KEY`. Only `temBAD_REGKEY` is a tem result, meaning not applied. `tecNO_ALTERNATIVE_KEY` and `tecNEED_MASTER_KEY` are tec results: applied, with the fee claimed and the Sequence consumed, which is today's "claimed" outcome. P-31 (E L206) never says which outcome it sits under. "Not sent" on an applied transaction misstates the outcome and works against the never-resubmit rule. *Fix:* in P-31 state "`temBAD_REGKEY` → failed, nothing applied; `tec*` → claimed outcome wording, with the P-31 sentence as the reason", and correct the mock.
- **[medium]** P-12 hard-codes "about 10 minutes after {time}" (E L187). On Transmitter-builds the window is set by the Transmitter (Flow 5: "Window: 18 ledgers"). The mock has to change the words to "about 1 minute". *Fix:* make the duration a parameter, or use "{n} ledgers" on that route, in line with P-13.
- **[medium]** "Don't … uppercase any approved string" (D L213) conflicts with the inherited faces that carry approved strings. The root keys use an "engraved uppercase legend", and stamps and placards use the legend face. That covers "Was online", "Change to an offline wallet", "This is a new payment", "Test the Regular Key", "Sync to an address" and "Data to sign needed". The mocks uppercase all of them. *Fix:* state whether CSS `text-transform` on keys and legends is allowed (DOM text verbatim) or banned for approved strings. Today only the signing-network well says "no text-transform".
- **[medium]** "Don't render a ledger value on an Offline Wallet as a number" (D L207–209) contradicts the signing review and the earlier-signing record, which show Sequence, Fee and LastLedgerSequence as numbers taken from Data to Sign. *Fix:* narrow it to "a value the online screen *reads*".
- **[low]** The field list names "Signs-for key" (E L238), which is not a glossary term. The glossary's "Signs for" is an Account. *Fix:* "Account (Signs for)" and "Signing key".
- **[low]** The Accessibility Floor lists two exceptions to "no control is hidden" (E L342–345). The Field list also hides the Sign key on a refused review (E L239). *Fix:* add that case to the exception list.
- **[low]** The Conflicts section flags the root DESIGN.md commit-orange call-site sentence, but not the root Chips sentence "The build ships one meaningful use [of Badge]", which the kind and Was-online stamps also change. *Fix:* add it to the Conflicts list.

## 8. Shape fit — strong

### Findings
- **[low]** IA has no "→ Composition reference … Spine wins on conflict" line after the surface table, as the example shape has. The rule is stated only once, at the top. *Fix:* see §5, and add the line under IA.
- **[low]** Component Patterns holds visual detail ("body text", "caution Alert" tone choices), which belongs in DESIGN. The rest of the split is clean. *Fix:* move the tone and face words into DESIGN Components when fixing §3.

## Mechanical notes

- "Spines win on conflict" is stated in both files: D L77–78 and E L26.
- No orphan mocks. All nine `mockups/*.html` appear in the E Coverage table (L490–514). Only two are linked in place (see §5).
- Every `{colors.*}`, `{typography.*}`, `{rounded.*}` and `{components.*}` reference in D resolves to the root `DESIGN.md` or to this delta: `enamel-ink`, `enamel-plate`, `enamel-recess`, `enamel-readout`, `enamel-readout-ink`, `enamel-readout-muted`, `lamp-caution-enamel`, `lamp-caution-enamel-legend`; `readout`, `mark`, `data`, `legend`, `body`, `signing-network`; `rounded.sm`, `rounded.md`. Components reference only enamel tokens, as the root's components do.
- Route-checks coverage: every Refuse and Warn row has a place and words (P-14, P-15, P-16/17, P-26, P-28, P-29, W1–W5, fixed "Expired. Nothing was sent."), except the risky-fields row (§1).
- OS-FR coverage: 23 of 23 rows in the Coverage table. OS-UJ-1 → Flow 3, OS-UJ-2 → Flow 5, OS-UJ-3 → Flow 6. Each has a climax.
- The memlog overrides are applied in both spines and in the mocks: orange Send on every Transmitter round; Offline tabs Send · Receive · Tokens · Keys · Local settings. No trace remains of the superseded "scan sends" assumption.
- The memlog event lines are stale against the current files: "8 HTML files" (there are now 9, including the untracked `key-local-settings.html`) and "P-1 to P-44" (the spine now has P-1 to P-49). These are log entries, not rules, but the next session may misread them.
- Approved texts A–E, W1–W5, OS-FR-23 and the fixed strings are referenced by ID, as intended, and render verbatim in the mocks.
