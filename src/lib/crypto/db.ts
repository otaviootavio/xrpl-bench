import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { isNetworkId, type NetworkId } from '@/lib/xrpl/networks'

/** Seed Method (FR-62), the one declaration; `policy.ts` re-exports it. */
export type SeedMethod = 'stored' | 'passkey-derived'
/** `unresolved` until the first decryption derives it from the Seed itself and
 * checks it against the stored address — never guessed (AD-18). */
export type SeedAlgorithm = 'ed25519' | 'secp256k1' | 'unresolved'
/** `none` is a Testnet or Devnet lock with no Open Check (AD-21, AD-28). */
export type OpenCheck = 'pin' | 'passkey' | 'none'
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
  /** The Account this view operates when it is not the Seed's own address: the
   * key is that Account's Regular Key (AD-18, AD-29). Absent: the record's
   * `address`. A claim only; whether the key still controls the Account is
   * always read from the ledger, never from this field. */
  accountAddress?: string
  /** The Wallet's kind (OS-FR-1, CAP-1). Absent is an Online Wallet, so every
   * record made before the kind existed reads as Online with nothing rewritten.
   * Only `offline` is stored on a Seed view: a Transmitter holds no Seed and has a
   * record of its own (`TransmitterRecord`). A view with any other value
   * is not shown (`keystore.toMetas`): it is never read as Online. */
  kind?: 'offline'
  /** "Show the signed transaction before sending" (OS-FR-10, CAP-6). Absent is
   * off, so every Wallet, new and existing, starts with it off and nothing is
   * rewritten. Only `true` is ever stored. It has no effect on an Offline
   * Wallet, which never transmits (OS-FR-11). */
  showBeforeSending?: true
  /** The Was-online mark (OS-FR-7): this view's key was held by an Online Wallet,
   * set by "Change to an offline wallet" and never removed while the Wallet
   * exists, so a change to online and back keeps it. Never set by a create or an
   * import: the app cannot know an imported Seed's past. Only `true` is stored;
   * it is shown on an Offline Wallet only. */
  wasOnline?: true
  /** The highest validated ledger index this Offline Wallet accepted in a Data to
   * Sign, and when (ms since epoch), for the highest-seen ledger warning
   * (OS-FR-16, P-14). Public ledger facts, no secret; only raised, never lowered. */
  ledgerSeen?: { index: number; at: number }
}

/** Every Wallet is one of three kinds (OS-FR-1). `online` is the absent
 * `WalletView.kind`. */
export type WalletKind = 'online' | 'offline' | 'transmitter'

/** A Seed record. `id` is the Seed id and, for the first view, also its
 * walletId, so a persisted `activeWalletId` keeps working. Everything after
 * `createdAt` is additive and optional, except the fields `isCompleteStoredWallet`
 * requires: a record missing one of those is invalid and not shown (FR-95). */
export interface StoredWallet {
  id: string
  label: string
  address: string
  /** Absent once the Seed carries a Signing Check: its ciphertext exists in
   * exactly one form (AD-23). */
  encryptedSeed?: { ivB64: string; ciphertextB64: string }
  createdAt: number
  /** The Seed under the Signing Key. Present only with `signing`. */
  sealedSeed?: { ivB64: string; ciphertextB64: string }
  signing?: SigningSeal
  /** Passkey-Derived only. Such a record has no `encryptedSeed`, `sealedSeed` or
   * `signing`: its Seed exists in no stored form. */
  derived?: DerivedSeedInfo
  seedMethod: SeedMethod
  algorithm: SeedAlgorithm
  lockId: string
  openCheck: OpenCheck
  signingCheck: SigningCheck
  views: WalletView[]
  /** When the person wrote the Seed down and typed back the challenged groups
   * (FR-72). Additive; absent on every record made without that step. */
  writtenSeedConfirmedAt?: number
  /** Edit counter for the compare-and-swap of `commitWalletEdit` (AD-28, AD-18):
   * absent is 0, +1 per edit of the checks. */
  rev?: number
}

/**
 * A Transmitter Wallet (OS-FR-3): no Seed, no Signing Check, never signs. It lives
 * in the `wallets` store beside the Seed records, told apart by `recordKind`, so
 * no schema change is needed. `listStoredWallets` returns Seed records only; every
 * caller that asks "what is on this device" also reads `listTransmitterRecords`.
 *
 * It sits on a lock of its own. `verifier` is known ciphertext under that lock's
 * Open Key (SPEC Assumptions, OS-FR-3): the unlock is proven by decrypting it,
 * never by deriving a key.
 */
export interface TransmitterRecord {
  recordKind: 'transmitter'
  /** Also the walletId: one record, one Wallet. */
  id: string
  label: string
  createdAt: number
  lockId: string
  openCheck: OpenCheck
  network: NetworkId
  /** A custom Node's `wss://` URL, proven for `network` when it was saved. */
  node?: string
  /** "Sync to an address" (OS-FR-4). Absent: not synced. */
  syncedAddress?: string
  /** OS-FR-10, as on a `WalletView`: only `true` is stored. */
  showBeforeSending?: true
  verifier: { ivB64: string; ciphertextB64: string }
}

/** The plaintext a Transmitter's verifier holds: bound to its record id. */
export const transmitterVerifierText = (id: string) => `xrpl-bench:transmitter:${id}:v1`

export function isCompleteTransmitterRecord(w: unknown): w is TransmitterRecord {
  if (!w || typeof w !== 'object') return false
  const r = w as Record<string, unknown>
  const str = (v: unknown) => typeof v === 'string' && v.length > 0
  const verifier = r.verifier as Record<string, unknown> | undefined
  return (
    r.recordKind === 'transmitter' &&
    str(r.id) &&
    str(r.label) &&
    typeof r.createdAt === 'number' &&
    str(r.lockId) &&
    isOpenCheck(r.openCheck) &&
    isNetworkId(r.network) &&
    (r.node === undefined || str(r.node)) &&
    (r.syncedAddress === undefined || str(r.syncedAddress)) &&
    !!verifier &&
    str(verifier.ivB64) &&
    str(verifier.ciphertextB64)
  )
}

/** Every complete Transmitter record. */
export async function listTransmitterRecords(): Promise<TransmitterRecord[]> {
  const db = await getDb()
  return ((await db.getAll('wallets')) as unknown[]).filter(isCompleteTransmitterRecord)
}

export async function putTransmitterRecord(record: TransmitterRecord): Promise<void> {
  const db = await getDb()
  await db.put('wallets', record as unknown as StoredWallet)
}

/** Reads one Transmitter record, applies `change` and writes it back in ONE
 * transaction; `null` deletes it. A record that is not a complete Transmitter is
 * never touched. */
export async function mutateTransmitterRecord(id: string, change: (current: TransmitterRecord) => TransmitterRecord | null): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('wallets', 'readwrite')
  const done = tx.done
  done.catch(() => {})
  const current: unknown = await tx.store.get(id)
  if (!isCompleteTransmitterRecord(current)) {
    await done
    return
  }
  const next = change(current)
  if (next) await tx.store.put(next as unknown as StoredWallet)
  else await tx.store.delete(id)
  await done
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
  /** The Open Check this lock was created with. */
  openCheck: OpenCheck
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

export const lockKey = (id: string) => `lock:${id}`

/** The App PIN: its salt, the known ciphertext that proves it, and the one
 * failure count every PIN use and passkey assertion shares (AD-25). */
export interface VaultMeta {
  key: 'vault'
  pinSaltB64?: string
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
  /** `session:<lockId>`. */
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

export const isOpenCheck = (v: unknown): v is OpenCheck => v === 'pin' || v === 'passkey' || v === 'none'
export const isSeedMethod = (v: unknown): v is SeedMethod => v === 'stored' || v === 'passkey-derived'
export const isSeedAlgorithm = (v: unknown): v is SeedAlgorithm => v === 'ed25519' || v === 'secp256k1' || v === 'unresolved'
export const isSigningCheck = (v: unknown): v is SigningCheck => v === 'standard' || v === 'passkey' || v === 'pin'

function isCompleteView(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.walletId === 'string' && r.walletId.length > 0 && isNetworkId(r.network)
}

/** FR-95: the one validity rule for a Seed record. Every field the screens read
 * must be present, `openCheck` must be one of the three, and a record with no
 * views shows no Wallet. `algorithm: 'unresolved'` is a value, not an absence.
 * An invalid record is not shown; it is never rewritten or deleted. */
export function isCompleteStoredWallet(w: unknown): w is StoredWallet {
  if (!w || typeof w !== 'object') return false
  const r = w as Record<string, unknown>
  const str = (v: unknown) => typeof v === 'string' && v.length > 0
  return (
    str(r.id) &&
    str(r.label) &&
    str(r.address) &&
    typeof r.createdAt === 'number' &&
    str(r.lockId) &&
    isSeedMethod(r.seedMethod) &&
    isSeedAlgorithm(r.algorithm) &&
    isOpenCheck(r.openCheck) &&
    isSigningCheck(r.signingCheck) &&
    Array.isArray(r.views) &&
    r.views.length > 0 &&
    r.views.every(isCompleteView)
  )
}

/** The one bulk read of Seed records: only complete ones come back. */
export async function listStoredWallets(): Promise<StoredWallet[]> {
  const db = await getDb()
  return (await db.getAll('wallets')).filter(isCompleteStoredWallet)
}

/** FR-93: a Wallet has one Network for life, so a record may hold at most one
 * plain (non-controlled) view. Controlled views carry `accountAddress`. */
function assertOneOwnView(wallet: StoredWallet): void {
  const plain = wallet.views.filter((v) => !v.accountAddress)
  if (plain.length > 1) throw new Error('A wallet can only be on one network.')
}

export async function putStoredWallet(wallet: StoredWallet): Promise<void> {
  assertOneOwnView(wallet)
  const db = await getDb()
  await db.put('wallets', wallet)
}

export async function deleteStoredWallet(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('wallets', id)
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
  if (next) {
    assertOneOwnView(next)
    await tx.store.put(next)
  } else await tx.store.delete(id)
  await done
}

/** What a lock record's wrappers and window are, as one comparable string: the
 * read an edit was based on, checked again inside its transaction. `undefined`
 * (no record) has a stamp of its own. */
export function lockStamp(record: LockRecord | undefined): string {
  if (!record) return 'absent'
  return JSON.stringify([
    record.openCheck,
    record.autoLockMinutes,
    record.hkdfInfo,
    record.wrappedOpenKeyForPin?.ciphertextB64 ?? null,
    record.wrappedOpenKeyForPasskey?.ciphertextB64 ?? null,
    record.passkeyCredentialIdB64 ?? null,
  ])
}

/** The ciphertext and lock a Seed record was read with. */
export function seedStamp(w: StoredWallet): string {
  return JSON.stringify([w.rev ?? 0, w.lockId, w.encryptedSeed?.ciphertextB64 ?? null, w.sealedSeed?.ciphertextB64 ?? null])
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
   * is left on it. */
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
    if (released) {
      const others = (await wallets.getAll()).some((w) => w.id !== next.id && w.lockId === released)
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

/** One persisted session per open lock (AD-21). */
export const sessionKeyOf = (lockId: string) => `session:${lockId}`

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
  const record = (await db.get('vault', lockKey(lockId))) as LockRecord | undefined
  return record && isOpenCheck(record.openCheck) ? record : undefined
}

export async function putLockRecord(record: LockRecord): Promise<void> {
  const db = await getDb()
  await db.put('vault', record)
}

/**
 * AD-46: the ONE single-flight guard over every vault write that can create or
 * discard the App PIN or a lock record. `createLock`/`withAppPin` write the App PIN
 * in a transaction of its own BEFORE the lock record and the Wallet, so no one
 * transaction can see a create in flight; a last-Wallet removal that checked
 * "nothing left" in that window would delete the fresh PIN and the create would
 * then wrap a lock under a PIN that no longer exists. Serialising the writers is
 * what closes that window.
 *
 * Web Locks (`xrpl-vault-write`, cross-tab) when the browser has them, otherwise a
 * module-level promise chain (one tab). It is NOT re-entrant: a function inside
 * the guard must never call another guarded one, or it waits on itself.
 *
 * Wrapped, in `keystore.ts` (a test checks every name below):
 *  - keystore: `createStoredWallet`, `createDerivedWallet`, `importStoredWallet`,
 *    `editChecks`, `removeWallet`, `createTransmitterWallet`
 * Not wrapped, because each reaches a wrapped one: `restorePasskeyWallet`
 * (`createDerivedWallet`), `setLockAutoLock` (`editChecks`).
 */
let vaultWriteTail: Promise<unknown> = Promise.resolve()
export function exclusiveVaultWrite<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (locks && typeof locks.request === 'function') return locks.request('xrpl-vault-write', work)
  const run = vaultWriteTail.then(work, work)
  // The stored tail swallows a failure, so one rejected write never poisons the next.
  vaultWriteTail = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Removes one `lock:<id>` record. */
export async function deleteLockRecord(lockId: string): Promise<void> {
  const db = await getDb()
  await db.delete('vault', lockKey(lockId))
}

/** Deletes EVERY `lock:<id>` record in one transaction. Only for a vault that
 * holds no Wallet (AD-46): an emptied vault must hold nothing that reads as a
 * lock. Call it under `exclusiveVaultWrite`, after the emptiness check. */
export async function deleteAllLockRecords(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('vault', 'readwrite')
  const done = tx.done
  done.catch(() => {})
  const all = (await tx.store.getAll()) as Array<VaultMeta | LockRecord>
  for (const r of all) if (r.key.startsWith('lock:')) await tx.store.delete(r.key)
  await done
}

/** Every `lock:<id>` record. */
export async function listLockRecords(): Promise<LockRecord[]> {
  const db = await getDb()
  const all = (await db.getAll('vault')) as Array<VaultMeta | LockRecord>
  return all.filter((r): r is LockRecord => r.key.startsWith('lock:') && isOpenCheck((r as LockRecord).openCheck))
}

/** Full teardown — wallet removal / logout must wipe the vault, per
 * docs/decisions.md enforced pattern (no warm state left behind). */
export async function wipeVaultDatabase(): Promise<void> {
  const db = await getDb()
  await db.clear('wallets')
  await db.clear('vault')
  await db.clear('session')
}
