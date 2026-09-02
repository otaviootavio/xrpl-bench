import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface StoredWallet {
  id: string
  label: string
  address: string
  encryptedSeed: { ivB64: string; ciphertextB64: string }
  createdAt: number
}

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
  vault: { key: string; value: VaultMeta }
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
  const existing = await db.get('vault', 'vault')
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
