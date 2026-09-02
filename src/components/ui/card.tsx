import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Engraved legend plates.
 *
 * A Card is a plate screwed onto the chassis: a lighter surface, a scribed
 * edge, a light top edge and a shadow beneath. Padding is panel-dense rather
 * than the marketing-page `p-6` shadcn ships, because the point of this surface
 * is that a position fits in one screen.
 */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('panel-plate rounded-md text-card-foreground', className)} {...props} />
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      // Stacked by default so a description sits under its legend. A card that
      // wants a short right-hand meta value (a count, a filter) opts into a row
      // with `sm:flex-row sm:items-baseline sm:justify-between`.
      className={cn('flex flex-col gap-0.5 px-4 pb-2 pt-3', className)}
      {...props}
    />
  )
}

/**
 * Renders a real heading by default. Card titles ARE the section headings of
 * this app, and shipping them as `<div>` left every screen with an empty
 * heading outline — see docs/decisions.md §6.4. Pass `as` to fit the level
 * into the surrounding document structure; pass `as="div"` only where the
 * title genuinely is not a section heading.
 *
 * Set as an engraved placard legend, not as a display heading: on this panel
 * the label is small and cut, and the VALUE it labels is what carries scale.
 * That inversion is the direction, not an accident — see the surface brief.
 */
function CardTitle({
  className,
  as: Comp = 'h2',
  ...props
}: React.ComponentProps<'div'> & { as?: 'h1' | 'h2' | 'h3' | 'h4' | 'div' }) {
  return <Comp data-slot="card-title" className={cn('panel-legend', className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-description" className={cn('text-xs leading-snug text-muted-foreground', className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-4 pb-4', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex flex-wrap items-center gap-2 px-4 pb-4', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
