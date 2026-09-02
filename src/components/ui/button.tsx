import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Panel keys.
 *
 * Every variant is a physical key on the instrument's face: a raised cap with a
 * light top edge and a shadow under it, an engraved legend cut into the cap,
 * and real travel when pressed. Nothing here styles `:focus` or sets
 * `outline-none` — the browser's own two-tone ring is the focus indicator
 * (docs/decisions.md §6.3).
 *
 * `destructive` is the saturated red fill and, like `commit`, is reserved for
 * the moment of commitment — the confirm button inside a dialog. Use `danger`
 * for a control that merely leads there.
 *
 * `commit` is the reserved key. It is the ONLY control class allowed to use
 * --commit, and it means one thing: pressing this moves funds. Sending a
 * payment, signing, confirming a spend. Using it anywhere else destroys the
 * signal, so it is not a decorative "primary" — `default` is the ordinary key.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'font-legend font-semibold uppercase tracking-[0.09em]',
    'border transition-[background-color,box-shadow,translate] duration-75',
    // Real key travel: the cap sinks onto the panel and loses its shadow.
    'active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-55 disabled:shadow-none',
    'aria-disabled:pointer-events-none aria-disabled:opacity-55 aria-disabled:shadow-none',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'border-primary bg-primary text-primary-foreground',
          'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.14),0_1px_2px_0_rgb(0_0_0/0.28)]',
          'hover:bg-primary/90 active:shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.4)]',
        ].join(' '),
        commit: [
          'border-commit bg-commit text-commit-foreground',
          'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.24),0_1px_2px_0_rgb(0_0_0/0.3)]',
          'hover:bg-commit/90 active:shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.4)]',
        ].join(' '),
        destructive: [
          'border-destructive bg-destructive text-destructive-foreground',
          'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.2),0_1px_2px_0_rgb(0_0_0/0.28)]',
          'hover:bg-destructive/90 active:shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.4)]',
        ].join(' '),
        // Leads to a destructive action without being one. Four saturated red
        // fills on the Settings plate were louder than the commit key has ever
        // been allowed to be; the fill now belongs only to the confirm step.
        danger: [
          'border-destructive/55 bg-card text-text-destructive',
          'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.4),0_1px_2px_-1px_rgb(0_0_0/0.16)]',
          'hover:bg-destructive/10 active:shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.18)]',
        ].join(' '),
        outline: [
          'border-input bg-card text-foreground',
          'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.5),0_1px_2px_-1px_rgb(0_0_0/0.18)]',
          'hover:bg-accent hover:text-accent-foreground active:shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.18)]',
        ].join(' '),
        secondary: [
          'border-border bg-secondary text-secondary-foreground',
          'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.4),0_1px_2px_-1px_rgb(0_0_0/0.16)]',
          'hover:bg-secondary/80 active:shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.18)]',
        ].join(' '),
        // Not a key: a bare legend cut straight into the panel.
        ghost: 'border-transparent text-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'border-transparent normal-case tracking-normal text-foreground underline underline-offset-4 hover:text-text-warning',
      },
      size: {
        default: 'h-9 px-4 text-[0.8125rem]',
        sm: 'h-8 px-3 text-[0.6875rem]',
        lg: 'h-11 px-6 text-sm',
        icon: 'h-9 w-9 px-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

// buttonVariants is the cva instance this file defines; exporting it from
// elsewhere would let a call site build a key variant without the
// reserved-colour rules above.
// oxlint-disable-next-line react/only-export-components
export { Button, buttonVariants }
