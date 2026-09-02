import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * THE READOUT WELL — this panel's signature.
 *
 * One inset display window carrying the instrument's primary reading at panel
 * scale, with its derived readings as scale marks beneath the same rule. Not a
 * card, and deliberately not the hero-metric template (big number, small label,
 * three supporting stats, accent colour): the derived readings here are
 * *subordinate readings of the same quantity*, which is why they sit under one
 * rule inside one well instead of becoming their own tiles.
 *
 * Dark in both panel finishes, because a bench instrument's display is dark in
 * a lit room. That is what stops the light finish from being a washed-out
 * inversion of the dark one — the balance anchors the panel either way.
 *
 * `value` is always a pre-formatted string. Money never arrives here as a
 * number (docs/decisions.md guardrail #4), and every numeral is tabular so a
 * live account update cannot shift the digits under the reader's eye (§6.11).
 */
export interface ScaleMark {
  /** Engraved legend for this subordinate reading. */
  label: string
  /** Pre-formatted value string. */
  value: string
  /** Rendered after the value, e.g. an owned-object count. */
  note?: string
}

export function Readout({
  legend,
  value,
  unit,
  marks,
  lamp,
  footer,
  className,
}: {
  legend: string
  value: string
  unit?: string
  marks?: ScaleMark[]
  /**
   * A `StatusLegend`. State is never colour alone, and on this well's dark
   * ground the word takes `text-readout-muted` while the lamp stays lit.
   */
  lamp?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('panel-well rounded-md px-4 pb-4 pt-3 sm:px-6 sm:pb-7 sm:pt-5', className)} aria-label={legend}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="panel-legend text-readout-muted">{legend}</h2>
        {lamp}
      </div>

      {/* The primary reading. Clamped rather than stepped: at 320px it must not
          wrap, and on a desktop panel it should read from across the desk. */}
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2.5 sm:mt-2">
        <span className="font-data text-[clamp(2.25rem,11vw,5rem)] font-medium leading-[1.02] tracking-[-0.035em]">
          {value}
        </span>
        {unit && <span className="panel-legend text-sm tracking-[0.12em] text-readout-muted sm:text-base">{unit}</span>}
      </p>

      {marks && marks.length > 0 && (
        // The rule the scale marks hang from — the reason these are marks on
        // one instrument rather than separate cards.
        <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-2 border-t border-white/15 pt-3 sm:mt-6">
          {marks.map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="panel-legend text-readout-muted">{m.label}</dt>
              <dd className="font-data text-base leading-snug tracking-tight sm:text-lg">
                {m.value}
                {m.note && <span className="ml-1.5 font-legend text-xs tracking-normal text-readout-muted">{m.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {footer && <div className="mt-4 sm:mt-5">{footer}</div>}
    </section>
  )
}
