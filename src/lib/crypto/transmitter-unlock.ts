import { aesDecrypt } from './aes'
import { listTransmitterRecords, transmitterVerifierText } from './db'

/**
 * The unlock proof of a Transmitter (OS-FR-3, SPEC Assumptions): the Open Key the
 * lock gave must decrypt every Transmitter record on that lock's verifier to its
 * known text. A key that does not (another lock's, a swapped record) is refused:
 * never trusted because a key was derived. A lock with no Transmitter on it has
 * nothing to prove here (`true`): a Seed Wallet's proof is its Seed's ciphertext.
 */
export async function proveTransmitterUnlock(lockId: string, key: CryptoKey): Promise<boolean> {
  const onLock = (await listTransmitterRecords()).filter((t) => t.lockId === lockId)
  for (const t of onLock) {
    try {
      if ((await aesDecrypt(key, t.verifier.ivB64, t.verifier.ciphertextB64)) !== transmitterVerifierText(t.id)) return false
    } catch {
      return false
    }
  }
  return true
}
