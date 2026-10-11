import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { NetworkId } from '@/lib/xrpl/networks'

/** Seed Method (FR-62). Only `stored` exists until a later story. */
export type SeedMethod = 'stored'
/** `unresolved` until the first decryption derives it from the Seed itself and
 * checks it against the stored address — never guessed (AD-18). */
export type SeedAlgorithm = 'ed25519' | 'secp256k1' | 'unresolved'
/** `either` is a legacy Wallet whose app-wide unlock accepts a PIN or a
 * passkey (AD-25). */
export type OpenCheck = 'pin' | 'passkey' | 'either'
export type SigningCheck = 'standard' | 'passkey' | 'pin'

/** A Wallet is a view `(walletId, network)` over one Seed record (AD-18). */
export interface WalletView {
  walletId: string
  network: NetworkId
}

/** A Seed record. `id` is the Seed id and, for the first view, also its
 * walletId, so a persisted `activeWalletId` keeps working. Everything after
 * `createdAt` is additive and optional: a record written by a build before
 * story 12.1 has none of it, and an older build ignores all of it. */
export interface StoredWallet {
  id: string
  label: string
  address: string
  encryptedSeed: { ivB64: string; ciphertextB64: string }
  createdAt: number
  seedMethod?: SeedMethod
  algorithm?: SeedAlgorithm
  lockId?: string
  openCheck?: OpenCheck
  signingCheck?: SigningCheck
  views?: WalletView[]
}

/** `lock:<id>` in the `vault` store. Holds the derivation inputs a lock's keys
 * are made from (AD-21) and its auto-lock window. Holds no key and no Seed. */
export interface LockRecord {
  key: string
  id: string
  hkdfInfo: string
  prfSaltB64: string
  pbkdf2: { iterations: number; hash: 'SHA-256'; keyBits: number }
  autoLockMinutes: number
  createdAt: number
}

export const LEGACY_LOCK_ID = 'legacy'
export const lockKey = (id: string) => `lock:${id}`

// The vault has one random "master key" that actually encrypts every stored
// seed. It is never stored in the clear — only wrapped (encrypted) once per
// unlock method, so either method can unwrap the SAME master key. Without
// this, PIN and passkey would each derive their own independent key and
// only whichever one was used at setup time could ever decrypt anything
// (a real bug caught during live testing: the other method appeared to
// "unlock" but was silently deriving a key that couldn't decrypt anything).
export interface VaultMeta {
  key: 'vault'
  passkeyCredentialIdB64?: string
  pinSaltB64?: string
  wrappedMasterKeyForPin?: { ivB64: string; ciphertextB64: string }
  wrappedMasterKeyForPasskey?: { ivB64: string; ciphertextB64: string }
  failedAttempts: number
  lockedUntil?: number
}

// Lets an unlocked session survive a page refresh without re-prompting for
// a PIN/passkey. `masterKey` is stored as the actual non-extractable
// CryptoKey object (IndexedDB supports structured-cloning CryptoKey
// natively) — the raw bits are never exposed, so this is not the same risk
// class as writing a secret to localStorage/sessionStorage. Expires with
// the same auto-lock window as normal inactivity locking, and is cleared on
// every lock path (manual lock, auto-lock timeout, backgrounding, wallet
// removal) — see lib/crypto/auth.ts and store/app-store.ts.
export interface UnlockedSession {
  key: 'session'
  masterKey: CryptoKey
  expiresAt: number
}

interface WalletDB extends DBSchema {
  wallets: { key: string; value: StoredWallet }
  vault: { key: string; value: VaultMeta | LockRecord }
  session: { key: string; value: UnlockedSession }
}

let dbPromise: Promise<IDBPDatabase<WalletDB>> | null = null

// IndexedDB, never localStorage/sessionStorage — see docs/decisions.md
// guardrail #3. Only ciphertext (or a non-extractable CryptoKey) is ever written here.
export function getDb(): Promise<IDBPDatabase<WalletDB>> {
  if (!dbPromise) {
    const promise = openDB<WalletDB>('xrpl-wallet-vault', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('wallets', { keyPath: 'id' })
          db.createObjectStore('vault', { keyPath: 'key' })
        }
        if (oldVersion < 2) {
          db.createObjectStore('session', { keyPath: 'key' })
        }
      },
      // A version bump (e.g. adding the `session` store here) hangs forever
      // if another tab/document still holds an open connection at the old
      // version and nothing tells it to close — a classic multi-tab
      // IndexedDB gotcha, caught live: a second tab open to the app froze
      // every IndexedDB-backed operation (including the whole unlock/onboard
      // flow) waiting on a versionchange transaction that never completed.
      // `blocking` makes THIS connection close itself if it's the one in
      // the way of some other tab's upgrade; clearing `dbPromise` makes the
      // next call reopen a fresh connection instead of reusing the closed one.
      blocking() {
        dbPromise = null
        promise.then((db) => db.close())
      },
      terminated() {
        dbPromise = null
      },
    })
    dbPromise = promise
  }
  return dbPromise
}

export async function getVaultMeta(): Promise<VaultMeta> {
  const db = await getDb()
  const existing = (await db.get('vault', 'vault')) as VaultMeta | undefined
  return existing ?? { key: 'vault', failedAttempts: 0 }
}

export async function putVaultMeta(meta: VaultMeta): Promise<void> {
  const db = await getDb()
  await db.put('vault', meta)
}

export async function listStoredWallets(): Promise<StoredWallet[]> {
  const db = await getDb()
  return db.getAll('wallets')
}

export async function putStoredWallet(wallet: StoredWallet): Promise<void> {
  const db = await getDb()
  await db.put('wallets', wallet)
}

export async function deleteStoredWallet(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('wallets', id)
}

/** What the legacy Open Check is today: `either` if a passkey is registered
 * (credential id and wrapper both present), else `pin`. */
export async function legacyOpenCheck(): Promise<OpenCheck> {
  return openCheckOf(await getVaultMeta())
}

/** The one statement of the rule: a passkey is registered only when its
 * credential id and its wrapper are both present. */
function openCheckOf(meta: VaultMeta | undefined): OpenCheck {
  return meta?.passkeyCredentialIdB64 && meta.wrappedMasterKeyForPasskey ? 'either' : 'pin'
}

/**
 * Reads one Seed record, applies `change`, and writes the result back in ONE
 * transaction — `null` deletes the record. The only way keystore edits a
 * record after it exists, so a field change never races another and the
 * ciphertext in the record read is the ciphertext written.
 */
export async function mutateStoredWallet(
  id: string,
  change: (current: StoredWallet) => StoredWallet | null,
): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('wallets', 'readwrite')
  const done = tx.done
  done.catch(() => {})
  const current = await tx.store.get(id)
  if (!current) {
    await done
    return
  }
  const next = change(current)
  if (next) await tx.store.put(next)
  else await tx.store.delete(id)
  await done
}

export interface LegacyMigrationInput {
  network: NetworkId
  autoLockMinutes: number
  hkdfInfo: string
  prfSaltB64: string
  pbkdf2Iterations: number
}

/**
 * AD-27: every Seed record written by a build before per-Wallet locks joins
 * one `lock:legacy` record and gains its additive fields. Nothing is
 * re-encrypted and no key material is touched or held.
 *
 * One transaction over `wallets` and `vault`: it commits whole or not at all,
 * so a crash leaves every Wallet openable exactly as before. Writes nothing
 * when no record lacks `views` and the lock exists (re-run), or the vault is
 * empty. A record that already carries `views` is left alone; an already
 * resolved `algorithm` is kept.
 *
 * Returns true only if it wrote.
 */
export async function migrateLegacyVault(input: LegacyMigrationInput): Promise<boolean> {
  const db = await getDb()
  const tx = db.transaction(['wallets', 'vault'], 'readwrite')
  const done = tx.done
  done.catch(() => {})
  try {
    const lockExists = !!(await tx.objectStore('vault').get(lockKey(LEGACY_LOCK_ID)))
    const all = await tx.objectStore('wallets').getAll()
    // A record without `views` is pending, even when the lock exists: a build
    // rolled back to before this story can add one after the first migration.
    const pending = all.filter((w) => !w.views)
    if (pending.length === 0 && (lockExists || all.length === 0)) {
      await done
      return false
    }
    const openCheck = openCheckOf((await tx.objectStore('vault').get('vault')) as VaultMeta | undefined)
    for (const w of pending) {
      await tx.objectStore('wallets').put({
        ...w,
        seedMethod: 'stored',
        algorithm: w.algorithm ?? 'unresolved',
        lockId: LEGACY_LOCK_ID,
        openCheck,
        signingCheck: 'standard',
        views: [{ walletId: w.id, network: input.network }],
      })
    }
    if (!lockExists) {
      const lock: LockRecord = {
        key: lockKey(LEGACY_LOCK_ID),
        id: LEGACY_LOCK_ID,
        hkdfInfo: input.hkdfInfo,
        prfSaltB64: input.prfSaltB64,
        pbkdf2: { iterations: input.pbkdf2Iterations, hash: 'SHA-256', keyBits: 256 },
        autoLockMinutes: input.autoLockMinutes,
        createdAt: Date.now(),
      }
      await tx.objectStore('vault').put(lock)
    }
    await done
    return true
  } catch (err) {
    try {
      tx.abort()
    } catch {
      // already finished or aborted
    }
    throw err
  }
}

export async function putUnlockedSession(masterKey: CryptoKey, expiresAt: number): Promise<void> {
  const db = await getDb()
  await db.put('session', { key: 'session', masterKey, expiresAt })
}

/** Returns the persisted session's master key if one exists and hasn't
 * expired, otherwise null (and clears an expired entry). */
export async function getUnlockedSession(): Promise<CryptoKey | null> {
  const db = await getDb()
  const existing = await db.get('session', 'session')
  if (!existing) return null
  if (existing.expiresAt <= Date.now()) {
    await db.delete('session', 'session')
    return null
  }
  return existing.masterKey
}

export async function clearUnlockedSession(): Promise<void> {
  const db = await getDb()
  await db.delete('session', 'session')
}

/** Full teardown — wallet removal / logout must wipe the vault, per
 * docs/decisions.md enforced pattern (no warm state left behind). */
export async function wipeVaultDatabase(): Promise<void> {
  const db = await getDb()
  await db.clear('wallets')
  await db.clear('vault')
  await db.clear('session')
}
