import { useId, type ReactNode } from 'react'
import type { OptionState } from '@/lib/crypto/policy'
import { Radio } from '@/components/ui/radio'

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
  disabled,
}: {
  name: string
  checked: boolean
  label: ReactNode
  state: OptionState
  onSelect: () => void
  detail?: ReactNode
  /** Inert while something is running: the native `disabled`, unlike an unavailable answer. */
  disabled?: boolean
}) {
  const textId = useId()
  const hasText = !state.available || !!state.note || !!detail
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex items-start gap-2 text-sm pointer-coarse:min-h-11 pointer-coarse:items-center">
        <Radio
          name={name}
          checked={checked}
          disabled={disabled}
          aria-disabled={state.available ? undefined : true}
          aria-describedby={hasText ? textId : undefined}
          onChange={() => {
            if (state.available) onSelect()
          }}
          onClick={(event) => {
            if (!state.available) event.preventDefault()
          }}
        />
        <span>{label}</span>
      </label>
      {hasText && (
        <div id={textId} className="ml-6 min-w-0 break-words">
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
          {state.note && <p className="text-xs text-muted-foreground">{state.note}</p>}
          {!state.available && state.reason && <p className="text-xs text-text-warning">{state.reason}</p>}
        </div>
      )}
    </div>
  )
}

export function Axis({ legend, hideLegend, children }: { legend: string; /** The legend names the group for assistive tech only: a heading above already says it. */ hideLegend?: boolean; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className={hideLegend ? 'sr-only' : 'panel-legend mb-1'}>{legend}</legend>
      {children}
    </fieldset>
  )
}
