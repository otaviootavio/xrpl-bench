# Epic: In-App Notices

Covers how the wallet tells you that something happened — a payment sent, a
transaction that failed and still took its fee, a payment that arrived while you
were doing something else — and where that message lives on the panel. See the
[Index](./INDEX.md) for scope and shared XRPL facts.

Like [app-versioning-and-updates.md](./app-versioning-and-updates.md), this epic
is not about the ledger, so its stories close with **Relevant mechanism** rather
than *Relevant XRPL mechanism*.

**Why this epic exists.** Notices are currently toasts pinned to the top of the
viewport. Two consequences make that untenable rather than merely untidy.

First, errors and warnings **never auto-dismiss** (`docs/decisions.md` §6.5) —
deliberately, because a failed unlock or a `tec*` "the fee was still charged"
result has no inline equivalent anywhere in the UI. A four-second toast that
covers something is a nuisance; one that sits there until dismissed is a
blocker. What it covers, it covers indefinitely.

Second, what it covers is the worst possible thing. Nothing in the app is
sticky, so a fixed top-center notice sits over `AppHeader` at any scroll
position — and `AppHeader` carries the Mainnet **"Real funds"** badge, the one
indicator on the panel that says this is live money. A persistent error can hide
it. At 320px the stack also covers both rows of the six-function nav.

**The consequence for implementation:** a notice must take its own space rather
than cover the instrument. That is also the only answer consistent with the
visual world — every other device in `DESIGN.md` (plate, well, scribe, lamp,
annunciator) sits *in* the panel's plane. The notice is the only thing that
floats over it, and a bench panel does not have a floating notice; it has a
fixed annunciator area that is dark until something lights it.

---

### US-1: Never lose sight of the panel because of a notice
As a user, I want a notice to take its own space rather than cover the panel, so that nothing the wallet tells me about money can be hidden by something else the wallet is telling me.

**Acceptance Criteria:**
- No notice, at any scroll position, overlaps the header, the six-function nav, or any control.
- The Mainnet "Real funds" badge is visible whenever the network is Mainnet, regardless of how many notices are showing or how long they have been there.
- The notice area is present at all times, so a notice arriving never reflows the panel and never moves a control while someone is reaching for it. This matters most for the commit key: a layout shift under the control that moves funds is the failure this design exists to prevent.
- Verified at 320px and at 1440px, in both panel finishes, with the longest real notice strings.

**Relevant mechanism:** The chassis becomes a fixed-height shell — header pinned, notice area pinned, panel content scrolling in its own region between them. Reserved space, not an overlay. This replaces `Main.tsx`'s current `min-h-dvh` document flow.

---

### US-2: See that something happened without hunting for it
As a user, I want every notice to appear in one fixed place, so that I learn where to look once instead of tracking a message that moves.

**Acceptance Criteria:**
- One notice area serves every notice, whether it is the result of something the user just did or something that arrived on its own.
- The area is in the same place on all six panels and does not move when the active tab changes.
- Its position does not change between viewports; only its internal layout adapts.

**Relevant mechanism:** A single app-level notice store, rendered once by the shell. Every call site continues to reach it through `toast` from `@/lib/notify`, which is already the sole entry point for all twenty-five of them.

---

### US-3: Keep an error until I have dealt with it
As a user, I want an error or a warning to stay until I dismiss it, so that I cannot miss the one thing that went wrong by looking away.

**Acceptance Criteria:**
- Errors and warnings persist indefinitely; successes and informational notices clear themselves. This preserves `docs/decisions.md` §6.5 exactly as it stands.
- Every persistent notice has a visible, keyboard-reachable dismiss control.
- Dismissing a notice never dismisses another one the user has not read.
- Nothing about a notice's persistence depends on where the user has scrolled or which tab is active.

**Relevant mechanism:** Per-type duration continues to live in `lib/notify.tsx`, which already owns it. Note that §6.5's *stated* mechanism is sonner-specific — it explains the rule as a workaround for `<Toaster toastOptions>` applying one duration to every type. The rule survives this epic unchanged; its recorded reasoning does not, and §6.5 is amended in the same commit that removes the dependency.

---

### US-4: See several notices without losing the panel
As a user, I want more than one outstanding notice to remain legible, so that a bad minute does not either hide information or consume the instrument.

**Acceptance Criteria:**
- Several outstanding notices are all reachable; none is silently dropped.
- The notice area has a bounded height. It never grows to a size where the panel content it sits beside stops being usable.
- Severity is legible at a glance: an outstanding error is not buried under three successes.
- Behaviour at the bound is settled by **N3** below and is not invented by the implementation.

**Relevant mechanism:** Bounded region with the overflow rule chosen in N3.

---

### US-5: Be told a payment arrived while I was doing something else
As a user, I want an incoming payment to reach me wherever I am in the app, so that money landing is never something I find out about later.

**Acceptance Criteria:**
- An incoming payment notice appears in the same area as every other notice — the placement does not vary by whether the user prompted it.
- It states the amount and the counterparty, and says so honestly when the delivered amount is only an upper bound.
- It does not steal focus, interrupt a form, or dismiss anything the user has not read.
- It never fires for the account's existing history when switching wallet or network.

**Relevant mechanism:** `useIncomingPaymentNotifications` keeps its current watch-key and seen-set behaviour unchanged; only the surface it reports into changes.

---

### US-6: Have a notice announced, not just drawn
As a user of a screen reader, I want a notice to be announced when it arrives, so that I learn what happened at the same time as a sighted user.

**Acceptance Criteria:**
- The notice area is a live region; a notice arriving is announced without moving focus.
- The announcement carries the state and the message, not the message alone — a state change also changes the accessible name (`docs/decisions.md` §6.5).
- Colour never carries the state on its own: the tone is stated in words, per the annunciator rule in `DESIGN.md`.
- The dismiss control has an accessible name that identifies which notice it dismisses when more than one is present.
- Nothing in the notice area styles `:focus` or `:focus-visible`, and nothing writes `outline-none` (`docs/decisions.md` §6.3).

**Relevant mechanism:** A polite live region owned by the notice area. Announcement comes from real DOM text, never from CSS-generated content or an `aria-label` composed from a React node.

---

### US-7: Read a notice at 320px and at 200% zoom
As a user on a small screen, I want a notice to be fully readable without the panel becoming unusable, so that the narrowest supported viewport is not a degraded one.

**Acceptance Criteria:**
- At 320px the notice area is legible and the six-function nav remains fully present — no label shortened, nothing scrolled out of view (`docs/decisions.md` §6.13).
- The longest real strings fit and wrap sensibly: `Failed — fee charged (tecUNFUNDED_PAYMENT). The network fee was still charged.` and `This transaction expired before validating. It was not applied — you can retry.`
- A bracketed result code never breaks across two lines, where it would read as two codes.
- 200% zoom is a supported condition, not an edge case (`PRODUCT.md`).

**Relevant mechanism:** The bounded region of US-4 sized in relative units; wrapping decided per notice rather than globally.

---

### US-8: Be told things on the lock and setup screens too
As a user, I want notices on the unlock and first-run screens to behave like every other notice, so that "wrong PIN" and "that seed looks invalid" are not a different experience from the rest of the wallet.

**Acceptance Criteria:**
- `Unlock` and `Onboarding` — which render *instead of* `Main`, not inside it — either share the same notice area or have a treatment that is deliberately chosen and written down.
- Whichever is chosen, no notice on those screens covers the control the user is currently operating.
- The eight notices those two screens raise today (one on `Unlock`, seven on `Onboarding`) keep their exact copy.
- Settled by **N1** below; the implementation does not decide it.

**Relevant mechanism:** Depends on N1 — either the shell moves up to `App` so all three screens share a chassis, or those two screens keep their own arrangement.

---

## Open decisions this epic depends on

Four, all genuinely open. Recorded rather than assumed, because each changes
what gets built.

| # | Question | Why it blocks |
|---|---|---|
| **N1** | Does the chassis shell move up to `App`, so `Unlock` and `Onboarding` share one notice area with `Main`? | **Blocks S16.** It sets where the shell is built and therefore the shape of the whole sprint. One shared chassis is more work and one coherent answer; leaving those two screens their own treatment is smaller and two answers. US-8 cannot be written as acceptance criteria until this is settled. |
| **N2** | What does the notice area show when there is nothing to say? | **Blocks S17.** *Recommendation: it holds the last notice, unlit and dimmed, so the reserved band is never meaningless ink.* The risk is real — a resolved error that stays visible can read as still true — and the alternative is a genuinely blank unlit row. Whichever is chosen, the quiet state must not fabricate reassurance: a permanent "nominal" that is not measuring anything is a lie the panel would be telling. |
| **N3** | What happens when several notices are outstanding at once? | **Blocks S17.** *Recommendation: show the most severe current notice with a count of the others, expanding to the full list.* The alternative — the area grows to list them all — is more honest and lets a bad minute eat the panel. Errors persist by design (§6.5), so two or three coexisting is the ordinary case, not an edge one. |
| **N4** | Does the notice area sit at the base of the chassis, or directly under the header? | **Blocks S16.** *Recommendation: the base.* It is furthest from a control anyone is aiming at, and it spends the empty chassis face that the 2026-09-01 finish record already recorded as unfinished ambition. Under the header is closer to where the eye starts, but 320px is already carrying a wrapped header plus two rows of nav, and that is the width with nothing to spare. |

**Consequence of N1 + N4 together:** they decide the shell's shape, and the
shell is the irreversible part of this epic — it changes how the whole app
scrolls. Answer both before S16 starts rather than discovering the second one
mid-sprint.

## Explicitly not in this epic

- A notification centre with history that survives a reload or a session.
- Unread counts or badges on the six function tabs.
- Sound.
- Web Push for incoming payments — impossible without a backend, and recorded in
  `PRODUCT.md` as permanently deferred rather than unbuilt.
