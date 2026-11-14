import { Alert, AlertDescription } from '@/components/ui/alert'
import type { KeyState } from '@/lib/qr-codec'
import { KEY_STATE, MASTER_KEY_TYPE, REGULAR_KEY_TYPE, SHIPPED_KEYS, SIGNER_LIST } from '@/lib/offline-round-words'
import { signerListWords } from '@/lib/offline-round'
import { NONE, VALUE_UNKNOWN } from '@/lib/transmitter-words'

/**
 * The Account's key state as a Data to Sign carries it (display only, route-checks
 * "What travels by QR"), under the "Key state" heading (approved 2026-11-14): Regular
 * Key (the address, "None." or P-29), Master key (on, off or P-29) and Signer list
 * ("None.", "{n} signers, quorum {q}" or P-29). Unknown is said as unknown, never as
 * safe (OS-FR-21). The row terms are P-62's type words and the approved "Signer list".
 */
export function KeyStateRows({ keyState, headingLevel = 3 }: { keyState: KeyState; headingLevel?: 2 | 3 }) {
  const known = keyState === 'unknown' ? null : keyState
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <section aria-label={KEY_STATE} className="flex min-w-0 flex-col gap-2">
      <Heading className="panel-legend">{KEY_STATE}</Heading>
      <dl className="grid min-w-0 gap-2 text-sm">
        <div className="grid min-w-0 gap-0.5">
          <dt className="panel-legend">{REGULAR_KEY_TYPE}</dt>
          <dd className={known?.regular_key ? 'font-data text-[0.8125rem] tracking-tight [overflow-wrap:anywhere]' : undefined}>
            {!known ? VALUE_UNKNOWN : (known.regular_key ?? NONE)}
          </dd>
        </div>
        <div className="grid min-w-0 gap-0.5">
          <dt className="panel-legend">{MASTER_KEY_TYPE}</dt>
          <dd>{!known ? VALUE_UNKNOWN : known.master_key === 'off' ? SHIPPED_KEYS.masterKeyOff : SHIPPED_KEYS.masterKeyOn}</dd>
        </div>
        <div className="grid min-w-0 gap-0.5">
          <dt className="panel-legend">{SIGNER_LIST}</dt>
          <dd>{signerListWords(known ? known.signer_list : 'unknown')}</dd>
        </div>
      </dl>
    </section>
  )
}

/** A key warning (W4's sentence, W5), words unchanged, as a caution that never blocks. */
export function KeyWarning({ words }: { words: string }) {
  return (
    <Alert variant="warning" role="none">
      <AlertDescription className="break-words">{words}</AlertDescription>
    </Alert>
  )
}
