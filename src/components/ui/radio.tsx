import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A selector detent: one position of a range switch.
 *
 * A native `input[type=radio]` underneath, so grouping, arrow keys and the
 * accessible name come from the platform; this only draws it as a recessed
 * disc with a solid dot when set (shape, not colour, carries the state). The
 * browser's own focus ring is untouched. On a coarse pointer the hit area
 * grows to 44px through the wrapper's pseudo-element, without moving layout.
 */
function Radio({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <span className="relative mt-0.5 inline-flex size-4 shrink-0 pointer-coarse:mt-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-3.5 pointer-coarse:after:content-['']">
      <input
        type="radio"
        data-slot="radio"
        className={cn(
          'm-0 size-4 shrink-0 appearance-none rounded-full border border-input bg-background',
          'shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.14)]',
          'checked:border-foreground checked:bg-[radial-gradient(circle,var(--foreground)_0_38%,transparent_44%)]',
          // Forced colours replace the authored palette; the dot is a gradient
          // drawn in --foreground, so name a system colour that is guaranteed to
          // contrast with the forced Canvas behind it.
          'forced-colors:checked:border-[Highlight] forced-colors:checked:bg-[radial-gradient(circle,CanvasText_0_38%,transparent_44%)]',
          'disabled:cursor-not-allowed disabled:opacity-55',
          className,
        )}
        {...props}
      />
    </span>
  )
}

export { Radio }
