import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AddressScan } from '@/components/wallet/AddressScan'
import { INVALID_ADDRESS } from '@/lib/same-address'
import { MUST_BE_REGULAR_KEY } from '@/lib/signs-for-words'
import { signsForDraftState, signsForIds } from '@/lib/signs-for'

/**
 * The Signs-for Account field (OS-FR-20), shared by the quiz step and the Signs for
 * plate: the shipped "Address" label, the field, P-40 under it, and the shipped
 * words for an address that does not check. A scan fills the field and is judged
 * like a typed address. Its ids are `signsForIds(idPrefix)`, for a key that
 * points at the reason.
 */
export function SignsForFields({
  draft,
  onDraft,
  disabled,
  idPrefix,
}: {
  draft: string
  onDraft: (draft: string) => void
  disabled: boolean
  idPrefix?: string
}) {
  const own = useId()
  const ids = signsForIds(idPrefix ?? own)
  const invalid = signsForDraftState(draft) === 'invalid'
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={ids.field}>Address</Label>
      <Input
        id={ids.field}
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="font-data"
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? `${ids.error} ${ids.note}` : ids.note}
      />
      {invalid && (
        <p id={ids.error} className="text-sm text-text-destructive">
          {INVALID_ADDRESS}
        </p>
      )}
      <p id={ids.note} className="text-sm text-muted-foreground">
        {MUST_BE_REGULAR_KEY}
      </p>
      {!disabled && <AddressScan onAddress={onDraft} />}
    </div>
  )
}

