import * as React from 'react'
import { cn } from '@/lib/utils'

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
 */
function Lamp({ tone = 'neutral', className, ...props }: React.ComponentProps<'span'> & { tone?: LampTone }) {
  return <span aria-hidden="true" data-slot="lamp" className={cn('panel-lamp', TONE[tone], className)} {...props} />
}

export { Lamp }
