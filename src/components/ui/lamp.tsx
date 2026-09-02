import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Tone to text token.
 *
 * One map, used twice: it colours the lamp's own disc (via `currentColor`) and
 * the word beside it. Deliberately NOT unified with `NOTICE_TONE` in
 * `ui/alert` — that map keys on notice variants, bundles a border, and belongs
 * to a different device. Two small maps that mean different things beat one
 * that means neither.
 */
const TONE = {
  neutral: 'text-muted-foreground',
  live: 'text-text-success',
  caution: 'text-text-warning',
  alert: 'text-text-destructive',
} as const

export type LampTone = keyof typeof TONE

/**
 * An indicator lamp.
 *
 * The panel's vocabulary for live state: a small lit disc with a bounded glow,
 * not a tinted pill. It is decorative on its own and therefore always
 * `aria-hidden` — the meaning must live in adjacent visible text, which is both
 * WCAG 1.4.1 (never colour alone) and this project's own rule that a state
 * change also changes the accessible name (docs/decisions.md §6.5).
 *
 * Pair it with a label. Never ship a bare lamp as the only carrier of a state.
 * `StatusLegend` below is that pairing, and is what call sites normally want;
 * reach for a bare `Lamp` only where the word is already on screen for another
 * reason (a select item's own text, say).
 */
function Lamp({ tone = 'neutral', className, ...props }: React.ComponentProps<'span'> & { tone?: LampTone }) {
  return <span aria-hidden="true" data-slot="lamp" className={cn('panel-lamp', TONE[tone], className)} {...props} />
}

/**
 * A lit lamp beside its word — the panel's device for reporting live state.
 *
 * This is DESIGN.md's "report live state as a lamp plus an adjacent visible
 * word" rule as an actual component. It was hand-rolled at six call sites with
 * the same string before it had a name, which is how the readout's copy drifted
 * to `flex` while every other site used `inline-flex`.
 *
 * `className` overrides the word's colour without touching the lamp's: the
 * lamp carries its own tone through `currentColor`, so a legend sitting on the
 * dark readout well can take `text-readout-muted` for the word and still show a
 * green lamp (BalancesTab's "Live"). That is the one place the two diverge, and
 * it is the reason the tone is not simply inherited.
 *
 * Wrapping is the caller's call: the default wraps, because most legends are
 * one or two words inside `flex-wrap` rows. Pass `whitespace-nowrap` where the
 * text is a long result code that must not break mid-token.
 */
function StatusLegend({
  tone,
  className,
  children,
  ...props
}: React.ComponentProps<'span'> & { tone: LampTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.1em]',
        TONE[tone],
        className,
      )}
      {...props}
    >
      <Lamp tone={tone} />
      {children}
    </span>
  )
}

export { Lamp, StatusLegend }
