import { useRef, useState } from 'react'
import { decode } from 'xrpl'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { displayCurrencyCode, formatAmountString, formatXrp } from '@/lib/xrpl/money'
import type { SignedForReview } from '@/lib/xrpl/writes'
import {
  COPY_KEY,
  DO_NOT_SEND_KEY,
  SEND_IT_QUESTION,
  SEND_KEY,
  STILL_VALID_WARNING,
  TRANSACTION_HASH,
  fill,
} from '@/lib/transmit-words'

/** Ledger fields that carry an amount: drops as XRP, an object as value, code and issuer. */
const AMOUNT_FIELDS = new Set(['Amount', 'Fee', 'SendMax', 'DeliverMin', 'LimitAmount'])

function fieldValue(name: string, value: unknown): string {
  if (AMOUNT_FIELDS.has(name)) {
    if (typeof value === 'string' && /^\d+$/.test(value)) return formatXrp(value)
    if (value && typeof value === 'object') {
      const { value: v, currency, issuer } = value as { value?: unknown; currency?: unknown; issuer?: unknown }
      if (typeof v === 'string' && typeof currency === 'string' && typeof issuer === 'string') {
        return `${formatAmountString(v)} ${displayCurrencyCode(currency)} ${issuer}`
      }
    }
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/** The decoded blob, one row per field, in the ledger's own field names (P-52). */
function decodedFields(txBlob: string): Array<[string, string]> {
  try {
    return Object.entries(decode(txBlob)).map(([name, value]) => [name, fieldValue(name, value)])
  } catch {
    return []
  }
}

/**
 * "Show the signed transaction before sending" (OS-FR-10, EXPERIENCE "Transmit
 * step"): the hash, the decoded fields and Copy, then "Send it to the ledger?"
 * with Send (the commit key) and Do not send. Every way out that is not Send
 * (Do not send, Escape, the close control) answers `false`. Copy shows P-24
 * and keeps it on screen. Focus goes to the question, never to Send.
 */
export function SignedTransactionReview({ signed, onAnswer }: { signed: SignedForReview; onAnswer: (send: boolean) => void }) {
  const [copied, setCopied] = useState(false)
  const questionRef = useRef<HTMLHeadingElement | null>(null)
  const fields = decodedFields(signed.txBlob)
  const warning = fill(STILL_VALID_WARNING, signed.lastLedgerSequence)

  async function copy() {
    try {
      await navigator.clipboard.writeText(signed.txBlob)
    } finally {
      // The warning holds whether or not the clipboard took it: the blob is on screen.
      setCopied(true)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onAnswer(false)}>
      <DialogContent
        variant="sheet"
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          questionRef.current?.focus()
        }}
      >
        {/* Right padding keeps the first row clear of the sheet's close control. */}
        <div className="grid min-w-0 gap-1 pr-8">
          <h3 className="panel-legend [overflow-wrap:anywhere]">{TRANSACTION_HASH}</h3>
          <p className="font-data text-[0.8125rem] leading-relaxed tracking-tight [overflow-wrap:anywhere]">{signed.hash}</p>
        </div>
        {/* Every cell may break anywhere: a ledger field name (LastLedgerSequence)
            in the tracked legend face is wider than a 320px sheet at 200% text. */}
        <dl className="grid min-w-0 gap-2">
          {fields.map(([name, value]) => (
            <div key={name} className="grid min-w-0 gap-0.5">
              <dt className="panel-legend [overflow-wrap:anywhere]">{name}</dt>
              <dd className="font-data text-[0.8125rem] leading-relaxed tracking-tight [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-3">
          <div>
            <Button type="button" variant="outline" onClick={copy}>
              {COPY_KEY}
            </Button>
          </div>
          {/* Rendered from the start as an empty live region, so the warning is
              announced when Copy fills it rather than inserted unannounced. */}
          <div role="status" aria-live="polite">
            {copied && (
              <Alert variant="warning" role="presentation">
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>
        <DialogTitle ref={questionRef} tabIndex={-1} className="[overflow-wrap:anywhere]">
          {SEND_IT_QUESTION}
        </DialogTitle>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAnswer(false)}>
            {DO_NOT_SEND_KEY}
          </Button>
          {/* The one control here that moves funds, so the only one in --commit. */}
          <Button type="button" variant="commit" onClick={() => onAnswer(true)}>
            {SEND_KEY}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
