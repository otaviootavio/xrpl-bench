import { bufToB64, b64ToBuf } from './encoding'

export async function aesEncrypt(key: CryptoKey, plaintext: string): Promise<{ ivB64: string; ciphertextB64: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return { ivB64: bufToB64(iv.buffer), ciphertextB64: bufToB64(ciphertext) }
}

export async function aesDecrypt(key: CryptoKey, ivB64: string, ciphertextB64: string): Promise<string> {
  const iv = new Uint8Array(b64ToBuf(ivB64))
  const ciphertext = b64ToBuf(ciphertextB64)
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plainBuf)
}

export async function importAesKeyFromBits(bits: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
