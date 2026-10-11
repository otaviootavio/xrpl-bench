import { bufToB64, b64ToBuf } from './encoding'

// A fixed, app-wide salt for the WebAuthn PRF extension. This is not a
// secret (PRF salts don't need to be) — it just needs to be stable so the
// same passkey always derives the same key material across unlocks.
export const PRF_SALT = new TextEncoder().encode('xrpl-wallet:vault-unlock:v1')

/** True for a ceremony the user dismissed or that timed out. Never a wrong
 * credential, so it never counts toward the PIN lockout (AD-25). */
export function isCancelled(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name
  return name === 'NotAllowedError' || name === 'AbortError'
}

/** True when the authenticator ran but gave no PRF output. */
export function isPrfUnsupported(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === 'PrfUnsupportedError'
}

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential
}

/**
 * Registers a new passkey for this device and returns its credential id
 * (base64) to persist in the vault. Requires user verification (biometric/
 * device PIN via the platform authenticator), and requests the PRF
 * extension so the passkey can later derive a stable symmetric key — this
 * is what gates decryption of the local seed vault (wallet-security.md US-1).
 */
export async function registerPasskey(userIdLabel: string): Promise<{ credentialIdB64: string; prfSupported: boolean }> {
  const userId = crypto.getRandomValues(new Uint8Array(16))
  const challenge = crypto.getRandomValues(new Uint8Array(32))

  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'XRPL Bench' },
      user: { id: userId, name: userIdLabel, displayName: userIdLabel },
      challenge,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null

  if (!credential) throw new Error('Passkey registration was cancelled or failed.')

  const extResults = credential.getClientExtensionResults() as { prf?: { enabled?: boolean } }
  return {
    credentialIdB64: bufToB64(credential.rawId),
    prfSupported: !!extResults.prf?.enabled,
  }
}

/**
 * Runs the unlock (assertion) ceremony against a previously registered
 * passkey and derives raw key bits from the PRF extension output. Throws if
 * the user cancels/fails verification — the caller (auth.ts) is responsible
 * for the retry/backoff policy, never for silently bypassing this.
 */
export async function assertPasskeyAndDeriveBits(credentialIdB64: string, salt: BufferSource = PRF_SALT): Promise<ArrayBuffer> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const credentialId = b64ToBuf(credentialIdB64)

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: credentialId, type: 'public-key' }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null

  if (!assertion) throw Object.assign(new Error('Unlock was cancelled.'), { name: 'NotAllowedError' })

  const extResults = assertion.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }
  const bits = extResults.prf?.results?.first
  if (!bits) {
    throw Object.assign(
      new Error('This device/browser does not support the PRF extension needed to unlock with a passkey. Use your PIN instead.'),
      { name: 'PrfUnsupportedError' },
    )
  }
  return bits
}
