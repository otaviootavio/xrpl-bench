import { decodeSeed, Wallet } from 'xrpl'
import type { NetworkId } from '@/lib/xrpl/networks'
import { aesEncrypt } from '../aes'
import { getVaultMeta, mutateStoredWallet, putStoredWallet, type SigningSeal, type StoredWallet } from '../db'
import { deriveAesKeyFromBits } from '../derive'
import { bufToB64 } from '../encoding'
import { derivePinKeyBits } from '../pin'
import { createLock } from '../lock'
import { listWallets, type WalletMeta } from '../keystore'

/**
 * Direct fixtures for the crypto tests: a PIN lock of its own and Seed records
 * written under it, with no creation flow in between. A test file mocks `idb`
 * (and WebAuthn where it needs them); the cryptography here is real.
 */

export interface FixtureLock {
  lockId: string
  /** The lock's Open Key, non-extractable. */
  key: CryptoKey
}

/** A PIN lock with its own Open Key. The first call also makes `pin` the App PIN
 * (its salt and verifier); a later call proves it on the shared counter. */
export async function makePinLock(pin: string, autoLockMinutes = 5, network: NetworkId = 'testnet'): Promise<FixtureLock> {
  const created = await createLock({ network, openCheck: 'pin', autoLockMinutes }, { pin })
  if (created.status !== 'ok') throw new Error(`fixture lock failed: ${created.status}`)
  return { lockId: created.value.id, key: created.value.key }
}

/** A Standard Seed record under `lock`'s Open Key, on one network. */
export async function storeSeedWallet(
  label: string,
  lock: FixtureLock,
  network: NetworkId = 'testnet',
  seed: string = Wallet.generate().seed!,
): Promise<{ meta: WalletMeta; seed: string }> {
  const wallet = Wallet.fromSeed(seed)
  const id = crypto.randomUUID()
  const encrypted = await aesEncrypt(lock.key, seed)
  const stored: StoredWallet = {
    id,
    label,
    address: wallet.address,
    encryptedSeed: { ivB64: encrypted.ivB64, ciphertextB64: encrypted.ciphertextB64 },
    createdAt: Date.now(),
    seedMethod: 'stored',
    algorithm: decodeSeed(seed).type === 'ed25519' ? 'ed25519' : 'secp256k1',
    lockId: lock.lockId,
    openCheck: 'pin',
    signingCheck: 'standard',
    views: [{ walletId: id, network }],
  }
  await putStoredWallet(stored)
  const meta = (await listWallets()).find((m) => m.id === id)
  if (!meta) throw new Error('fixture wallet not listed')
  return { meta, seed }
}

/** Gives a stored Standard record a Signing Check directly: a random Signing Key
 * encrypts the Seed, `credentialKey` wraps the Signing Key, and the Open-key
 * ciphertext goes — the shape `editChecks` writes, without the flow around it. */
export async function sealRecordDirect(
  walletId: string,
  seed: string,
  credentialKey: CryptoKey,
  seal: Pick<SigningSeal, 'kind' | 'hkdfInfo' | 'credentialIdB64' | 'prfSaltB64' | 'rpId'>,
): Promise<void> {
  const signingKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const wrappedSigningKey = await aesEncrypt(credentialKey, bufToB64(await crypto.subtle.exportKey('raw', signingKey)))
  const sealedSeed = await aesEncrypt(signingKey, seed)
  await mutateStoredWallet(walletId, (current) => {
    const { encryptedSeed: _old, ...rest } = current
    return { ...rest, sealedSeed, signing: { ...seal, wrappedSigningKey }, signingCheck: seal.kind, rev: (current.rev ?? 0) + 1 }
  })
}

/** A PIN Signing Check on a record, under the App PIN `pin`. */
export async function sealRecordUnderPin(walletId: string, seed: string, pin: string): Promise<void> {
  const meta = await getVaultMeta()
  if (!meta.pinSaltB64) throw new Error('fixture: no App PIN')
  const hkdfInfo = `xrpl-bench:sign:${walletId}:v1`
  const key = await deriveAesKeyFromBits(await derivePinKeyBits(pin, meta.pinSaltB64), hkdfInfo)
  await sealRecordDirect(walletId, seed, key, { kind: 'pin', hkdfInfo })
}
