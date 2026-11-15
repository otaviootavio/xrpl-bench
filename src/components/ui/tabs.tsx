import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

/**
 * The `nav` layout per number of functions (EXPERIENCE "Screens by type"). Full
 * class strings, never built from the number, so Tailwind emits each one.
 *
 * - 6 (an Online Wallet): two rows of three below `sm`, six columns from `sm` up.
 * - 5 (an Offline Wallet): below `sm`, third-width keys that grow to fill their
 *   row and wrap by label width, so "New transaction" (wider than a third at
 *   320px) gives 2 + 2 + 1 at 320px and 2 + 3 at 390px; five columns from `sm` up.
 * - 2 (an unsynced Transmitter Wallet): two columns at every width.
 *
 * Every function is present at 320px: nothing scrolls out of view and no label
 * is shortened (docs/decisions.md §6.13, superseding §6.8). Below `sm` (and for
 * two, at every width) the row is a wrapping flex of fixed-fraction triggers
 * that cannot shrink under their own word, so at 200% text it falls to fewer
 * per row instead of overprinting: a grid's `minmax(0,1fr)` columns cannot.
 */
const NAV_LAYOUT = {
  6: 'flex w-full flex-wrap sm:grid sm:grid-cols-6 [&>*]:grow [&>*]:basis-1/3 [&>*]:min-w-fit sm:[&>*]:basis-auto sm:[&>*]:min-w-0',
  5: 'flex w-full flex-wrap sm:grid sm:grid-cols-5 [&>*]:grow [&>*]:basis-1/3 [&>*]:min-w-fit sm:[&>*]:basis-auto sm:[&>*]:min-w-0',
  2: 'flex w-full flex-wrap [&>*]:grow [&>*]:basis-1/2 [&>*]:min-w-fit',
} as const

/**
 * The function selector.
 *
 * A flat row of engraved legends cut into the chassis, with the selected
 * function marked by a lit rule beneath it — the way a panel's function switch
 * shows its detent. Not a pill strip: pills read as web chrome and would be the
 * one stock component left inside a committed panel.
 *
 * Responsive behaviour stays in the primitive, never at the call site
 * (docs/decisions.md §6.8/§6.13): the layout per count is `NAV_LAYOUT`, with
 * no fixed height so it can never clip its own triggers. Every function is
 * reachable at 320px without scrolling.
 */
/**
 * `nav` is the app's function selector (six, five or two functions, `count`). `inline` is a compact filter row
 * (History's sent/received). They are different controls, so the distinction
 * lives here as a variant rather than as a call-site override that would fight
 * the primitive (docs/decisions.md §4).
 */
function TabsList({
  className,
  variant = 'nav',
  count = 6,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  variant?: 'nav' | 'inline'
  /** `nav` only: how many functions the selector holds. */
  count?: keyof typeof NAV_LAYOUT
}) {
  return (
    <TabsPrimitive.List
      className={cn(
        'items-stretch border-b border-border text-muted-foreground',
        variant === 'nav' && NAV_LAYOUT[count],
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
        'pointer-coarse:min-h-11 pointer-coarse:text-xs',
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
