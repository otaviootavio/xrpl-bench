# `vaultKey` — what it is, and your three options

Written 2026-09-12. Nothing has been changed in `src/`. This is for you to read
and decide from.

## What `vaultKey` actually is

It is **not** your seed, and it is not the bytes of any key.

It is a browser object. When you unlock, the browser creates a key inside
itself and hands your code a handle to it. Your code can say "use this to
decrypt that", and the browser does it. But the handle is created
**non-extractable** (`src/lib/crypto/auth.ts:36`, the `false` argument), which
means the browser will never hand the raw bytes back — not to your code, not to
a debugger, not to anything. If something tried to write it into a text file it
would come out as `{}`.

So the seed itself never goes anywhere near the app state. What goes there is
permission to use a key, not the key.

## What the code does today

**In the app state.** `src/store/app-store.ts:22` declares `vaultKey: CryptoKey | null`.
It is set on unlock (`:77`) and cleared on lock (`:78-88`). Three places read
it: `src/pages/tabs/SendTab.tsx:36`, `src/pages/tabs/SettingsTab.tsx:34`, and
`src/hooks/useAutoLock.ts:36`. (`src/pages/Onboarding.tsx:46` has its own local
copy and does not use the store one until it commits.)

**Zustand never writes it to disk.** `partialize` at `app-store.ts:99-106`
lists exactly six non-secret fields, and `vaultKey` is not one of them. The
comments there are correct.

**But something else does write it to disk.** `src/lib/crypto/auth.ts` calls
`putUnlockedSession` at `:104`, `:204`, and `:220`, which stores the handle in
IndexedDB (`src/lib/crypto/db.ts:112-115`) with an expiry equal to your
auto-lock setting. `restoreSession()` (`auth.ts:211`) reads it back.
`endSession()` (`auth.ts:225`) deletes it, and `lock()` in the store calls it on
every lock path.

**This is the part that matters, and it is a separate decision from the first.**
Persisting the handle is what lets an unlock survive a page reload or a PWA
restart. Take it away and you re-unlock every time the app reloads.

## The honest security picture

A non-extractable handle in IndexedDB cannot leak your seed bytes to an
attacker who reads storage. That threat is genuinely closed.

It does not close a different one: **anything that can run JavaScript on your
origin during the session window can use that handle** to decrypt the seed,
without ever reading the key. Non-extractable means unreadable, not unusable.
Your defence against that is the origin itself — no third-party scripts, and the
user-controlled update rule that stops a compromised origin substituting signing
code silently.

So the size of the exposure is the length of the session window, which is your
auto-lock setting, and `useAutoLock.ts:53` extends it on activity.

## Your three options

### Option 1 — the code is fine; tighten the rule text

**Reading:** the rule means no seed and no readable key bytes. An unreadable
browser handle is not that.

**Code changes:** none.

**Doc changes:** one sentence in `docs/decisions.md` §4, saying a
non-extractable `CryptoKey` handle is permitted in session state and why. Worth
doing regardless of which option you pick — without it, the next agent reads §4
literally, sees `app-store.ts:22`, and "fixes" working code.

**What you give up:** nothing.

**What stays true:** the session survives a reload. The exposure window stays
the auto-lock period.

### Option 2 — take it out of the app state, keep reload survival

**Reading:** nothing key-shaped belongs in the app's shared state, even
unreadable. But surviving a reload is worth keeping.

**Code changes:** `vaultKey` leaves `app-store.ts` (the field, `unlock`, and the
`lock` reset). The three readers — `SendTab.tsx:36`, `SettingsTab.tsx:34`,
`useAutoLock.ts:36` — get it from a small accessor in `lib/crypto/auth.ts`
instead, backed by a module-scope variable. `unlocked: boolean` stays in the
store, because the UI genuinely needs to re-render on it and a boolean is not a
secret.

**Roughly:** four files, plus the lock/teardown paths re-checked.

**What you give up:** a little convenience. Components no longer re-render
automatically when the key appears; you would drive that off `unlocked`.

**What it actually buys you:** not much security. The handle still sits in
IndexedDB. This is a tidiness and rule-consistency move, not a hardening one.
Say so out loud if you pick it.

### Option 3 — take it out of both; re-unlock after every reload

**Reading:** the strictest one. No key handle in app state, and no key handle
persisted anywhere.

**Code changes:** everything in Option 2, plus `putUnlockedSession` /
`getUnlockedSession` / `clearUnlockedSession` come out of `db.ts`, and
`restoreSession` / `extendSession` come out of `auth.ts`. The `session` object
store disappears. `useAutoLock` stops extending a persisted expiry and only
drives the in-memory timer.

**Roughly:** six or seven files, and the auto-lock behaviour needs re-testing on
both a phone and a desktop, because the backgrounding rules
(`PRODUCT.md` § Operating Context) interact with it.

**What you give up:** the unlock no longer survives a reload. Every refresh,
every PWA cold start, every browser tab restore asks for the passkey or PIN
again. On a phone, where the OS kills backgrounded tabs freely, this is a
noticeable change in daily use.

**What it buys you:** the exposure window shrinks from your auto-lock setting to
the life of one page. That is a real reduction against a script-injection
attacker, and it is the only option of the three that changes the threat model
rather than the tidiness.

## What I would pick, and why

**Option 1, plus the doc sentence** — unless holding real Mainnet funds makes
you want Option 3's smaller window badly enough to re-unlock constantly.

Option 2 is the one I would avoid. It costs real work and buys almost nothing,
because it leaves the thing that actually sets the exposure window untouched.

If you want most of Option 3's benefit for none of its cost: drop the default
auto-lock from 5 minutes to 1. That shortens the same window, changes no
architecture, and is a settings default rather than a refactor.
