import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

/**
 * A panel rocker.
 *
 * Rectangular, not a pill: the cap slides in a machined slot. The slot is
 * recessed and the cap is raised, so the state reads from the geometry as well
 * as from the fill.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-sm border border-input p-px',
        'shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.22)] transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-55',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block h-full w-4 rounded-[1px] bg-card',
          'shadow-[0_1px_0_0_rgb(255_255_255/0.4),0_1px_2px_0_rgb(0_0_0/0.3)]',
          'transition-transform data-[state=checked]:translate-x-[1.0625rem] data-[state=unchecked]:translate-x-0',
          'motion-reduce:transition-none',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
