import { useId, type ComponentProps, type ReactNode } from 'react'
import { ArrowLeftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A routed task screen (mobile dialogs S2). The four multi-field tasks (Add
 * wallet, Edit checks, Sign with two devices, Let another wallet sign) are pages,
 * not dialogs: they own the whole content area, Back returns to Settings, and
 * the commit action lives in a `ScreenFooter` stuck to the bottom of the
 * scrolling area so it is reachable at 200% text zoom.
 *
 * `locked` is true while a write or a Seed backup is running: Back is disabled
 * then, for the same reason a dialog refused to close.
 */
export function TaskScreen({
  title,
  description,
  backLabel = 'Settings',
  onBack,
  locked = false,
  children,
}: {
  title: string
  description?: ReactNode
  backLabel?: string
  onBack: () => void
  locked?: boolean
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} data-slot="task-screen" className="panel-plate mx-auto flex w-full max-w-lg flex-col gap-4 rounded-md p-4">
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onBack} disabled={locked}>
          <ArrowLeftIcon aria-hidden="true" />
          {backLabel}
        </Button>
        <h1 id={headingId} className="font-legend text-base font-semibold uppercase leading-tight tracking-[0.08em]">
          {title}
        </h1>
        {description && <div className="text-sm leading-snug text-muted-foreground">{description}</div>}
      </div>
      {children}
    </section>
  )
}

/** The screen's action row, stuck to the bottom of the scrolling area with a rule
 * and a shadow above it (the cue that content runs on beneath). Its bottom
 * padding clears the home indicator. */
export function ScreenFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="screen-footer"
      className={cn(
        'sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-md border-t border-border bg-card px-4 pt-3',
        '[&>button]:h-auto [&>button]:min-h-9 [&>button]:whitespace-normal [&>button]:py-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_10px_-10px_rgb(0_0_0/0.4)] sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}
