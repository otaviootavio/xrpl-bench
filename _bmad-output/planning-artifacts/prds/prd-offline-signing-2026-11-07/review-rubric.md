# PRD Quality Review — Offline signing (feature PRD, 2026-11-07)

## Overall verdict
The PRD has a real thesis: every write ends in one Transmit step, and the key's location is a first-class choice. The decisions behind it are recorded, dated and traceable to the memlog. The two routes, the three Wallet kinds and the consequence texts are specific enough to build from. The risk is where the feature meets rules the product PRD ties to a Network or to FR-75. An Offline Wallet has no Network, yet the product's Mainnet floors (Open Check, Passkey-Derived Seed gate, "Real funds") are never assigned to it. Retiring FR-75 removes the Regular-Key operating pattern that Text C itself recommends. The kept Build and the round-repeat path can produce a second payment after an `unknown` outcome. These gaps need closing before UX or architecture source-extract from this PRD.

## Decision-readiness — adequate
Decisions are stated as decisions, and each carries its date (OS-FR-3, OS-FR-4, OS-FR-7, OS-FR-8, OS-FR-13, OS-FR-15, OS-FR-19). §8 separates what is open (two items) from what was settled. The trade-offs given up are mostly named: OS-FR-19 says outright that controlled accounts are "not converted", and OS-SM-C1 names deliberate friction as the price of OS-SM-1.

Two trade-offs are made silently. First, a signature made for one Network is valid on another unless `NetworkID` is signed (addendum, "Network without a Network"). The PRD body accepts that leftover risk without saying it was accepted, and OS-SM-3 then claims the opposite. Second, retiring FR-75 gives up a capability as well as a data migration: operating an Account through a Regular Key held elsewhere. OS-FR-19 frames the decision as "No migration". It does not say that the setup cannot be re-created with the new kinds (see Scope honesty).

### Findings
- **high** Cross-network replay is an accepted risk that the body never states (§7 OS-SM-3, OS-FR-9; addendum "Network without a Network"). OS-SM-3 promises "No Signed Transaction is ever sent on a Network other than the one shown at signing." Mainnet, Testnet and Devnet do not sign `NetworkID` (addendum: "exists only above 1024"). The Network check in OS-FR-9 compares an unsigned envelope, and it runs on the Transmitter, which the addendum treats as possibly compromised. Only this app's honest Transmit step can keep the promise. A modified Transmitter, or anyone holding the blob, can submit it on another Network where the Account and Sequence match. *Fix:* reword OS-SM-3 so it covers what this app's Transmit step does. Add a stated, accepted residual risk with its mitigation: the Network shown large, plus Text B's line about checking the network. Decide whether a same-address, same-Sequence Account on two Networks needs its own warning.
- **medium** OS-FR-6 changes FR-93 and does not say so (§0 promises "It names a product-PRD FR only where it changes it"; OS-FR-5, OS-FR-6). The path Online (Testnet) → Offline → Online (Mainnet) moves one Wallet from Testnet to Mainnet. FR-93 forbids that: "There is no native move from Testnet to Mainnet. The danger this rule guards against is a Testnet Seed reused on Mainnet." *Fix:* either limit OS-FR-6 to the Network the Wallet last had, or state that FR-93 is changed. If FR-93 is changed, require FR-93's Mainnet review step ("Real funds" plus the "same key on Mainnet" sentence) when the new Network is Mainnet.

## Substance over theater — strong
There is no furniture. The three journeys each drive requirements: OS-UJ-1 drives OS-FR-13 to OS-FR-16, OS-UJ-2 drives OS-FR-17 and OS-FR-18, and OS-UJ-3 drives OS-FR-5 and OS-FR-7. The Vision is specific to this product: the 4 to 6 minute window, the three transaction types, and the setting that is "hidden in settings" today. There is no persona list beyond the one operator, and no NFR boilerplate. The consequence texts are content, not ornament. The ASD-STE100 note on "create" and "import" shows the texts were actually checked.

## Strategic coherence — strong
The thesis is explicit in §1: "one Transmit step … is what makes the offline route the same feature as the online one rather than a parallel copy". The FRs follow from it. OS-FR-9 is the shared base, OS-FR-11 is the offline exit into it, and OS-FR-10 is the inspection hook on it. Both routes are scoped to "every write the app can build" (OS-FR-17, OS-SM-2). The metrics validate the thesis, not activity: two QR rounds with no field typed twice, full write coverage, and no wrong Network. A counter-metric is named. The scope kind (problem-solving, one operator) matches the logic.

The one strain is OS-SM-3, covered under Decision-readiness.

## Done-ness clarity — thin
Most FRs have crisp, testable consequences. Examples: OS-FR-1's card text, OS-FR-11's "never shows a Send button", OS-FR-14's lock-after-request, and OS-FR-16's refusal list. The weak points sit where an Offline or Transmitter Wallet meets a product rule that is keyed on Network or lock. There, an engineer cannot tell what done is. One promise also contradicts its own FR.

### Findings
- **high** Network-keyed product rules are unassigned for a Wallet with no Network (OS-FR-2, OS-FR-3, OS-FR-8; product FR-65, FR-63, FR-91). Several product rules are keyed on Network:
  - FR-65 requires an Open Check and an auto-lock of at least 1 minute on Mainnet only.
  - FR-63 blocks a Mainnet Passkey-Derived Seed on the `*.b-cdn.net` origin.
  - FR-91 says Network "decides which of" the later questions apply.

  OS-FR-2 removes the Network question for an Offline Wallet and never says which rule set replaces it. As written, the Offline Wallet that Text B recommends "for large amounts" could have no Open Check. Its Signing Check floor is also undefined. A Transmitter Wallet has "no Signing Check of its own" (OS-FR-3), yet a Synced Mainnet Transmitter shows a balance, and its Open Check, lock (FR-95) and Node are not stated. *Fix:* add one FR that gives the Offline Wallet the Mainnet floor (Open Check required, auto-lock floor, Signing Check floor, Passkey-Derived gate) and the Transmitter Wallet its Network's floor, its own lock and a Node.
- **high** A kept Build can be signed twice after an `unknown` outcome, which pays twice (OS-FR-13, OS-UJ-1 edge case, OS-FR-9). OS-UJ-1 has the user restart "the data-to-sign round" from the kept Build. If the first Signed Transaction was applied and only the outcome was lost, the new round's Data to Sign carries the next Sequence. The repeat is then a second, valid payment. OS-FR-9 only stops resubmitting *the same* blob. The cheap restart path is exactly the one that bypasses decisions.md §16 ("check it by its hash before trying again"). *Fix:* state that after an `unknown` or claimed outcome, the Transmitter refuses to issue new Data to Sign for that Account until the earlier hash is resolved. Also state that the kept Build is not re-offered as "start again" after a submit whose outcome is not `expired`.
- **medium** OS-FR-13 contradicts OS-UJ-1 on when the Build is erased (OS-FR-13: kept "until it is signed, cancelled or replaced"; OS-UJ-1: the window passes, the Transmitter says "Expired", and "the offline phone keeps the built transaction"). Expiry is detected after signing, so under OS-FR-13 the Build is already gone. *Fix:* say the Build is kept until it is transmitted and validated, cancelled, replaced or locked away. Make expiry a named case.
- **medium** Auto-lock can erase the kept Build in the middle of a round (OS-FR-13, OS-FR-15, OS-FR-16). "A lock erases it", the window is "about ten minutes", and FR-65's auto-lock floor is 1 minute. If the offline phone locks while the user is at the other device, the Build is gone. The returning Data to Sign is then also refused as "a request it did not issue". *Fix:* state the expected interaction: either the auto-lock minimum for an Offline Wallet covers the round, or a lock in the middle of a round is reported plainly and the round restarts by design.
- **medium** "The fee cap" has no definition in the product PRD (§0 lists it as shared; OS-FR-15, OS-FR-16, OS-FR-18 refuse on it). The product PRD contains no fee cap. The cap is in `docs/decisions.md` §14 (`MAX_FEE_DROPS`, 10,000 drops). This matters more here than online, because the cap is the offline device's main defence against an inflated Fee (addendum). *Fix:* point to decisions.md §14, or state the threshold.
- **low** OS-FR-15 lists payment and trust-line pre-flight checks only. Key actions such as disabling the master key are gated in the product PRD on a ledger read ("offered only once a Regular Key is set on the Account and validated"). "The same pre-flight checks the online screen runs" covers this by implication. *Fix:* add "Regular Key present for master-key disable" to the list so the Transmitter check list is complete.

## Scope honesty — adequate
Non-goals are explicit and do real work: no radio control, no hardware wallets, no relay, one transaction per round. §6.2 separates "Later" from "Non-Goals". The open-items density is low (two Open Questions, one assumption), which suits a PRD that is ready for UX.

The silent omission is the Regular-Key operating pattern that FR-75 supported today.

### Findings
- **high** Retiring FR-75 removes the Regular-Key pattern that Text C recommends, and Text C step 2 is incomplete as stated (OS-FR-19, OS-FR-12 Text C step 2, OS-FR-16, OS-FR-18).
  - **The pattern cannot be re-created.** Text C step 2 says "set the new key as the Regular Key of this account". The new Offline Wallet's key is then a Regular Key for a different address. OS-FR-16 refuses "an address that is not its own", and OS-FR-18 refuses "a transaction for another Account". The app cannot operate the Account the user was just told to set up, and OS-FR-19's "the operator re-creates the setup with the new Wallet kinds" is not possible.
  - **Step 2 leaves the exposed key active.** On XRPL, `SetRegularKey` does not revoke the master key. The online-exposed master key keeps signing until `asfDisableMaster` is set. So step 2 does not remove the risk named in the WARNING just above it. The owner approved this text verbatim, so this is flagged as a factual gap only.

  *Fix:* decide whether a Wallet's signing key may differ from its Account address (a Regular-Key Offline Wallet), and say so in OS-FR-1, OS-FR-16 and OS-FR-18. Have the owner decide whether step 2 needs "then disable the master key" or should be dropped. Without that, OS-FR-19 is a capability loss and should be stated as one.
- **medium** OS-FR-19's pointer list misses other places that cite FR-75 (OS-FR-19 third bullet). Others in the product PRD that depend on FR-75 or the Controlling Wallet:
  - the FR-63 recovery sentence ("Only a written Seed (FR-69) or a Controlling Wallet (FR-75) recovers the funds")
  - the FR-93 and FR-95 lock exception for a controlled Wallet
  - FR-94's Local settings list ("Operating another account … Two-device signing")
  - FR-76 and FR-77
  - the master-key FR's "Controlling Wallet that holds it"
  - the product Glossary's "Controlling Wallet"

  *Fix:* list every product-PRD location that changes, or say "every reference to FR-75 or FR-78".
- **low** §2.2 says "Unchanged from the product PRD §2.2", but that section says "One operator, one device". The product PRD §6.2 asks this PRD to "reconcile" §2.2. This PRD needs two devices by design. *Fix:* state that §2.2 changes from "one device" to "one operator, one or more devices".

## Downstream usability — adequate
The Glossary is strong and used consistently. Build, Data to Sign, Data-to-Sign Request, Unsigned and Signed Transaction, and both route names are capitalized and stable across FRs, UJs and SMs. The IDs are contiguous (OS-FR-1 to OS-FR-19, OS-UJ-1 to OS-UJ-3, OS-SM-1 to OS-SM-3 plus C1). The UJs have a named protagonist. The addendum gives architecture a clean starting point: codec kinds, the `two-device.ts` reuse, and the `submitAndClassify` split.

Usability drops only where a section depends on a product-PRD reference that points at the wrong place (FR-22, the fee cap; see Mechanical notes). It also drops where a rule an architect needs is absent: the Network-less floors (see Done-ness).

## Shape fit — strong
A capability-spec shape suits one operator. There are three lean journeys rather than many, the metrics are written as checks ("checks rather than targets"), and the brownfield references to existing code sit in the addendum, not the requirements. The feature-PRD layering is consistent: shared rules are referenced, not restated. The verbatim consequence texts are a fitting exception for a security-critical feature.

## Mechanical notes
- **FR-22 citation** (OS-FR-9): "product PRD FR-22, the `unknown` outcome". FR-22 only separates submitted from validated. The `unknown` outcome is `docs/decisions.md` §16. "Never resubmit the same blob" is FR-24. Fix the pointer.
- **Fee cap pointer** (§0): it lives in decisions.md §14, not the product PRD.
- **Migration wording vs FR-95**: OS-FR-1 ("Existing Wallets become Online Wallets") and OS-FR-10 ("new and existing") describe carrying old records forward. FR-95 says "There is no migration", and OS-FR-19 cites FR-95 to drop controlled accounts. Either say existing records are read as Online with no data change, or drop "existing".
- **FR-91 order** (OS-FR-2): the PRD says "The first question … with Label, asks the kind". FR-91 step 1 is Create or Import, then Label and Network. Say where the kind sits relative to Create or Import.
- **QR round count** (OS-SM-1 vs OS-UJ-1): "two QR rounds", but OS-UJ-1 has three scans (request, Data to Sign, signed). Define "round" or count scans.
- **Same-address refusal** (OS-FR-3, OS-FR-6): FR-93 refuses the same address on the same Network. The PRD does not say whether two Transmitter Wallets, or a Transmitter plus an Online Wallet, for one address on one Network are refused, allowed or warned.
- **Assumptions Index roundtrip** (§9): the one indexed assumption ("Data to Sign travels by QR") has no inline `[ASSUMPTION]` tag in the body. The memlog's "8 assumptions" are now said to be confirmed. That is fine, but the index entry should point to its location (OS-FR-15).
- **Open Question 1** (§8) bears on OS-SM-2 ("every write"). If a request can exceed 2,331 bytes, OS-SM-2 is conditional on the multi-frame QR in §6.2. Note the dependency.
- Required sections are all present for a feature PRD at these stakes.
