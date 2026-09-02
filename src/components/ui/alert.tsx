import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { type LampTone } from '@/components/ui/lamp'

/**
 * Panel notices, built as annunciators.
 *
 * A panel does not wash a whole region in amber to say "caution" — it lights a
 * legend. So the notice's *title* is a small lit plate carrying the lamp
 * colour, and the body sits on plate ground beneath it.
 *
 * That shape resolves a real tension. Washing the whole field (the first
 * attempt) put two hue-72 fields beside the hue-42 commit key at the exact
 * moment the reservation had to be singular. Removing the wash entirely (the
 * second) flattened "this payment will fail to activate" to the weight of body
 * copy, on a wallet whose owner ranked correctness about money above
 * everything. The annunciator keeps salience and the reservation both: the lit
 * area is legend-sized, so --commit is still the only saturated *field*, while
 * a caution is unmistakably louder than prose.
 *
 * Colour is never the carrier: the tone is stated in the title's words, and the
 * lit legend uses the measured fill/-foreground pairs from the token layer
 * (docs/decisions.md §6.2, §7.3).
 *
 * Deliberately no thick coloured left rule — a 4px accent bar is a generic
 * callout costume.
 */
const alertVariants = cva(
  // Recessed rather than recoloured, so a notice reads as a different PLANE
  // when it sits on a plate that shares its ground.
  'relative w-full rounded-md border px-3 pb-2.5 pt-2 text-sm shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.10)]',
  {
    variants: {
      variant: {
        default: 'border-border bg-muted/40 text-foreground',
        destructive: 'border-destructive/55 bg-card text-text-destructive',
        warning: 'border-warning/60 bg-card text-text-warning',
        success: 'border-success/55 bg-card text-text-success',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

/** The lit legend plate. Uses only measured fill/-foreground pairs. */
const ANNUNCIATOR: Record<string, string> = {
  default: 'bg-muted text-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  warning: 'bg-warning text-warning-foreground',
  success: 'bg-success text-success-foreground',
}

const LAMP_TONE: Record<string, LampTone> = {
  default: 'neutral',
  destructive: 'alert',
  warning: 'caution',
  success: 'live',
}

const AlertVariantContext = React.createContext<string>('default')

function Alert({
  className,
  variant,
  children,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  const key = variant ?? 'default'
  return (
    <AlertVariantContext.Provider value={key}>
      <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
        {children}
      </div>
    </AlertVariantContext.Provider>
  )
}

function AlertTitle({ className, children, ...props }: React.ComponentProps<'div'>) {
  const variant = React.useContext(AlertVariantContext)
  return (
    <div
      className={cn(
        'mb-1.5 inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5',
        'font-legend text-[0.75rem] font-semibold uppercase leading-[1.35] tracking-[0.1em]',
        'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22)]',
        ANNUNCIATOR[variant],
        className,
      )}
      {...props}
    >
      {/* The lamp is inside the lit legend, the way an annunciator reads. It is
          decoration; the words beside it carry the meaning. */}
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-current opacity-70"
        data-lamp={LAMP_TONE[variant]}
      />
      {children}
    </div>
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('text-sm leading-snug [&_p]:leading-snug', className)} {...props} />
}

export { Alert, AlertTitle, AlertDescription }
