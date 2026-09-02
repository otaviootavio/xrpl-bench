import type { ReactNode } from 'react'
import { Annunciator } from '@/components/Annunciator'
import { cn } from '@/lib/utils'

/**
 * The fixed-height chassis shell, shared by every top-level screen —
 * `Main`, `Unlock`, and `Onboarding` alike (docs/decisions.md §9.1, N1).
 *
 * Header pinned (if any), content scrolling in its own region, annunciator
 * pinned at the base. This replaces each screen's own `min-h-dvh` document
 * flow: the annunciator is reserved space that is present at all times, so
 * its arrival never reflows anything above it and never covers a control —
 * the whole point of this epic (US-1).
 *
 * One implementation, not three: building this per-screen is exactly the
 * two-conventions-for-one-concept drift this project's rules exist to catch,
 * and `Unlock`/`Onboarding` raise 8 of the app's 27 notices between them —
 * they need the same guarantees `Main` needs, not a smaller stand-in.
 */
export function ChassisShell({
  header,
  children,
  maxWidthClassName = 'max-w-5xl',
}: {
  header?: ReactNode
  children: ReactNode
  maxWidthClassName?: string
}) {
  return (
    <div className={cn('mx-auto flex h-dvh w-full flex-col md:border-x md:border-border', maxWidthClassName)}>
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <Annunciator />
    </div>
  )
}
