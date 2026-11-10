import { NETWORKS, NETWORK_IDS, type NetworkId } from '@/lib/xrpl/networks'
import { CborReader, encodeBytes } from '@/lib/ur/cbor'
import { decodeSinglePart, encodeSinglePart, looksLikeUr } from '@/lib/ur/ur'

/**
 * The QR payloads between two devices (FR-78, OS-FR-24; AD-30). This is the only
 * place a payload is defined, and a `lib` leaf: it imports no crypto, store or UI.
 *
 * Every payload is a Uniform Resource (BCR-2020-005): its UR type names the kind
 * and its message is a CBOR byte string holding the UTF-8 JSON envelope:
 *
 *   unsigned  ur:xrplbench-unsigned/<bytewords of bstr({"v":1,"network_id":n,"tx":{...}})>
 *   signed    ur:xrplbench-signed/<bytewords of bstr({"v":1,"network_id":n,"tx_blob":"..."})>
 *
 * `encode*` returns the whole payload as one single-part UR. Drawing it as one
 * still code or as an animated QR with fountain codes is `qr-frames.ts`'s job;
 * joining the frames a scanner reads back into this one text is
 * `qr-scan-session.ts`'s. `decode*` therefore always judges the whole payload,
 * never a frame, and so does every check after it.
 *
 * It still reads today's single-code form, `xrplbench:1:<u|s>:<base64url JSON>`,
 * so a code from a device on an older build is judged as before; it never writes
 * it. (A device on an older build cannot read a UR.)
 *
 * Both envelopes name their Network (route-checks.md "What travels by QR": a
 * Signed Transaction carries "an envelope naming the Network", OS-FR-9); a signed
 * code without one is refused as `bad-network`. `network_id` is an envelope field (the ledger's own `NetworkID` transaction
 * field exists only above 1024): Mainnet 0, Testnet 1, Devnet 2, from `NETWORKS`.
 * `decode*` returns a typed result and never throws. Nothing is refused for its
 * size (OS-FR-24) beyond a bound no payload of this app comes near.
 */

export const QR_VERSION = 1

/** The UR type of each payload kind. Every one starts with `xrplbench-`. */
export const PAYLOAD_UR_TYPES = { u: 'xrplbench-unsigned', s: 'xrplbench-signed' } as const
type PayloadKind = keyof typeof PAYLOAD_UR_TYPES

/** True for a UR type this app writes (or a later build may write): the scanner collects only these. */
export const isPayloadUrType = (type: string): boolean => type.startsWith('xrplbench-')

/** Text longer than this is not read at all: the message bound of the UR decoder, in Bytewords, plus room for the type. */
export const MAX_TEXT_LENGTH = 2 * 65536 + 256

/** Always `ok`: nothing is refused for its size (OS-FR-24). The shape is kept for the callers. */
export type Encoded = { ok: true; text: string }

export type CodecErrorKind = 'malformed' | 'unknown-version' | 'wrong-kind' | 'bad-network'
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
  network_id: number
  /** The Network `network_id` names: the one the Transmit step checks. */
  network: NetworkId
  tx_blob: string
}

/** Shipped words, also shown by the scanner when a joined code fails its checksum. */
export const CODE_UNREADABLE = 'That code could not be read.'
const NOT_A_CODE = 'That is not an XRPL Bench signing code.'
const UNKNOWN_VERSION = 'That code is from a version of XRPL Bench this one does not understand.'

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

function fromBase64Url(body: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw new Error('not base64url')
  const padded = body.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

function finish(kind: PayloadKind, payload: unknown): Encoded {
  const json = new TextEncoder().encode(JSON.stringify(payload))
  return { ok: true, text: encodeSinglePart({ type: PAYLOAD_UR_TYPES[kind], cbor: encodeBytes(json) }) }
}

/** The whole unsigned payload, as one single-part UR. */
export function encodeUnsigned(input: { network: NetworkId; tx: Record<string, unknown> }): Encoded {
  return finish('u', { v: QR_VERSION, network_id: networkIdOf(input.network), tx: input.tx })
}

/** The whole signed payload, as one single-part UR. */
export function encodeSigned(input: { network: NetworkId; txBlob: string }): Encoded {
  return finish('s', { v: QR_VERSION, network_id: networkIdOf(input.network), tx_blob: input.txBlob })
}

const WRONG_KIND: Record<PayloadKind, string> = {
  u: 'That is a signed transaction, not one waiting to be signed.',
  s: 'That is an unsigned transaction, not a signed one.',
}

/** The JSON envelope of a single-part UR payload of the given kind. */
function openUr(text: string, kind: PayloadKind): Decoded<unknown> {
  let type: string
  let cbor: Uint8Array
  try {
    ;({ type, cbor } = decodeSinglePart(text))
  } catch {
    // A frame of an animated code, a bad checksum, or not a UR at all.
    return { ok: false, kind: 'malformed', reason: /^ur:xrplbench-/i.test(text) ? CODE_UNREADABLE : NOT_A_CODE }
  }
  if (!isPayloadUrType(type)) return { ok: false, kind: 'malformed', reason: NOT_A_CODE }
  const found = (Object.keys(PAYLOAD_UR_TYPES) as PayloadKind[]).find((k) => PAYLOAD_UR_TYPES[k] === type)
  // A kind this build does not know: a later version wrote it.
  if (!found) return { ok: false, kind: 'unknown-version', reason: UNKNOWN_VERSION }
  if (found !== kind) return { ok: false, kind: 'wrong-kind', reason: WRONG_KIND[kind] }
  try {
    const r = new CborReader(cbor)
    const json = r.bytes()
    r.end()
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json)) }
  } catch {
    return { ok: false, kind: 'malformed', reason: CODE_UNREADABLE }
  }
}

/** The JSON envelope of a code in today's single-code form. */
function openLegacy(trimmed: string, kind: PayloadKind): Decoded<unknown> {
  const m = /^xrplbench:([^:]*):([^:]*):(.*)$/s.exec(trimmed)
  if (!m) return { ok: false, kind: 'malformed', reason: NOT_A_CODE }
  if (m[1] !== String(QR_VERSION)) return { ok: false, kind: 'unknown-version', reason: UNKNOWN_VERSION }
  if (m[2] !== 'u' && m[2] !== 's') return { ok: false, kind: 'malformed', reason: NOT_A_CODE }
  if (m[2] !== kind) return { ok: false, kind: 'wrong-kind', reason: WRONG_KIND[kind] }
  try {
    return { ok: true, value: fromBase64Url(m[3]) }
  } catch {
    return { ok: false, kind: 'malformed', reason: CODE_UNREADABLE }
  }
}

function open(text: unknown, kind: PayloadKind): Decoded<Record<string, unknown>> {
  if (typeof text !== 'string') return { ok: false, kind: 'malformed', reason: NOT_A_CODE }
  // A wrapped textarea or a pasted line break puts whitespace inside the body; none of it is data.
  const trimmed = text.replace(/\s+/g, '')
  if (trimmed.length > MAX_TEXT_LENGTH) return { ok: false, kind: 'malformed', reason: CODE_UNREADABLE }
  const opened = looksLikeUr(trimmed) ? openUr(trimmed, kind) : openLegacy(trimmed, kind)
  if (!opened.ok) return opened
  const body = opened.value
  if (!isPlainObject(body)) return { ok: false, kind: 'malformed', reason: CODE_UNREADABLE }
  if (body.v !== QR_VERSION) return { ok: false, kind: 'unknown-version', reason: UNKNOWN_VERSION }
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
  const { tx_blob, network_id } = opened.value
  if (typeof tx_blob !== 'string' || !/^[0-9A-Fa-f]+$/.test(tx_blob)) {
    return { ok: false, kind: 'malformed', reason: 'That code carries no signed transaction.' }
  }
  // A signed code from a build before the envelope named its Network (story 4) has
  // no `network_id`: it is from an older version, not from an unknown network.
  if (network_id === undefined) {
    return { ok: false, kind: 'unknown-version', reason: UNKNOWN_VERSION }
  }
  const network = networkOfId(network_id)
  if (network === null) return { ok: false, kind: 'bad-network', reason: 'That code names a network this wallet does not know.' }
  return { ok: true, value: { v: QR_VERSION, network_id: network_id as number, network, tx_blob } }
}
