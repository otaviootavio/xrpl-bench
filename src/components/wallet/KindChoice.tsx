import { useId } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Choice } from '@/components/wallet/check-controls'
import { KIND_QUESTION, TEXT_A, TEXT_B, WARNING_READ, WARNINGS_CHANGED, type WarningText } from '@/lib/offline-wallet-words'
import { KIND_WORDS } from '@/lib/wallet-kind-words'

export type NewWalletKind = 'online' | 'offline'

/**
 * Quiz step 1's kind question (OS-FR-2, EXPERIENCE "Kind radios" and
 * "Consequence block"). Native radios with the approved question as a visible
 * legend and no default, so the consequences are read before a choice. The
 * chosen kind's text shows in place below the group: Text A for Online, Text B
 * for Offline, whose WARNING needs its own acknowledgement. Every word comes from
 * `offline-wallet-words.ts`; the radio labels are the kind words.
 */
export function KindChoice({
  group,
  kind,
  onKind,
  legendId,
  warningRead,
  onWarningRead,
  ticksReset,
  disabled,
}: {
  group: string
  kind: NewWalletKind | null
  onKind: (kind: NewWalletKind) => void
  /** The legend's id: Next points at the question while nothing is chosen. */
  legendId: string
  warningRead: boolean
  onWarningRead: (read: boolean) => void
  /** The kind changed after a warning was ticked: P-60 is announced. */
  ticksReset: boolean
  disabled?: boolean
}) {
  return (
    <div data-slot="kind-choice" className="flex min-w-0 flex-col gap-3">
      <fieldset className="flex min-w-0 flex-col gap-1.5">
        <legend id={legendId} className="panel-legend mb-1">
          {KIND_QUESTION}
        </legend>
        <Choice name={`${group}-kind`} checked={kind === 'online'} label={KIND_WORDS.online} state={{ available: true }} disabled={disabled} onSelect={() => onKind('online')} />
        <Choice name={`${group}-kind`} checked={kind === 'offline'} label={KIND_WORDS.offline} state={{ available: true }} disabled={disabled} onSelect={() => onKind('offline')} />
      </fieldset>
      {/* Always mounted, so a screen reader hears the text arrive. */}
      <p role="status" aria-live="polite" className={ticksReset ? 'text-sm' : 'sr-only'}>
        {ticksReset ? WARNINGS_CHANGED : ''}
      </p>
      {kind === 'online' && <ConsequenceLines lines={TEXT_A} />}
      {kind === 'offline' && (
        <>
          <ConsequenceLines lines={TEXT_B.lines} />
          <AcknowledgedWarning warning={TEXT_B.warning} read={warningRead} onRead={onWarningRead} disabled={disabled} />
        </>
      )}
    </div>
  )
}

function ConsequenceLines({ lines }: { lines: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
      {lines.map((line) => (
        <li key={line} className="break-words">
          {line}
        </li>
      ))}
    </ul>
  )
}

/**
 * One WARNING as a caution Alert, its bold sentence as the lit legend, followed by
 * its P-6 checkbox. The box is named by P-6 plus the warning's bold sentence and
 * described by the rest of the warning, so a screen reader hears which warning it
 * confirms (EXPERIENCE "Accessibility Floor").
 */
export function AcknowledgedWarning({ warning, read, onRead, disabled }: { warning: WarningText; read: boolean; onRead: (read: boolean) => void; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Alert variant="warning" role="none">
        {/* At 320px and 200% text a tracked uppercase word is wider than the plate:
            the legend may break anywhere rather than run out of the Alert. */}
        <AlertTitle className="max-w-full [overflow-wrap:break-word]">
          <span id={`${id}-title`} className="min-w-0">
            {warning.title}
          </span>
        </AlertTitle>
        <AlertDescription id={`${id}-body`} className="break-words">
          {warning.body}
        </AlertDescription>
      </Alert>
      <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
        <Checkbox
          checked={read}
          disabled={disabled}
          aria-labelledby={`${id}-read ${id}-title`}
          aria-describedby={`${id}-body`}
          onCheckedChange={(v) => onRead(v === true)}
        />
        <span id={`${id}-read`}>{WARNING_READ}</span>
      </label>
    </div>
  )
}
