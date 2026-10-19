---
id: SPEC-signing-check-copy
companions:
  - copy-decisions.md
  - ../../../DESIGN.md
  - ../../../docs/agents/verifying-your-work.md
sources:
  - ../../../docs/sprints/signing-check-copy-findings.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Signing Check Copy

Copy-only change, one slice (C1), issues 8a–8i of ledger finding 8 (P2). Source: `interfaces:better-writing` review, code reading only. `copy-decisions.md` holds every location, before/after wording and affected test.

## Why

A pain. The wallet holds real Mainnet funds, and the Signing Check options are where a user picks how much protection signing has. "Signs once the wallet is open, with no further check" describes an absence and reads as though nothing is checked at all; the passkey and App PIN options are fragments with different shapes, so the three cannot be compared at a glance. A person choosing a security setting can misread what Standard does.

## Capabilities

- **CAP-1** (8a, 8b, 8c, 8d, 8f)
  - **intent:** Each Signing Check option states what the app does, in one parallel form.
  - **success:** In create-wallet and Edit checks, the Standard detail reads "Signs without asking again once the wallet is open." and the passkey and App PIN details read "Asks for your passkey on every signature." and "Asks for your App PIN on every signature."; the Edit checks passkey detail adds "The passkey is named after this wallet."; the passkey label when the current check is a passkey reads "Passkey only: a new passkey". No Signing Check detail contains "no further check".
- **CAP-2** (8e)
  - **intent:** The seed-reveal sentence for a lock with no Open Check matches its sibling sentences.
  - **success:** The sentence reads "After you confirm, the Seed is shown with no further prompt."; "Seed" is capitalised; no sentence in `revealCheckSentence` describes an absence as a check.
- **CAP-3** (8g)
  - **intent:** "No Open Check" explains itself as the Signing Check options do, without repeating its own policy reason.
  - **success:** Where the option is available, it shows the detail "Opens without asking. Testnet and Devnet only." in create-wallet and Edit checks; where it is unavailable (Mainnet), it shows only its policy reason.
- **CAP-4** (8h, 8i)
  - **intent:** The Open Check passkey options are worded as their Signing Check counterparts.
  - **success:** The Open Check passkey detail reads "The passkey is named after this wallet." in create-wallet and Edit checks, and the Edit checks label when the current Open Check is a passkey reads "Passkey: a new passkey".

## Constraints

- Copy only: no change to signing, key or Check logic, and no money value touched.
- Glossary terms stay verbatim: Open Check, Signing Check, Standard, App PIN, Seed (PRD §3).
- No new claim the product cannot back; the Testnet and Devnet claim is backed by `Unlock.tsx:27` and the Mainnet `aria-disabled` test.
- Nothing styles `:focus`; `outline-none` is banned.
- Tests that name the old text change in the same build (`copy-decisions.md`).
- `bun run lint`, `bun run build`, `bun run test` and `bun run check:contrast` stay green.
- Stage by explicit path only; the unfinished `fix/dialogs-mobile` tree stays out of the commit.
- Done only after a recorded real-browser look at the create-wallet flow and Edit checks at 320px, both themes, per `docs/agents/verifying-your-work.md`.

## Non-goals

- Lowercase "wallet" in UI copy stays as it is.
- No change to Open Check wording beyond 8g, to layout, or to the mobile-dialogs slices.
- No new Signing Check option, and no change to which options are offered.

## Success signal

A person at the Signing Check choice can tell, from the three lines alone, which option asks them again and which does not, and no line says a check is missing.

## Assumptions

- Decided by the owner's delegation ("decide it for me"), 2026-10-18: lowercase "wallet" stays; 8h and 8i are in scope; the 8g detail shows only where the option is available.
- `Choice` (`check-controls.tsx`) renders `detail` through `aria-describedby`, not the accessible name, so the `No Open Check` radio tests are expected to pass unchanged. Verify by running them.
