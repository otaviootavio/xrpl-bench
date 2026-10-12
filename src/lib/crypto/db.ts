import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { NetworkId } from '@/lib/xrpl/networks'

/** Seed Method (FR-62), the one declaration; `policy.ts` re-exports it. */
export type SeedMethod = 'stored' | 'passkey-derived'
/** `unresolved` until the first decryption derives it from the Seed itself and
 * checks it against the stored address — never guessed (AD-18). */
export type SeedAlgorithm = 'ed25519' | 'secp256k1' | 'unresolved'
/** `either` is a legacy Wallet whose app-wide unlock accepts a PIN or a
 * passkey (AD-25). `none` is a Testnet or Devnet lock with no Open Check (AD-21,
 * AD-28). */
export type OpenCheck = 'pin' | 'passkey' | 'either' | 'none'
export type SigningCheck = 'standard' | 'passkey' | 'pin'

/** How a Signing Check's key is wrapped (AD-23). Holds only public derivation
 * inputs and the wrapped Signing Key: nothing here opens the Seed without the
 * PIN or the passkey. The Signing Key and the credential-derived key are never
 * persisted. `hkdfInfo` and `prfSaltB64` are generated at creation and stored,
 * never recomputed from a constant (AD-21). */
export interface SigningSeal {
  kind: 'pin' | 'passkey'
  /** The random Signing Key (raw, base64) encrypted under the credential key. */
  wrappedSigningKey: { ivB64: string; ciphertextB64: string }
  hkdfInfo: string
  /** Passkey only: the credential asserted and the PRF salt for `(seed, 'sign')`. */
  credentialIdB64?: string
  prfSaltB64?: string
  /** Passkey only: the rpId the credential was registered under (AD-24). Absent on
   * a credential registered before it was recorded. */
  rpId?: string
}

/** What a Passkey-Derived Seed Wallet records instead of a Seed (AD-24): all
 * public. `ordinal` rebuilds the `seed` PRF salt; `backupEligible` is the BE
 * flag read at registration, absent when it could not be read. */
export interface DerivedSeedInfo {
  credentialIdB64: string
  rpId: string
  ordinal: string
  backupEligible?: boolean
}

/** A Wallet is a view `(walletId, network, node)` over one Seed record
 * (AD-18). `node` is a custom Node's `wss://` URL that passed the network-id
 * check (AD-20); absent, the network's built-in Nodes are used. */
export interface WalletView {
  walletId: string
  network: NetworkId
  node?: string
}

/** A Seed record. `id` is the Seed id and, for the first view, also its
 * walletId, so a persisted `activeWalletId` keeps working. Everything after
 * `createdAt` is additive and optional: a record written by a build before
 * story 12.1 has none of it, and an older build ignores all of it. */
export interface StoredWallet {
  id: string
  label: string
  address: string
  /** Absent once the Seed carries a Signing Check: its ciphertext exists in
   * exactly one form (AD-23), and an older build then finds none and fails
   * closed. */
  encryptedSeed?: { ivB64: string; ciphertextB64: string }
  createdAt: number
  /** The Seed under the Signing Key. Present only with `signing`. */
  sealedSeed?: { ivB64: string; ciphertextB64: string }
  signing?: SigningSeal
  /** Passkey-Derived only. Such a record has no `encryptedSeed`, `sealedSeed` or
   * `signing`: its Seed exists in no stored form. */
  derived?: DerivedSeedInfo
  seedMethod?: SeedMethod
  algorithm?: SeedAlgorithm
  lockId?: string
  openCheck?: OpenCheck
  signingCheck?: SigningCheck
  views?: WalletView[]
  /** When the person wrote the Seed down and typed back the challenged groups
   * (FR-72). Additive; absent on every record made without that step. */
  writtenSeedConfirmedAt?: number
  /** Edit counter for the compare-and-swap of `commitWalletEdit` (AD-28, AD-18):
   * absent is 0, +1 per edit of the checks. Additive: an older build ignores it. */
  rev?: number
}

/** `lock:<id>` in the `vault` store. Holds the derivation inputs a lock's keys
 * are made from (AD-21) and its auto-lock window. Holds no key and no Seed. */
export interface LockRecord {
  key: string
  id: string
  hkdfInfo: string
  /** The PRF salt of the lock's passkey. Absent on a lock with no passkey. */
  prfSaltB64?: string
  pbkdf2: { iterations: number; hash: 'SHA-256'; keyBits: number }
  autoLockMinutes: number
  createdAt: number
  /** Story 4 (additive; the legacy lock has none of these, its wrappers live in
   * the vault meta). The Open Check this lock was created with. */
  openCheck?: OpenCheck
  /** The Open Key (raw, base64) encrypted under the App PIN's key for this lock. */
  wrappedOpenKeyForPin?: { ivB64: string; ciphertextB64: string }
  /** The Open Key encrypted under this lock's own passkey. */
  wrappedOpenKeyForPasskey?: { ivB64: string; ciphertextB64: string }
  passkeyCredentialIdB64?: string
  /** The rpId that passkey was registered under (AD-24). */
  rpId?: string
  /** `none` only: the Open Key itself, a non-extractable CryptoKey, which
   * parent AD-5 permits in IndexedDB. */
  openKey?: CryptoKey
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
  /** The rpId the legacy passkey was registered under, when recorded (AD-24). */
  rpId?: string
  pinSaltB64?: string
  wrappedMasterKeyForPin?: { ivB64: string; ciphertextB64: string }
  wrappedMasterKeyForPasskey?: { ivB64: string; ciphertextB64: string }
  /** Known ciphertext that proves the App PIN when no legacy wrapper exists
   * (story 4): written when the App PIN is created by a non-legacy lock. */
  pinVerifier?: { ivB64: string; ciphertextB64: string; hkdfInfo: string }
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
  /** `session` for the legacy lock, `session:<lockId>` for any other. */
  key: string
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
 * Reads the vault meta, applies `change`, and writes the result back in ONE
 * transaction — the only way the PIN failure count moves, so two parallel wrong
 * guesses each add one rather than sharing a count (AD-25).
 */
export async function mutateVaultMeta(change: (current: VaultMeta) => VaultMeta): Promise<VaultMeta> {
  const db = await getDb()
  const tx = db.transaction('vault', 'readwrite')
  const done = tx.done
  done.catch(() => {})
  const existing = (await tx.store.get('vault')) as VaultMeta | undefined
  const next = change(existing ?? { key: 'vault', failedAttempts: 0 })
  await tx.store.put(next)
  await done
  return next
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

/** What a lock record's wrappers and window are, as one comparable string: the
 * read an edit was based on, checked again inside its transaction. `undefined`
 * (the legacy lock before its record exists) has a stamp of its own. */
export function lockStamp(record: LockRecord | undefined): string {
  if (!record) return 'absent'
  return JSON.stringify([
    record.openCheck ?? null,
    record.autoLockMinutes,
    record.hkdfInfo,
    record.wrappedOpenKeyForPin?.ciphertextB64 ?? null,
    record.wrappedOpenKeyForPasskey?.ciphertextB64 ?? null,
    record.passkeyCredentialIdB64 ?? null,
  ])
}

/** The ciphertext and lock a Seed record was read with. */
export function seedStamp(w: StoredWallet): string {
  return JSON.stringify([w.rev ?? 0, w.lockId ?? LEGACY_LOCK_ID, w.encryptedSeed?.ciphertextB64 ?? null, w.sealedSeed?.ciphertextB64 ?? null])
}

/** Another tab or flow changed what an edit was based on. Nothing was written. */
export class EditConflictError extends Error {
  constructor() {
    super('This wallet changed while its checks were being edited. Nothing was changed.')
    this.name = 'EditConflictError'
  }
}

export interface WalletEditCommit {
  /** The Seed record being edited. */
  seedId: string
  /** `seedStamp` of the record as read; a mismatch aborts. */
  expectSeedStamp: string
  /** The lock the record was on, and its `lockStamp` as read. */
  expectLockId: string
  expectLockStamp: string
  /** The record to write. Built from the record as it is INSIDE the transaction,
   * so a concurrent change to another field (a new view) is not lost. */
  next: (current: StoredWallet) => StoredWallet
  /** A lock record to write: a new lock, or the existing one with a new window. */
  putLock?: LockRecord
  /** The lock the record leaves. Deleted in the same transaction when no record
   * is left on it; the legacy lock never is. */
  releaseLockId?: string
}

/**
 * AD-28: the new lock record, the Wallet record and the removal of the old lock
 * in ONE multi-store transaction, with a compare-and-swap on the record's `rev`,
 * lock and ciphertext and on the old lock's stamp. Any mismatch throws
 * `EditConflictError`; any failure aborts the transaction: the old state is
 * exactly as it was and still opens.
 */
export async function commitWalletEdit(input: WalletEditCommit): Promise<{ wallet: StoredWallet; lockRemoved: boolean }> {
  const db = await getDb()
  const tx = db.transaction(['wallets', 'vault'], 'readwrite')
  const done = tx.done
  done.catch(() => {})
  try {
    const wallets = tx.objectStore('wallets')
    const vault = tx.objectStore('vault')
    const current = await wallets.get(input.seedId)
    if (!current || seedStamp(current) !== input.expectSeedStamp) throw new EditConflictError()
    const oldLock = (await vault.get(lockKey(input.expectLockId))) as LockRecord | undefined
    if (lockStamp(oldLock) !== input.expectLockStamp) throw new EditConflictError()
    const next = { ...input.next(current), rev: (current.rev ?? 0) + 1 }
    await wallets.put(next)
    if (input.putLock) await vault.put(input.putLock)
    const released = input.releaseLockId
    let lockRemoved = false
    if (released && released !== LEGACY_LOCK_ID) {
      const others = (await wallets.getAll()).some((w) => w.id !== next.id && (w.lockId ?? LEGACY_LOCK_ID) === released)
      if (!others) {
        await vault.delete(lockKey(released))
        lockRemoved = true
      }
    }
    await done
    return { wallet: next, lockRemoved }
  } catch (err) {
    try {
      tx.abort()
    } catch {
      // already finished or aborted
    }
    throw err
  }
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

/** One persisted session per open lock (AD-21). The legacy lock keeps its
 * pre-story-4 key, so a refresh across the update still restores it. */
export const sessionKeyOf = (lockId: string) => (lockId === LEGACY_LOCK_ID ? 'session' : `session:${lockId}`)

export async function putLockSession(lockId: string, masterKey: CryptoKey, expiresAt: number): Promise<void> {
  const db = await getDb()
  await db.put('session', { key: sessionKeyOf(lockId), masterKey, expiresAt })
}

/** Returns a lock's persisted key and its persisted expiry if one exists and
 * hasn't expired, otherwise null (and clears an expired entry). */
export async function getLockSession(lockId: string): Promise<{ key: CryptoKey; expiresAt: number } | null> {
  const db = await getDb()
  const existing = await db.get('session', sessionKeyOf(lockId))
  if (!existing) return null
  if (existing.expiresAt <= Date.now()) {
    await db.delete('session', sessionKeyOf(lockId))
    return null
  }
  return { key: existing.masterKey, expiresAt: existing.expiresAt }
}

/** Moves a persisted session's expiry — and ONLY if the entry still exists, in
 * one transaction. A lock that closed while an extend was in flight has no entry
 * left, so the late write does nothing and a refresh cannot restore it. */
export async function extendLockSessionExpiry(lockId: string, expiresAt: number): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('session', 'readwrite')
  const done = tx.done
  done.catch(() => {})
  const existing = await tx.store.get(sessionKeyOf(lockId))
  if (existing) await tx.store.put({ ...existing, expiresAt })
  await done
}

export async function clearLockSession(lockId: string): Promise<void> {
  const db = await getDb()
  await db.delete('session', sessionKeyOf(lockId))
}

export async function clearAllLockSessions(): Promise<void> {
  const db = await getDb()
  await db.clear('session')
}

export async function getLockRecord(lockId: string): Promise<LockRecord | undefined> {
  const db = await getDb()
  return (await db.get('vault', lockKey(lockId))) as LockRecord | undefined
}

export async function putLockRecord(record: LockRecord): Promise<void> {
  const db = await getDb()
  await db.put('vault', record)
}

/** Removes one `lock:<id>` record. Never the legacy lock's, whose wrappers
 * live in the vault meta. */
export async function deleteLockRecord(lockId: string): Promise<void> {
  if (lockId === LEGACY_LOCK_ID) throw new Error('The legacy lock cannot be deleted.')
  const db = await getDb()
  await db.delete('vault', lockKey(lockId))
}

/** Every `lock:<id>` record. */
export async function listLockRecords(): Promise<LockRecord[]> {
  const db = await getDb()
  const all = (await db.getAll('vault')) as Array<VaultMeta | LockRecord>
  return all.filter((r): r is LockRecord => r.key.startsWith('lock:'))
}

/** Full teardown — wallet removal / logout must wipe the vault, per
 * docs/decisions.md enforced pattern (no warm state left behind). */
export async function wipeVaultDatabase(): Promise<void> {
  const db = await getDb()
  await db.clear('wallets')
  await db.clear('vault')
  await db.clear('session')
}
