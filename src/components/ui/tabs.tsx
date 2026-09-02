import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

/**
 * The function selector.
 *
 * A flat row of engraved legends cut into the chassis, with the selected
 * function marked by a lit rule beneath it — the way a panel's function switch
 * shows its detent. Not a pill strip: pills read as web chrome and would be the
 * one stock component left inside a committed panel.
 *
 * Responsive behaviour stays in the primitive, never at the call site
 * (docs/decisions.md §6.8/§6.13): two rows of three below `sm`, six equal
 * columns from `sm` up, and no fixed height so it can never clip its own
 * triggers. Every function is reachable at 320px without scrolling.
 */
/**
 * `nav` is the app's six-function selector. `inline` is a compact filter row
 * (History's sent/received). They are different controls, so the distinction
 * lives here as a variant rather than as a call-site override that would fight
 * the primitive (docs/decisions.md §4).
 */
function TabsList({
  className,
  variant = 'nav',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: 'nav' | 'inline' }) {
  return (
    <TabsPrimitive.List
      className={cn(
        'items-stretch border-b border-border text-muted-foreground',
        // Two rows of three below `sm`, six columns from `sm` up. Every
        // function is present at 320px: nothing scrolls out of view and no
        // label is shortened (docs/decisions.md §6.13, superseding §6.8).
        variant === 'nav' && 'grid w-full grid-cols-3 sm:grid-cols-6',
        variant === 'inline' && 'inline-flex',
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center whitespace-nowrap px-3 pb-2 pt-1.5',
        'font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.11em]',
        'transition-colors hover:text-foreground',
        'disabled:pointer-events-none disabled:opacity-55',
        // The detent: a lit rule sitting on the strip's own bottom border.
        // Deliberately --foreground and not --commit: the commit colour is
        // reserved for controls that move funds, and a navigation detent is not
        // one. Spending it here would dilute the only signal that matters.
        'after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-transparent',
        'data-[state=active]:text-foreground data-[state=active]:after:bg-foreground',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('mt-4', className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
