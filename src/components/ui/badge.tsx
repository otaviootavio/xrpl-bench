import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Stamped tags.
 *
 * A badge is a small stamped plate, square-cut and set in the legend face.
 * Semantic variants use the measured fill/-foreground pairs from the token
 * layer — never a fill token as a text colour (docs/decisions.md §6.2).
 *
 * For "is this thing currently in state X" use `Lamp`, not a badge: a lamp is
 * the panel's vocabulary for live state, a stamped tag is for a fixed label.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-px font-legend text-[0.6875rem] font-semibold uppercase leading-[1.35] tracking-[0.1em]',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        destructive: 'border-destructive bg-destructive text-destructive-foreground',
        outline: 'border-input bg-transparent text-foreground',
        warning: 'border-warning bg-warning text-warning-foreground',
        success: 'border-success bg-success text-success-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

// Same as button.tsx: badgeVariants belongs to the component that owns its
// variants.
// oxlint-disable-next-line react/only-export-components
export { Badge, badgeVariants }
