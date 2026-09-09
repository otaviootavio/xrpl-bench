# Mobile-Chrome Sprint Plan

Derived from a single field report (2026-09-09): on an Android phone in **dark**
mode, with XRPL Bench **installed to the home screen**, a pale band sits above
the app — the system status bar, painted `#e6eaef`, over a dark rack-steel
panel. The owner read it as "a white padding on top", which is exactly how it
looks: the app appears to start an inch down the screen behind a strip of
someone else's colour.

Finding IDs (`B*` — browser surfaces) are canonical and carried through from
that report.

> **STATUS: Sprint 1 completed 2026-09-09.** Verification at the bottom of this
> file, including what could *not* be verified from this machine.

## What is actually broken

Three defects, one root: **the colours we hand the browser for the surfaces we
did not draw are hand-typed hex literals that no gate measures, and the one the
installed app actually uses cannot vary by colour scheme.**

`docs/agents/ui-and-design-system.md` says the parts we did not draw still
belong to the panel. Three of them were left outside the token layer:

| ID | Where | Defect |
|---|---|---|
| **B1** | `vite.config.ts` `manifest.theme_color` | The reported bug. An installed PWA on Android takes its status-bar colour from the **manifest**, not from `<meta name="theme-color">` — and a manifest colour cannot carry a media query. We ship one unconditional *light* value, so every dark-mode install gets a pale band above a dark panel. |
| **B2** | `index.html` × 2, `vite.config.ts` × 2 | All four literals are stale. None of them matches `--background` in either finish any more, and nothing catches it. Dark is the worst: `#1c2026` is blue-grey, left over from before the dark panel became green-grey rack steel at hue 125. |
| **B3** | `vite.config.ts` `manifest.background_color` | Same light literal drives the PWA **splash screen**, so a dark-mode launch flashes pale enamel before the dark panel paints. Same two lines as B1, so it is fixed with it rather than filed for later. |

Measured against the tokens in `src/index.css`:

| Surface | Shipped literal | `--background` actually is |
|---|---|---|
| light | `#e6eaef` | `oklch(0.918 0.01 250)` → `#dfe5ea` |
| dark | `#1c2026` | `oklch(0.214 0.009 125)` → `#181a15` |

## Steps to find the source

Written as what was actually done, in order, so the next person can re-run it.
Steps 1–4 need no phone.

1. **Read the screenshot for what the band contains.** It holds the clock, the
   Spotify chip, the wifi and battery glyphs. That makes it the Android status
   bar, not padding inside the app — so no amount of reading `ChassisShell` or
   `AppHeader` will find it. This step is the whole diagnosis; skipping it sends
   you into the layout for an hour.

2. **Establish the two facts the screenshot cannot tell you.** Ask the owner:
   *installed to the home screen, or a browser tab?* and *is the phone in light
   or dark mode?* The answers were **installed** and **dark**. The second is the
   discriminator — under `prefers-color-scheme`-only theming (§6.1), a
   light-mode phone rendering a dark app would have meant a different bug in a
   different file.

3. **Grep for who sets the colour.**

   ```
   grep -rn "theme-color\|theme_color\|viewport-fit\|safe-area" src public index.html vite.config.ts
   ```

   Four hits, all literals: two media-scoped `<meta>` tags in `index.html`, and
   `theme_color` / `background_color` in the `vite.config.ts` manifest. Nothing
   writes the meta tag at runtime, and there is no `viewport-fit`/`safe-area`
   anywhere — which rules out the safe-area hypothesis before you spend on it.

4. **Reproduce the drift locally, in a plain browser tab.** No device needed:

   ```
   bun run build && bun run preview --port 4173
   ```

   then in the page, compare what the browser resolves against what it renders:

   ```js
   const metas = [...document.querySelectorAll('meta[name="theme-color"]')]
     .map((m) => ({ content: m.content, media: m.media, matches: matchMedia(m.media).matches }))
   ;({ applied: metas.find((m) => m.matches).content,
       bodyBg: getComputedStyle(document.body).backgroundColor })
   ```

   In light mode this returns `applied: '#e6eaef'` against
   `bodyBg: oklch(0.918 0.01 250)` — i.e. `#e6eaef` vs `#dfe5ea`. **B2 is
   provable on a laptop, in the finish that is not even the reported one.**
   Convert the oklch tokens with the function already in
   `scripts/check-contrast.mjs`; do not eyeball hex against oklch.

   **Unregister the service worker first.** `bun run preview` serves the fresh
   `dist/`, but the SW serves the *precached* shell, so the page will hand you
   the pre-fix `#e6eaef` and you will conclude your edit did nothing. That is
   the app working exactly as designed (§8.8: a new worker installs and waits).
   `navigator.serviceWorker.getRegistrations()` → `unregister()`, clear
   `caches`, reload.

5. **Read the built manifest, not the source.** `cat dist/manifest.webmanifest`
   shows `"background_color":"#e6eaef","theme_color":"#e6eaef"` — one flat light
   value shipped to the installer, with no mechanism by which a dark-mode device
   could ever receive anything else. That is B1 and B3, in one line of output.

6. **Confirm the precedence rule** rather than assuming it. Chrome's own docs
   state the manifest `theme_color` brands the launched-from-home-screen app,
   and it is a long-standing tracked defect that an installed PWA does not
   follow a `prefers-color-scheme` meta override — Chromium issues
   [40634649](https://issues.chromium.org/issues/40634649) ("Theme-color isn't
   applied when in dark mode for PWA's") and
   [40759522](https://issues.chromium.org/issues/40759522). This is the step
   that decides the fix: if the meta tag *could* win in an installed app, the
   fix would be a runtime meta write and the manifest could stay light.

7. **Reproduce end-to-end only if you still doubt it** — the one step that needs
   hardware. Serve the production build, forward the port so the phone treats it
   as a secure context (`chrome://inspect/#devices` → Port forwarding, or
   `adb reverse tcp:4173 tcp:4173`), install to the home screen, set the phone
   to dark, and launch from the icon. A desktop stand-in for the same mechanism:
   install the PWA in desktop Chrome and watch the *window title bar* take the
   manifest colour and ignore the page's dark meta tag.

## Steps to fix

8. **Point every literal at the tokens.** `#dfe5ea` for light, `#181a15` for
   dark — `--background` in each finish, converted with the function in
   `check-contrast.mjs`. This alone fixes B2, in both finishes, everywhere.

9. **Make the bar follow the finish, in the one form an installed app
   honours.** The obvious fix — leave the two media-scoped `<meta>` tags and
   accept a single baked manifest colour — would have made the status bar a
   constant, wrong in one finish whichever value was chosen. It does not have
   to be. Chrome ignores the `media` *attribute* in an installed PWA, but it
   does repaint when JavaScript rewrites a theme-color tag. So `index.html`
   now replaces both static tags with one synchronous `<head>` script that
   creates a single tag, sets it from
   `matchMedia('(prefers-color-scheme: dark)')`, and re-applies it on
   `change` — responsive in a browser tab *and* in an installed app, and it
   follows a live OS switch rather than only the value at boot.

   Synchronous and in `<head>` so it settles before first paint and does not
   depend on the bundle loading.

10. **Bake the dark value into the manifest as the floor.** `theme_color` and
    `background_color` → `#181a15`.

    The manifest still matters for two moments the script cannot reach: the
    splash screen, which paints before any of our code runs (B3), and any
    engine that ignores a scripted theme-color entirely. One value has to serve
    both finishes there, and dark is chosen because the two failure modes are
    not symmetric — a pale band above a dark panel reads as broken chrome, which
    is what was reported, while a dark strip above the pale enamel reads as the
    chassis the panel is racked into. With step 9 in place this is a fallback,
    not the primary fix; reversing it is one line in `vite.config.ts`.

11. **Put the literals under a gate**, per standing behaviour #4 — an unmeasured
    token is a token outside the rule. `scripts/check-contrast.mjs` already
    parses the oklch tokens out of `src/index.css` and converts them to sRGB, so
    it is the only place in the repo that knows the sRGB truth of a token.
    Extend it to read the four literals out of `index.html` (the `LIGHT` and
    `DARK` vars in the head script) and `vite.config.ts` and assert each equals
    the `--background` it stands for. Duplicating the
    colour-space conversion into a Vitest file instead would be a second
    convention for one concept.

    The cost of a text gate: the four literals must stay **lowercase
    six-digit hex, single-quoted**, as `LIGHT`/`DARK` vars in `index.html` and
    as `theme_color`/`background_color` keys in `vite.config.ts`. Hoisting them to a
    shared constant, or writing `#181A15`, makes the regex miss and the gate
    print `NOT FOUND` — it fails safe, but the next person deserves to know
    why rather than rediscovering it.

12. **Do not add `viewport-fit=cover`.** Out of scope and actively wrong here:
    it makes the page extend *under* the status bar, which changes the problem
    rather than solving it, and it would then need `env(safe-area-inset-top)`
    padding on `ChassisShell` interacting with `h-dvh` — unverifiable from this
    machine. Filed here so the next person does not rediscover it as an idea.

**Done when:** `bun run check:contrast` fails if any of the four literals drifts
from `--background`; the page carries exactly one `theme-color` tag, written by
the head script, whose value equals the rendered `body` background; the built
`dist/manifest.webmanifest` carries `#181a15`; and a dark-mode home-screen
install shows a status bar continuous with the header, which is `bg-background`.

**Risk:** the only step that cannot be verified without an Android device is the
one the owner reported. Steps 4, 5 and 10 are mechanical and were run; step 7
was not. Say so rather than implying the phone was tested.

## Out of scope, reported not fixed

Standing behaviour #5. Noticed in the same screenshot, deliberately untouched:

- The annunciator band at the base of the screenshot renders as a dashed empty
  rectangle. That is the reserved notice band (§9.1, N1) with nothing in it,
  which is by design — but whether an empty reserved band should be *visible*
  as a dashed outline on a phone, where it costs a sixth of the viewport, is a
  question this sprint did not ask and did not answer.

## Verification

Run on 2026-09-09, on Linux, against the production build.

| Check | Result |
|---|---|
| `bun run lint` | pass |
| `bun run build` | pass |
| `bun run test` | pass |
| `bun run check:contrast` | pass, including the four new browser-surface assertions |
| Gate actually bites | verified by hand twice — before and after the literals moved into the head script, reverting one makes `check:contrast` exit non-zero |
| `dist/manifest.webmanifest` | carries `#181a15` for both `theme_color` and `background_color` |
| Head script emits one tag | verified live: exactly one `meta[name=theme-color]`, no `media` attribute, created by the script |
| Browser tab, **light** | verified live: the script-written theme-color (`#dfe5ea`) equals the rendered `body` background exactly |
| Browser tab, **dark** | verified indirectly. Chrome's own sRGB conversion of `oklch(0.214 0.009 125)` returns `#181a15`, equal to the dark literal — but the page was never *rendered* under a dark OS preference, so this is the token matching the literal, not an observed status bar |
| Live scheme switch | **not verified.** The `change` listener is wired but the OS preference could not be toggled from this machine; only the boot path was observed. |
| **Android home-screen install** | **not verified — no device on this machine.** The fix follows from the precedence rule in step 6 and from Chrome honouring scripted theme-color updates, not from observation. |
