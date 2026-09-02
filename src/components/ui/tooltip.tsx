import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

/**
 * A readout window on a stalk.
 *
 * Rendered as the panel's well rather than a floating dark pill, because what a
 * tooltip carries here is a full address or transaction hash — a value to be
 * compared character by character (docs/decisions.md §6.6). Set in the data
 * face and allowed to wrap, so a 64-character hash is actually readable instead
 * of clipped. Radix exposes this via `aria-describedby`, so it reaches a screen
 * reader too. No animation classes: §6.10 deleted the inert ones rather than
 * shipping declared motion that does not exist.
 */
function TooltipContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'panel-well z-50 max-w-[min(22rem,calc(100vw-2rem))] rounded-md px-2.5 py-1.5',
          'font-data text-xs leading-relaxed tracking-tight break-all',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
