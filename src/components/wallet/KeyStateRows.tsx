import { Alert, AlertDescription } from '@/components/ui/alert'
import type { KeyState } from '@/lib/qr-codec'
import { MASTER_KEY_TYPE, REGULAR_KEY_TYPE, SHIPPED_KEYS } from '@/lib/offline-round-words'
import { NONE, VALUE_UNKNOWN } from '@/lib/transmitter-words'

/**
 * The Account's key state as a Data to Sign carries it (display only, route-checks
 * "What travels by QR"): Regular Key (the address, "None." or P-29) and Master key
 * (on, off or P-29). Unknown is said as unknown, never as safe (OS-FR-21). The
 * row terms are P-62's type words, as on the Transmitter's Account screen.
 */
export function KeyStateRows({ keyState }: { keyState: KeyState }) {
  const known = keyState === 'unknown' ? null : keyState
  return (
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
    </dl>
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
