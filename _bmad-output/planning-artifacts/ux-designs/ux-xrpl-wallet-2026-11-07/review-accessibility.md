# Accessibility review: Offline Signing UX (2026-11-07)

Reviewed: `EXPERIENCE.md`, `DESIGN.md` (delta), repo-root `DESIGN.md`,
`docs/agents/ui-and-design-system.md`, every mock in `mockups/`, and the
components the spine inherits: `QrScanner.tsx`, `QrCode.tsx`,
`MasterKeyControl.tsx`, `useAutoLock.ts`, `lib/crypto/policy.ts` and
`TwoDeviceSign.tsx`. Measured against WCAG 2.2 AA. AAA is noted where it helps.
The approved texts in `consequence-texts.md` are treated as fixed. Every
suggestion below is about layout, structure, markup or behaviour, never new
words for those texts. Mock-only slips are filed no higher than low, because the
spines win.

## Overall verdict

**Not ready to build as written. Fix the three high findings in the spine
first.** The visual layer is sound:

- Kind, Was-online, check results and outcomes are always words. Colour never
  carries meaning alone.
- No colour token is added, so `check:contrast` still covers light and dark.
- Hit areas inherit the 44px coarse-pointer floor.
- Every money-moving step has a review and a confirm (3.3.4).
- The approved texts stay uncollapsed.

The gaps are in behaviour over time and across the two devices:

1. **Timing.** The round races the auto-lock and the screen sleep, and a lock
   erases the Build that the recovery path depends on. The spine takes no
   position on 2.2.1.
2. **The non-camera fallback.** The spine names paste as the fallback, but paste
   cannot work across an air gap.
3. **Screen-reader announcements.** The spine specifies focus-to-heading and
   refusal alerts only. The asynchronous outcomes that decide whether a user
   pays twice are unspecified.

## Findings

### Time limits

- **[high]** The round has an unaddressed time limit, and a lock destroys the
  user's place in it (EXPERIENCE §Interaction Primitives "Lock is final",
  §State Patterns "Locked at any point"; WCAG 2.2.1 Timing Adjustable, 2.2.6
  Timeouts AAA, 2.2.5 Re-authenticating AAA).
  - On a coarse pointer, `useAutoLock` locks immediately when the page is
    backgrounded.
  - In a two-phone round, the idle phone's screen sleeps while the user works
    the other phone. That sleep hides the page, which locks the wallet, which
    erases the kept Build and the request ID. The signed QR also disappears.
    "Start the request again" then has nothing to restart.
  - The inactivity timer has the same effect. The default is 5 minutes
    (`DEFAULT_AUTO_LOCK_MINUTES`) and the maximum is 30
    (`AUTO_LOCK_CHOICES`), so the range does not reach the 10× of the default
    that 2.2.1's "Adjust" option needs. No warning comes before the lock.
  - The signing window is "about 10 minutes" on the Offline-builds route,
    which is longer than the default auto-lock. On the Transmitter-builds
    route the mock shows "Window: 18 ledgers", about 1 minute 12 seconds,
    spread over two scans, a full field-list review and a Signing Check. A
    screen-reader user who listens to every field and W-text, or a user with a
    tremor aiming a camera, will often run out of time.
  - The spine never states its 2.2.1 position.

  *Fix:*
  - (a) Record the position in §Accessibility Floor. The ledger window is an
    essential limit, because it bounds how long a signed blob is dangerous
    (P-24). The remedy is a one-action restart with nothing re-typed. The
    auto-lock is not essential to the round.
  - (b) While a QR hand-off plate or scan plate is on screen, hold a Screen
    Wake Lock, so screen sleep cannot hide the page and lock the wallet.
  - (c) While a round is in progress (Request shown to Signed), do not let the
    inactivity timer erase the Build without warning. Warn at least 20 seconds
    before the lock and offer one key to keep the wallet open, or pause the
    timer while a QR plate or scan plate is up.
  - (d) On the Transmitter-builds route, let the user choose a longer window
    before the Unsigned Transaction is made. P-15 already carries the warning
    for that.
  - (e) Show P-13 and P-12 as clock times as well as ledger counts. "About 10
    minutes after 14:02" already does this; give "Window: {n} ledgers" the same
    treatment. Use static text, not a ticking countdown, so a screen reader is
    not flooded with updates.

### The camera scanner and the fallback

- **[high]** The paste fallback cannot work between an offline phone and an
  online phone, so a user who cannot aim a camera has no path
  (EXPERIENCE §Interaction Primitives "the paste field is the fallback";
  DESIGN §Scan plate; §Accessibility Floor "the payload itself is not read
  out"; WCAG 2.1.1 Keyboard, 1.1.1 Non-text Content, and 2.5.1/2.5.7 in
  spirit).
  - Text B tells the user to turn off Wi-Fi, mobile data and Bluetooth, so no
    clipboard can cross between the two devices.
  - The QR plates offer no text form of the payload.
  - Paste therefore only works when both wallets are on one device, which P-8
    warns against. Otherwise the only route is to hand-type a blob of several
    hundred characters that the user cannot see.
  - The spine presents paste as an equivalent path. It is not one.

  *Fix:*
  - (a) Say plainly in the spine that the QR is the only practical channel, and
    design for camera use that needs little aiming skill:
    - Scan continuously, with no press per attempt.
    - On the showing device, a "fill the screen with the code" view at maximum
      size.
    - The showing device can lie flat, and the scanner is held over it, so no
      orientation is forced (1.3.4).
    - A haptic pulse and a polite status as soon as a code is read.
  - (b) Offer an optional text view of the payload on every hand-off plate. Put
    it in the data face, split into short numbered groups. It serves users who
    can type but cannot aim, and a desktop Transmitter where the phone is held
    to a fixed webcam.
  - (c) Keep the paste field, for the single-device test case.

- **[medium]** The scanner gives no feedback for a code it ignores, and it does
  not stay ready after a refusal (DESIGN §Scan plate "the scanner stays
  mounted, so a second try needs no extra press"; EXPERIENCE §Scan plate
  "the scanner stays ready"; WCAG 4.1.3 Status Messages, 3.3.1 Error
  Identification).
  - Today's `QrScanner` silently skips any code without the `xrplbench:`
    prefix. A user who points it at the wrong code hears and feels nothing.
  - On any hit, `QrScanner` stops the camera before it hands the payload up.
    After a P-36 or P-16/P-17 refusal, the user must press the camera key
    again, which contradicts both spines.
  - The `<video>` element has no accessible name.

  *Fix:* when a scan is refused, leave the camera running, or say in the spine
  that a second press is needed. Announce a foreign code with a polite status
  ("This is not a code from XRPL Bench"; a proposed string). Name the video
  region from the plate's label.

- **[medium]** The paste textarea has a hard-coded `id="qr-paste"`
  (`QrScanner.tsx`; WCAG 1.3.1 Info and Relationships, 4.1.2 Name, Role,
  Value).
  - The Request-shown state and the Unsigned-QR state each pair a QR plate with
    a scan plate, and the Transmit tab may coexist with a second scanner. If
    two scanners mount at once, the ids collide and a label can point at the
    wrong field.

  *Fix:* use `useId()` in `QrScanner`.

### Screen-reader announcements and focus

- **[high]** The asynchronous state changes that decide money outcomes have no
  specified announcement (EXPERIENCE §Interaction Primitives "Focus",
  §Transmitter answer, §Transmit step "Outcomes"; WCAG 4.1.3 Status Messages,
  2.4.3 Focus Order).
  - The spine covers only "a new task-screen state moves focus to its heading"
    and "a refusal Alert is role=alert". It leaves these unspecified:
    - The Transmitter's "Checking {address} on {Network}" turning into
      Answered, a check refusal, or P-28.
    - The Transmit step outcomes: Validated, Unknown, "Expired. Nothing was
      sent.", P-23 "Probably sent before", and P-26 under "Not sent."
    - P-34 "Nothing was signed." after Do not sign.
    - P-24 appearing after Copy.
    - P-20 appearing after a scan, which signs nothing and waits for a choice.
    - The camera turning on and off.
  - "Unknown" versus "Validated" is the fact the retry and double-pay logic
    hangs on, and a screen-reader user must hear it.
  - `TwoDeviceSign.tsx` already uses `role="status"` for "Checking and
    sending…" and the outcome, so the pattern exists and should be inherited
    explicitly.

  *Fix:* add an announcement table to §Accessibility Floor:
  - Progress ("Checking…", sending) goes in a polite `role="status"`.
  - Each outcome is moved into by focus to its outcome heading. Validated,
    Unknown, Expired and Probably sent before each get a heading or focusable
    legend, because a polite region can be cut off by the next screen.
  - Only refusals use `role="alert"`. Caution warnings (W1–W5, consequence
    WARNINGs, risky-field cautions) are static and must never be `role="alert"`
    on mount, or opening a review will shout every warning at once.
  - After a scan, focus must never land on the orange Send key. It lands on the
    Transmit step heading, so the checks and fields come before Send in the
    reading order.

- **[high]** Focus-to-heading on the signing review skips the safety statement
  "You are signing for Mainnet" (EXPERIENCE §Signing review, §Accessibility
  Floor; mocks `key-route-*`, `key-retry`, `key-warnings`; WCAG 2.4.3 Focus
  Order, 1.3.2 Meaningful Sequence).
  - In every mock, the signing-network well comes before the first heading
    ("Transaction"). If "focus to heading" lands on "Transaction", a
    screen-reader user starts after the Network statement and the window and
    never hears them unless they read backwards. That statement is the one
    OS-FR-16 puts in large type.
  - The mocks give the well `role="group"` with an `aria-label`. Its children
    ("Network", "You are signing for", "Mainnet") are then read again after
    the group name.

  *Fix:*
  - Give the signing review a heading that comes *before* the well, and move
    focus there. The task-screen h1, or the well's own "Network" legend marked
    as a heading, both work.
  - Build the well as one text node for the fixed string, with two spans styled
    onto two lines. Drop the `aria-label` on a generic container, and hide the
    decorative legend from assistive technology if it repeats the string.

- **[medium]** Focus is lost when the Signing Check dialog closes (EXPERIENCE
  §State Patterns "Sign → Signing Check" then Signed; WCAG 2.4.3 Focus
  Order).
  - The dialog returns focus to its trigger, the Sign key. That key no longer
    exists in the Signed state, so focus falls to `<body>`.
  - The same happens after the typed confirm for "Change to an online wallet"
    and "Turn off the master key", whose screens are replaced by the round or
    the result.

  *Fix:* say in the spine that when a confirm dialog's trigger unmounts, the
  dialog's close sends focus to the new state's heading ("Signed transaction")
  through `onCloseAutoFocus`, not to the trigger.

- **[medium]** Choosing a kind radio swaps the consequence text, and the swap is
  not exposed (EXPERIENCE §Kind radios "Choosing one shows its text in place.
  Switching resets that text's acknowledgements"; WCAG 1.3.1, 3.2.2 On
  Input, 4.1.3).
  - Arrow keys move the selection in a native radio group. Arrowing from
    Offline to Online and back replaces Text B and silently clears both ticks.
  - A screen-reader user on the radios hears none of this. Tab then jumps from
    the radios to the first checkbox and skips the six plain lines.

  *Fix:*
  - Put the consequence block in a region named by the checked option, for
    example `<section aria-labelledby>` pointing at the radio label, right
    after the group.
  - Point the group's `aria-describedby` at it.
  - When ticks are reset, announce it politely, or reset only when the kind
    actually changes. Re-selecting the same kind should not reset.

- **[low]** The QR alt text exists in the spine but not in the code
  (§Accessibility Floor "QR code: data to sign needed, Mainnet"; WCAG
  1.1.1).
  - `QrCode.tsx` hard-codes `"QR code carrying a signing payload"` for every
    payload.
  - The spine's per-payload, per-Network alt needs a new prop. The mocks
    already show the right values.

  *Fix:* add an `alt` (or payload plus Network) prop to `QrCode`. Consider
  adding the scan count ("scan 1 of 3"), so a screen-reader user can match the
  same code on both devices, which the spine relies on for sighted users.

### Acknowledgement checkboxes

- **[medium]** The checkboxes cannot be told apart by name (EXPERIENCE
  §Consequence block, §Accessibility Floor "labelled by P-6 and described by
  its warning"; WCAG 2.4.6 Headings and Labels, 1.3.1, 2.5.3 Label in Name).
  - Text B produces two checkboxes on one screen, both named "I read this
    warning.". In a form-control list and under Voice Control or Voice Access
    ("tap I read this warning"), they are identical.
  - `aria-describedby` helps only users who have hints turned on.

  *Fix:*
  - Name each box with `aria-labelledby="<P-6 id> <warning-lead id>"`. The
    second id points at the warning's own bold lead sentence, for example
    "WARNING: The app cannot make your device offline.".
  - These are the approved words reused verbatim, not reworded. The visible
    label stays first, so 2.5.3 holds.
  - Keep `aria-describedby` for the rest of the warning body.

- **[medium]** The disabled Next key does not point at its reason, and pressing
  it does nothing (EXPERIENCE §Consequence block; WCAG 3.3.1, 4.1.2).
  - P-7 is visible text, but the spine does not tie it to the key.
  - Pressing an `aria-disabled` key silently does nothing.

  *Fix:*
  - Put `aria-describedby` on Next pointing at P-7, as `MasterKeyControl`
    already does for its held key.
  - When Next is pressed while disabled, move focus to the first unticked box.

- **[low]** The two spines give P-6 different words: EXPERIENCE says "I read
  this warning.", DESIGN §Consequence block says "I have read this warning".
  The mocks follow EXPERIENCE.

  *Fix:* make the DESIGN delta match P-6 exactly.

### Cognitive load of the long texts (layout only, no rewording)

- **[medium]** Quiz step 1 carries too much on one screen at 320px (EXPERIENCE
  §Surfaces "Create/Import quiz, step 1"; WCAG 1.3.1, and 3.3.2 Labels or
  Instructions in spirit).
  - With Offline chosen, step 1 holds Create/Import, the kind radios, Text B
    (six lines and two warnings), two checkboxes, Label, Network and, on
    Import, Text E and the Seed.
  - At 200% text this is many screens tall. Next, with its P-7 reason, sits far
    below the checkboxes it depends on.
  - The rest of the quiz is one question at a time (FR-91).

  *Fix:* split step 1 at the kind choice, as a layout change with no new words.
  Create or Import and the kind with its consequence block form one step.
  Label and Network form the next. Text E goes with the Seed field. The words
  and their order are unchanged.

- **[medium]** The bold lead sentence of each WARNING is lost in the mocks, and
  the long alerts run as one paragraph (DESIGN §Consequence block;
  `consequence-texts.md` "Bold marks a warning line"; mocks
  `key-create-kind-step`, `key-change-kind`; WCAG 1.3.1).
  - The source marks the first sentence of each WARNING as bold, and that
    emphasis is the scanning cue. The mocks render the whole alert body as
    plain text.
  - Text E is seven sentences in one block.

  *Fix:*
  - Render the lead sentence as `<strong>`, so the emphasis is also semantic.
  - Inside a long WARNING alert, set each sentence on its own line, or as list
    items, without changing a word.

- **[medium]** Sentence-length approved strings are set in tracked capitals
  (mocks: `.title` / `.legend` on "Data to sign needed", "Online wallet or
  offline wallet?", "Sign a transaction from your Transmitter", "Change to an
  offline wallet", "This key signs for another account", "Send it to the
  ledger?"; DESIGN delta Don't "uppercase any approved string"; house rule on
  `text-transform`).
  - The placard face is uppercase. Applied to whole approved sentences, it
    breaks the delta's own rule.
  - Long runs in capitals are slower to read for people with dyslexia or low
    vision.

  *Fix:* for a title that is a sentence or question, use a sentence-case
  heading in the body face at legend size. Keep the uppercase placard for
  one- or two-word legends only.

- **[medium]** A user-authored or case-sensitive string sits inside an
  uppercase legend (mock `key-warnings`: `<h2 class="legend">Key state of
  rPT1Sjq2YG…`; EXPERIENCE §Transmitter answer "Checking {address} on
  {Network}"; P-30 "the wallet {name}"; house rule "never uppercase
  user-authored text").
  - An XRPL address is case-sensitive base58. Uppercasing it shows a different
    string, and a screen reader may spell it out.
  - A truncated address in a heading also defeats verification.

  *Fix:* in the spine, say that any title holding an address or a Wallet name
  is set in the data face (address) or the body face (name), never in the
  placard face. Show the address in full and let it wrap.

- **[low]** In the W-text mocks, the W title runs into the body (`key-warnings`:
  "A black-hole address Nobody holds the key…").
  - A screen reader reads this as one run-on sentence with no boundary.

  *Fix:* decide whether the W titles are user-facing. If they are, give each
  its own line or element inside the alert. If not, drop them from the alert.

### Motor access

- **[medium]** "The result is known" and "Cancel this transaction" erase the
  kept Build with one press, right next to "Start the request again"
  (EXPERIENCE §Kept Build plate, P-18; mock `key-route-offline-builds`; WCAG
  3.3.4 Error Prevention (Legal, Financial, Data), 2.5.8 Target Size).
  - The three outline keys sit side by side, and two of them destroy the only
    restart anchor for a payment whose fate may be Unknown.
  - The 44px coarse-pointer floor holds, but a slip here is costly.

  *Fix:*
  - Stack the three keys full-width, with the restart key first and set apart.
  - Make the two erasing keys ask for confirmation, or offer an undo while the
    wallet stays unlocked.

- **[low]** "Typed or held confirm" is ambiguous (DESIGN delta §Components
  "Keys"; EXPERIENCE §Irreversible confirm "held key until typed"; WCAG
  2.1.1, 2.2.1, 2.5.7 Dragging Movements in spirit).
  - The code has no press-and-hold. "Held" means the key stays disabled until
    the phrase is typed.
  - If a timed press-and-hold were ever built, it would need a non-timed,
    keyboard-operable alternative.

  *Fix:* replace "held" with "disabled until typed" in the delta. Say that
  P-39 reuses `MasterKeyControl`'s normaliser (trim, collapse spaces, ignore
  case), `autoCapitalize="off"` and `autoCorrect="off"`. Without that, a
  phone keyboard turns "change to online" into "Change to online".

### Reflow and text size

- **[medium]** The signing-network word can overflow at 320px and 200% text
  (DESIGN delta `signing-network`, readout `clamp(2.25rem, 11vw, 5rem)`;
  §Accessibility Floor; WCAG 1.4.4 Resize Text, 1.4.10 Reflow).
  - The `2.25rem` floor scales with text size, so "Mainnet" in a mono face at
    about 72px is wider than the roughly 270px inside the well at 320px.
  - The readout was clamped so that a balance never wraps, but under text
    scaling it overflows instead.

  *Fix:* cap the size to the well's width (container query units, or a
  `min()` against the well's inline size), so the whole word always fits. Add
  320px at 200% text, and Android font scale 2.0, for all three Network labels
  to the browser verification pass.

- **[low]** The QR stays at its drawn size while the text grows (§Accessibility
  Floor "a QR plate keeps the code at its drawn size"; WCAG 1.4.10).
  - This is right for scanning.
  - Confirm that at 200% text the scan count and P-12 lines wrap under the code
    with no horizontal scroll, and that the plate's title (now possibly two or
    three lines) never pushes the code off the first screen.

### Colour and dark/light

- **[low]** Two amber stamps sit side by side with different meanings (chooser
  card `[Offline] [Was online] MAINNET [Real funds]`; WCAG 1.4.1 Use of
  Colour, which passes).
  - Both carry words, so this passes. The identical fill on adjacent stamps
    adds scanning effort, and "Was online" depends on its P-4 sentence for
    meaning.

  *Fix:* keep P-4 directly under the row, as specified. No token change is
  needed.

- **Passes, recorded.** Kind is a word on a neutral stamp, never a colour or a
  lamp. Transmit check rows ("Signature: correct", "exists", "given") are words
  in the text tokens. Alert tone is stated in the lit legend. Disabled keys
  carry a visible reason. No new token, so `check:contrast` covers both
  finishes. The QR's white plate is intentional and readable in the steel
  finish. Focus rings are untouched in every mock (no `:focus` or
  `outline-none`).

### Hidden controls

- **[low]** Some controls are left out rather than disabled (EXPERIENCE §Field
  list "the Sign key is not rendered"; §Retry (c) "This is a new payment" is
  not offered; Transmitter unsynced tab set; house rule "never hide a control
  to convey that it is unavailable").
  - The spine documents these as exceptions in the spec, and each has a visible
    reason (the refusal, or P-22).
  - On a refusal, keep "Do not sign" (P-34) rendered as the screen's single
    action, so focus has a landing point and the user has an explicit way out.
    The mock's refused frame has no key at all.

## Counts

critical 0 · high 4 · medium 12 · low 7
