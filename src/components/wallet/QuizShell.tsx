import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { ScreenFooter } from './TaskScreen'

export type QuizStep = {
  id: string
  title: string
  /** Next is `aria-disabled` and does nothing while true. */
  blocked?: boolean
  /** The id of the visible text that says why Next is blocked: Next points at it. */
  blockedReasonId?: string
  /** A second forward action, shown between Back and the primary one. */
  secondary?: ReactNode
  /** Replaces Next (and the final action) on this step. */
  primary?: ReactNode
}

/**
 * One step at a time. Controlled: the caller owns the index and every answer,
 * so nothing typed or chosen can be lost by leaving a step. The shell holds no
 * state and nothing animates.
 */
export function QuizShell({
  steps,
  index,
  onIndex,
  busy,
  actionHost,
  finalAction,
  children,
}: {
  steps: QuizStep[]
  index: number
  onIndex: (next: number) => void
  busy: boolean
  actionHost?: HTMLElement | null
  finalAction: ReactNode
  children: ReactNode
}) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previous = useRef(index)
  useEffect(() => {
    // Focus follows a step change only: never the first mount.
    if (previous.current !== index) headingRef.current?.focus()
    previous.current = index
  }, [index])

  const step = steps[index]
  const first = index === 0
  const last = index === steps.length - 1

  const actions = (
    <>
      <Button type="button" variant="outline" aria-disabled={first || undefined} disabled={busy} onClick={() => !first && onIndex(index - 1)}>
        Back
      </Button>
      {step?.secondary}
      {step?.primary ? (
        step.primary
      ) : last ? (
        finalAction
      ) : (
        <Button type="button" aria-disabled={step?.blocked || undefined} aria-describedby={step?.blocked ? step.blockedReasonId : undefined} disabled={busy} onClick={() => !step?.blocked && onIndex(index + 1)}>
          Next
        </Button>
      )}
    </>
  )

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-5">
      <div className="grid gap-1">
        <p className="text-xs text-muted-foreground">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="panel-legend">
          {step?.title}
        </h2>
      </div>
      {children}
      {actionHost ? createPortal(<ScreenFooter>{actions}</ScreenFooter>, actionHost) : <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>}
    </section>
  )
}
