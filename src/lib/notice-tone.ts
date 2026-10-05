/**
 * The tone of a notice: its edge and its text, with no ground.
 *
 * Lives in `lib` rather than beside the `Alert` component because three
 * different layers need it and dependencies point one way only (AD-1): the
 * notice store types a field with it, `lib/notify.tsx` maps each notify type
 * onto it, and `components/ui/alert.tsx` plus `components/Annunciator.tsx`
 * paint with it. Holding it in `components` forced `lib` and `store` to import
 * upward, which is the edge AD-1 exists to forbid.
 *
 * Ground is deliberately excluded: an inline notice is recessed into the plate
 * it sits on, the Annunciator's rows sit on plate ground, and only the tone is
 * shared.
 */
export const NOTICE_TONE = {
  default: 'border-border text-foreground',
  destructive: 'border-destructive/55 text-text-destructive',
  warning: 'border-warning/60 text-text-warning',
  success: 'border-success/55 text-text-success',
} as const

export type NoticeTone = keyof typeof NOTICE_TONE
