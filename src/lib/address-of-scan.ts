import { isValidClassicAddress } from 'xrpl'

/**
 * The address a scanned code carries, or `null`: a classic address alone, or the
 * app's own receive form `ripple:<address>[?dt=…]` (`QrCode`). Anything else is
 * not an address and is passed over, so the field keeps what it had.
 */
export function addressOfScan(raw: string): string | null {
  const text = raw.trim()
  const candidate = /^ripple:([^?]+)(\?.*)?$/i.exec(text)?.[1] ?? text
  return isValidClassicAddress(candidate) ? candidate : null
}
