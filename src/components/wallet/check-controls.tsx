import { useId, type ReactNode } from 'react'
import type { OptionState } from '@/lib/crypto/policy'

/** The radio and fieldset the creation flow and the edit dialog both render a
 * policy answer with. An unavailable answer stays in the reading order:
 * `aria-disabled`, its reason in visible text, and selecting it does nothing. */

/** One radio. An unavailable answer stays in the reading order: `aria-disabled`,
 * its reason in visible text, and selecting it does nothing. */
export function Choice({
  name,
  checked,
  label,
  state,
  onSelect,
  detail,
}: {
  name: string
  checked: boolean
  label: ReactNode
  state: OptionState
  onSelect: () => void
  detail?: ReactNode
}) {
  const textId = useId()
  const hasText = !state.available || !!state.note || !!detail
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name={name}
          checked={checked}
          aria-disabled={state.available ? undefined : true}
          aria-describedby={hasText ? textId : undefined}
          onChange={() => {
            if (state.available) onSelect()
          }}
          onClick={(event) => {
            if (!state.available) event.preventDefault()
          }}
          className="mt-1"
        />
        <span>{label}</span>
      </label>
      {hasText && (
        <div id={textId} className="ml-6">
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
          {state.note && <p className="text-xs text-muted-foreground">{state.note}</p>}
          {!state.available && state.reason && <p className="text-xs text-text-warning">{state.reason}</p>}
        </div>
      )}
    </div>
  )
}

export function Axis({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {children}
    </fieldset>
  )
}
