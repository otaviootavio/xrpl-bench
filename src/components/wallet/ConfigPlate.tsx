import { useId, type ReactNode } from 'react'

/**
 * One concern of the Configure screen (`config-section`): a `card-plate` with a
 * placard title that is the plate's h2. One concern per plate; the screen owns
 * the order. `focusId` makes the plate itself a focus target (not a tab stop) for a dialog
 * whose opener unmounted.
 */
export function ConfigPlate({ title, children, focusId }: { title: string; children: ReactNode; focusId?: string }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} data-slot="config-plate" data-configure-plate={focusId} tabIndex={focusId ? -1 : undefined} className="panel-plate flex min-w-0 max-w-full flex-col gap-3 rounded-md px-4 pb-4 pt-3 [overflow-wrap:anywhere] [&_button]:h-auto [&_button]:max-w-full [&_button]:whitespace-normal">
      <h2 id={headingId} className="panel-legend">
        {title}
      </h2>
      {children}
    </section>
  )
}
