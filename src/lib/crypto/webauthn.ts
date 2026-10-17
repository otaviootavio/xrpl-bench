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

/**
 * AD-24: the one place the relying-party id is decided. It comes from the
 * build's configured value (`__RP_ID__`, set per branch in `vite.config.ts`:
 * an rpId must match the page's origin, so dev, stage and prod each have
 * their own). Only when the build configures none (local dev) does it fall back
 * to the page's own host, and nothing else in the app reads the hostname for
 * this. Every NEW credential record stores the value it was registered under.
 */
export function getRpId(): string {
  const configured = typeof __RP_ID__ === 'string' ? __RP_ID__ : ''
  if (configured) return configured
  if (typeof location !== 'undefined' && location.hostname) return location.hostname
  throw new Error('The relying-party id is not configured for this build.')
}

/** The browser's credentials container, or the substitute a test installed
 * (AD-12: WebAuthn is an external resource and gets the same seam as the pool). */
export interface CredentialsImplementation {
  create(options: CredentialCreationOptions): Promise<Credential | null>
  get(options: CredentialRequestOptions): Promise<Credential | null>
}

let substitute: CredentialsImplementation | null = null

/** Installs a stand-in for `navigator.credentials`. For tests; pair with `resetCredentials`. */
export function substituteCredentials(implementation: CredentialsImplementation): void {
  substitute = implementation
}

/** Removes the substitute: the real `navigator.credentials` is used again. */
export function resetCredentials(): void {
  substitute = null
}

function credentials(): CredentialsImplementation {
  return substitute ?? navigator.credentials
}

export function isWebAuthnSupported(): boolean {
  return substitute !== null || (typeof window !== 'undefined' && !!window.PublicKeyCredential)
}

/** Whether this device can do the PRF extension a passkey check needs. `yes` or
 * `no` only when the browser says so (`getClientCapabilities`); most cannot
 * tell before a passkey exists, and answer `unknown` — creation then fails
 * closed if the passkey turns out to give no PRF output. */
export async function detectPrfSupport(): Promise<'yes' | 'no' | 'unknown'> {
  if (!isWebAuthnSupported()) return 'no'
  const credentialType = window.PublicKeyCredential as unknown as {
    getClientCapabilities?: () => Promise<Record<string, boolean | undefined>>
  }
  if (typeof credentialType.getClientCapabilities === 'function') {
    try {
      const prf = (await credentialType.getClientCapabilities())['extension:prf']
      if (prf === true) return 'yes'
      if (prf === false) return 'no'
    } catch {
      // Cannot tell: fall through.
    }
  }
  return 'unknown'
}

/** The backup-eligible (BE) flag of an attestation's authenticator data: bit 3
 * of the flags byte at offset 32. BE is permanent for a credential; the
 * backup-state flag can change, so it is not read (AD-24). `undefined` when it
 * cannot be read. */
function readBackupEligible(response: unknown): boolean | undefined {
  try {
    const data = (response as { getAuthenticatorData?: () => ArrayBuffer }).getAuthenticatorData?.()
    if (!data || data.byteLength < 33) return undefined
    return (new Uint8Array(data)[32] & 0x08) !== 0
  } catch {
    return undefined
  }
}

/**
 * Registers a new passkey for this device and returns its credential id
 * (base64) to persist in the vault. Requires user verification (biometric/
 * device PIN via the platform authenticator), and requests the PRF
 * extension so the passkey can later derive a stable symmetric key — this
 * is what gates decryption of the local seed vault (wallet-security.md US-1).
 * `rp.id` is set explicitly (`getRpId`) and returned, for the record to store.
 */
export async function registerPasskey(
  userIdLabel: string,
): Promise<{ credentialIdB64: string; prfSupported: boolean; rpId: string; backupEligible?: boolean }> {
  const userId = crypto.getRandomValues(new Uint8Array(16))
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const rpId = getRpId()

  const credential = (await credentials().create({
    publicKey: {
      rp: { name: 'XRPL Bench', id: rpId },
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
  const backupEligible = readBackupEligible(credential.response)
  return {
    credentialIdB64: bufToB64(credential.rawId),
    prfSupported: !!extResults.prf?.enabled,
    rpId,
    ...(backupEligible === undefined ? {} : { backupEligible }),
  }
}

function prfBitsOf(assertion: PublicKeyCredential): ArrayBuffer {
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

/**
 * Runs the unlock (assertion) ceremony against a previously registered
 * passkey and derives raw key bits from the PRF extension output. Throws if
 * the user cancels/fails verification — the caller (auth.ts) is responsible
 * for the retry/backoff policy, never for silently bypassing this.
 * `rpId` is the one the credential was registered under; a credential stored
 * without one is asserted as before (the browser uses the page's host).
 */
export async function assertPasskeyAndDeriveBits(credentialIdB64: string, salt: BufferSource = PRF_SALT, rpId?: string): Promise<ArrayBuffer> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const credentialId = b64ToBuf(credentialIdB64)

  const assertion = (await credentials().get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: credentialId, type: 'public-key' }],
      userVerification: 'required',
      ...(rpId ? { rpId } : {}),
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null

  if (!assertion) throw Object.assign(new Error('Unlock was cancelled.'), { name: 'NotAllowedError' })
  return prfBitsOf(assertion)
}

/**
 * The "use an existing passkey" ceremony: no `allowCredentials`, so the browser
 * lists this device's passkeys for the rpId, and the credential id is taken from
 * the result. Same cancel and no-PRF errors as `assertPasskeyAndDeriveBits`.
 */
export async function assertAnyPasskeyAndDeriveBits(salt: BufferSource, rpId: string): Promise<{ credentialIdB64: string; bits: ArrayBuffer }> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const assertion = (await credentials().get({
    publicKey: {
      challenge,
      rpId,
      userVerification: 'required',
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null

  if (!assertion) throw Object.assign(new Error('Unlock was cancelled.'), { name: 'NotAllowedError' })
  return { credentialIdB64: bufToB64(assertion.rawId), bits: prfBitsOf(assertion) }
}
