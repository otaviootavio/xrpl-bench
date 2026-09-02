# Anti-patterns — things that actually went wrong here

Every entry is a real incident in this repo, with the artefact that records it.
None are hypothetical. They are grouped by the shape of the mistake, because the
shape recurs even when the details do not.

## 1. Deriving instead of verifying

**What happened.** The first unlock implementation derived a key from the PIN and
trusted it. Any PIN "unlocked" the app. Separately, the PIN and the passkey each
derived their own unverified key, so only whichever method encrypted the seed
could ever actually work. *(§4, caught in live testnet validation.)*

**Later, the same shape again.** Vault metadata was rebuilt by spreading the
previous meta, carrying a stale passkey wrapper that wrapped a *previous* master
key. The passkey unwrapped successfully — valid auth tag — and decrypted nothing.
*(`src/lib/crypto/auth.ts:64`.)*

**The shape.** An operation that always succeeds is not a check. Ask what would
happen if the input were wrong, and make sure something actually fails.

## 2. Structure that exists visually but not semantically

**What happened.** `CardTitle` rendered a `<div>`, so the accessibility tree for
the entire app contained **zero headings** — six tabs of wallet data with no
outline. *(§6.4.)*

**Same shape, one level up.** After the redesign the only `<h1>` was the constant
product name in the header, so the outline read identically on all six tabs and
never said where you were. Fixed by giving each panel its own heading. *(§7.7.)*

**Same shape, inverted.** The trust-line Close control was *omitted* when a
balance was non-zero, so a holder saw no button and no explanation — while the
component's own `title` explaining why sat in unreachable dead code. Hiding a
control does not communicate why it is unavailable. *(§6.4.)*

## 3. Borrowing a token because its value looks right

**What happened.** Fill tokens were used as text colours. `text-warning` on a
card measured **2.15:1**; `text-success` 3.71:1; `text-destructive` on a tinted
alert 3.99:1 — against a 4.5:1 floor. The worst of them carried the warning that
a displayed payment amount was only an upper bound. *(§6.2.)*

**The shape.** The fix for a missing role is a token for that role, not the
nearest existing token. And the reason nobody noticed is that **nothing had ever
measured that pairing** — which is why `check:contrast` now exists and why
adding a token means adding its pairs.

## 4. Declaring behaviour that does not exist

**What happened.** `dialog.tsx` and `tooltip.tsx` carried `animate-in`,
`fade-in-0`, `zoom-in-95` classes. Neither `tailwindcss-animate` nor
`tw-animate-css` was installed, so every one of them resolved to nothing.
Dialogs had no animation at all. *(§6.10.)*

**Related.** A local copy of a shadcn primitive had silently dropped upstream's
height and width constraints, so at 200% zoom the Add-trust-line dialog put its
title at −8px and its submit 8px below the fold, with nothing scrollable —
both the confirm and the dismiss unreachable. *(§6.9.)* When you edit a
`components/ui/*` primitive, diff it against upstream and record what you
deliberately dropped: an unexplained omission is indistinguishable from a
mistake.

## 5. Verifying against a state that renders nothing

**What happened.** An entire interface review was conducted against a
single-wallet, unfunded test account. The header's wallet selector only renders
at two wallets — so with a second wallet present, the header row became
title + 160px + 112px + 36px, which does not fit 320px: the selects were crushed
together and the lock button was clipped off the right edge. Found during
verification of a *different* fix, not during the review. *(§6.12.)*

**Same shape, redesign.** A 320px check measured
`document.scrollWidth === clientWidth` and passed — while two of six navigation
tabs sat off-screen inside a horizontally scrolling child the document-level
measurement could not see. *(Found by the finish review, 2026-09-01.)*

**Also.** A screenshot cited as verification evidence turned out to be a
mid-load frame: the scale marks had not rendered and the token panel was still a
skeleton. It was passed to a reviewer as though it showed the finished state.

## 6. Diluting a reserved signal

**What happened.** `--commit` is reserved for controls that move funds. During
the redesign it was spent on the active-tab detent — caught and reverted before
shipping. Then, less obviously, the *adjacency* broke the reservation: two amber
alert washes at hue 72 sat beside the hue-42 commit key in the send-confirm
frame, and four saturated red fills — including a full-bleed bar — sat on the
Settings plate, louder than the commit key is ever allowed to be. *(§7.3.)*

**The shape.** A reservation is a property of the whole frame, not of a token.
Check what else is on screen at the moment the signal has to be unmistakable.

## 7. Over-correcting a fix into a new defect

**What happened.** Removing the amber field wash to protect the commit
reservation flattened `DESTINATION NOT ACTIVATED` to plate ground with a lamp —
no louder than body copy. On a wallet meant for real funds, "this payment will
fail to activate" had lost its salience in service of a colour rule. Resolved by
making alerts lit annunciator legends: salience *and* reservation. *(§7.3.)*

**The shape.** When a fix trades away something, name what it traded. If the
thing traded away was a warning about money, the trade was wrong.

## 8. Writing a rule and then breaking it

**What happened.** `badge.tsx` carries the comment "for 'is this thing currently
in state X' use `Lamp`, not a badge". The same session then shipped `Frozen by
issuer`, `Frozen by you`, and `Active` as stamped `Badge` fills, in two
different files.

**Also.** `.panel-scribe` was defined in the panel vocabulary and has **zero
call sites** — a device invented and never used, found by the documenter rather
than by its author.

**The shape.** After adding a rule, grep for its own violations before
finishing. After adding a vocabulary, check that every word in it is spoken.

## 9. Recommending a path without checking its preconditions

**What happened.** `/impeccable live` was recommended as the obvious next step
at the end of an `init` run. It refuses to boot without `DESIGN.md`, which did
not exist. The recommendation was made without running the thing being
recommended.

**The shape.** Do not route the owner somewhere you have not confirmed is open.

## 10. Solving a problem by quietly adding a server

**What happened.** Not a code incident — a decision the docs had to un-make.
§2 promised opt-in Web Push for incoming payments, which is unimplementable
under §1's no-backend architecture: Web Push needs a server to hold
subscriptions. The two decisions contradicted each other, and the Notifications
API was rejected as a middle path because it only fires while the tab is alive
— it does not deliver what was promised while implying that it does. *(§5.2.)*

**The shape.** When a feature seems to need a backend, that is a product
conversation, not an implementation detail. And a partial mechanism that implies
a guarantee it cannot keep is worse than an absence that is stated honestly.
