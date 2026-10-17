import { NETWORKS, NETWORK_IDS, type NetworkId } from '@/lib/xrpl/networks'

/**
 * The two-device signing payloads (FR-78; AD-30). This is the only place either
 * one is defined, and a `lib` leaf: it imports no crypto, store or UI.
 *
 *   unsigned  xrplbench:1:u:<base64url of {"v":1,"network_id":n,"tx":{...}}>
 *   signed    xrplbench:1:s:<base64url of {"v":1,"tx_blob":"..."}>
 *
 * `network_id` is an envelope field (the ledger's own `NetworkID` transaction
 * field exists only above 1024): Mainnet 0, Testnet 1, Devnet 2, from `NETWORKS`.
 * `decode*` returns a typed result and never throws. One payload is one QR code:
 * there is no multi-frame form, so a payload over one code's capacity is refused.
 */

export const QR_VERSION = 1
const PREFIX = `xrplbench:${QR_VERSION}:`
const UNSIGNED = `${PREFIX}u:`
const SIGNED = `${PREFIX}s:`

/** What one QR code holds at error correction M, version 40, byte mode. The
 * display side renders at M, so this is what it can draw. */
export const QR_MAX_BYTES = 2331

export type Encoded = { ok: true; text: string } | { ok: false; reason: string }

export type CodecErrorKind = 'malformed' | 'unknown-version' | 'wrong-kind' | 'bad-network' | 'too-large'
export type Decoded<T> = { ok: true; value: T } | { ok: false; kind: CodecErrorKind; reason: string }

export interface UnsignedPayload {
  v: typeof QR_VERSION
  network_id: number
  /** The network `network_id` names. */
  network: NetworkId
  tx: Record<string, unknown>
}

export interface SignedPayload {
  v: typeof QR_VERSION
  tx_blob: string
}

const TOO_LARGE = 'This transaction is too large for one QR code, so it cannot be carried between the two devices.'

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The `network_id` a network carries in the envelope. */
export function networkIdOf(network: NetworkId): number {
  return NETWORKS[network].networkId
}

/** The network an envelope `network_id` names, or `null` for an unknown or non-integer one. */
export function networkOfId(networkId: unknown): NetworkId | null {
  if (typeof networkId !== 'number' || !Number.isInteger(networkId)) return null
  return NETWORK_IDS.find((n) => NETWORKS[n].networkId === networkId) ?? null
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(body: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw new Error('not base64url')
  const padded = body.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

function finish(prefix: string, payload: unknown): Encoded {
  const text = prefix + toBase64Url(JSON.stringify(payload))
  // Characters are all ASCII, so the length is the byte count.
  return text.length > QR_MAX_BYTES ? { ok: false, reason: TOO_LARGE } : { ok: true, text }
}

export function encodeUnsigned(input: { network: NetworkId; tx: Record<string, unknown> }): Encoded {
  return finish(UNSIGNED, { v: QR_VERSION, network_id: networkIdOf(input.network), tx: input.tx })
}

export function encodeSigned(txBlob: string): Encoded {
  return finish(SIGNED, { v: QR_VERSION, tx_blob: txBlob })
}

function open(text: unknown, kind: 'u' | 's'): Decoded<Record<string, unknown>> {
  if (typeof text !== 'string') return { ok: false, kind: 'malformed', reason: 'That is not an XRPL Bench signing code.' }
  // A wrapped textarea or a pasted line break puts whitespace inside the body; none of it is data.
  const trimmed = text.replace(/\s+/g, '')
  if (trimmed.length > QR_MAX_BYTES) return { ok: false, kind: 'too-large', reason: TOO_LARGE }
  const m = /^xrplbench:([^:]*):([^:]*):(.*)$/s.exec(trimmed)
  if (!m) return { ok: false, kind: 'malformed', reason: 'That is not an XRPL Bench signing code.' }
  if (m[1] !== String(QR_VERSION)) {
    return { ok: false, kind: 'unknown-version', reason: 'That code is from a version of XRPL Bench this one does not understand.' }
  }
  if (m[2] !== 'u' && m[2] !== 's') return { ok: false, kind: 'malformed', reason: 'That is not an XRPL Bench signing code.' }
  if (m[2] !== kind) {
    return {
      ok: false,
      kind: 'wrong-kind',
      reason: kind === 'u' ? 'That is a signed transaction, not one waiting to be signed.' : 'That is an unsigned transaction, not a signed one.',
    }
  }
  let body: unknown
  try {
    body = fromBase64Url(m[3])
  } catch {
    return { ok: false, kind: 'malformed', reason: 'That code could not be read.' }
  }
  if (!isPlainObject(body)) return { ok: false, kind: 'malformed', reason: 'That code could not be read.' }
  if (body.v !== QR_VERSION) {
    return { ok: false, kind: 'unknown-version', reason: 'That code is from a version of XRPL Bench this one does not understand.' }
  }
  return { ok: true, value: body }
}

export function decodeUnsigned(text: unknown): Decoded<UnsignedPayload> {
  const opened = open(text, 'u')
  if (!opened.ok) return opened
  const { network_id, tx } = opened.value
  const network = networkOfId(network_id)
  if (network === null) return { ok: false, kind: 'bad-network', reason: 'That code names a network this wallet does not know.' }
  if (!isPlainObject(tx)) return { ok: false, kind: 'malformed', reason: 'That code carries no transaction.' }
  return { ok: true, value: { v: QR_VERSION, network_id: network_id as number, network, tx } }
}

export function decodeSigned(text: unknown): Decoded<SignedPayload> {
  const opened = open(text, 's')
  if (!opened.ok) return opened
  const { tx_blob } = opened.value
  if (typeof tx_blob !== 'string' || !/^[0-9A-Fa-f]+$/.test(tx_blob)) {
    return { ok: false, kind: 'malformed', reason: 'That code carries no signed transaction.' }
  }
  return { ok: true, value: { v: QR_VERSION, tx_blob } }
}
