import { AccountSetAsfFlags, AccountSetTfFlags, PaymentFlags, TrustSetFlags } from 'xrpl'
import { displayCurrencyCode, formatAmountString, formatXrp } from '@/lib/xrpl/money'

/** Ledger fields that carry an amount: drops as XRP, an object as value, code and issuer. */
const AMOUNT_FIELDS = new Set(['Amount', 'Fee', 'SendMax', 'DeliverMin', 'LimitAmount'])

/** The ledger's own flag names (P-52: names stay as the ledger has them), per transaction type. */
const TX_FLAGS: Record<string, Record<string, string | number>> = {
  Payment: PaymentFlags,
  TrustSet: TrustSetFlags,
  AccountSet: AccountSetTfFlags,
}

/** A `Flags` field as the ledger names its bits; a bit with no name stays a number. */
function flagWords(txType: unknown, flags: number): string {
  const names = typeof txType === 'string' ? TX_FLAGS[txType] : undefined
  if (!names || flags === 0) return String(flags)
  const words: string[] = []
  let rest = flags >>> 0
  for (const [name, bit] of Object.entries(names)) {
    if (typeof bit !== 'number' || bit === 0 || (bit & (bit - 1)) !== 0) continue
    if ((rest & bit) >>> 0 === bit >>> 0) {
      words.push(name)
      rest = (rest & ~bit) >>> 0
    }
  }
  if (rest !== 0) words.push(String(rest))
  return words.join(', ')
}

/**
 * One field's value as the review shows it: drops as XRP, an issued amount as value,
 * code and issuer, `Flags` and an AccountSet's `SetFlag` / `ClearFlag` by the ledger's
 * own flag names (EXPERIENCE "Signing review": flags in words), anything else as is.
 */
export function fieldValue(name: string, value: unknown, txType?: unknown): string {
  if (AMOUNT_FIELDS.has(name)) {
    if (typeof value === 'string' && /^\d+$/.test(value)) return formatXrp(value)
    if (value && typeof value === 'object') {
      const { value: v, currency, issuer } = value as { value?: unknown; currency?: unknown; issuer?: unknown }
      if (typeof v === 'string' && typeof currency === 'string' && typeof issuer === 'string') {
        return `${formatAmountString(v)} ${displayCurrencyCode(currency)} ${issuer}`
      }
    }
  }
  if (name === 'Flags' && typeof value === 'number') return flagWords(txType, value)
  if (txType === 'AccountSet' && (name === 'SetFlag' || name === 'ClearFlag') && typeof value === 'number') {
    const flagName = (AccountSetAsfFlags as unknown as Record<number, string | undefined>)[value]
    return typeof flagName === 'string' ? flagName : String(value)
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
