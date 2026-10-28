import { useId, type ReactNode } from 'react'

/**
 * One concern of the Configure screen (`config-section`): a `card-plate` with a
 * placard title that is the plate's h2. One concern per plate; the screen owns
 * the order.
 */
export function ConfigPlate({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} data-slot="config-plate" className="panel-plate flex min-w-0 flex-col gap-3 rounded-md px-4 pb-4 pt-3">
      <h2 id={headingId} className="panel-legend">
        {title}
      </h2>
      {children}
    </section>
  )
}
