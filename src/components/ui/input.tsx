import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A recessed field.
 *
 * Genuinely inset rather than outlined: an inner shadow with offset and blur,
 * cut into the plate. The boundary uses --input, the one border token measured
 * at 3:1 in both finishes, because it is what identifies a field as a field
 * (WCAG 1.4.11) — the incumbent value was ~1.2:1 on white.
 *
 * Set in the data face by default: almost every field on this panel receives an
 * address, an amount, a currency code, or a seed, all of which are read by
 * character-comparison. Pass `font-legend` for the rare prose field.
 *
 * Nothing here touches `:focus` or sets `outline-none` (docs/decisions.md §6.3).
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 py-1',
        'font-data text-[0.8125rem] tracking-tight',
        'shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.14)]',
        'transition-colors placeholder:font-legend placeholder:tracking-normal placeholder:text-muted-foreground',
        'file:border-0 file:bg-transparent file:font-legend file:text-sm file:font-medium',
        'disabled:cursor-not-allowed disabled:opacity-55',
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
