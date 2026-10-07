import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface QueryErrorStateProps {
  /** The lit legend. A few words naming what could not be read. */
  title: string
  /** Plain words: what the app tried to read, and what it therefore does not know. */
  description: string
  /**
   * Attempt the read again — normally the query's own `refetch`. Return the
   * promise and the control reports while it is in flight.
   */
  onRetry: () => void | Promise<unknown>
}

/**
 * A ledger read that failed, reported where the missing data would have been.
 *
 * AD-8 splits the error surfaces by cause: a failed **read** of data that has a
 * place on screen renders inline; only something the user *did* goes to the
 * Annunciator. Reads here refetch every 15 seconds, so routing them to a band
 * that never auto-dismisses would flood it.
 *
 * Two rules this exists to keep:
 *
 * - A failure and an empty result are different facts. "Nothing there" is a
 *   claim about the ledger, and the app may only make it when a read actually
 *   succeeded and came back empty. Every screen that can render an empty state
 *   must render this instead when the read failed.
 * - Nothing here expires. `role="alert"` comes from `Alert`, so the failure is
 *   announced, and it stays on screen until the read succeeds — no timer takes
 *   it away mid-sentence.
 *
 * The retry is a real `Button`, never `disabled`, so it is reachable and
 * activatable by keyboard alone. The underlying `error` is deliberately not
 * rendered: a transport message is no more meant for a person than a raw `tec`
 * code is.
 *
 * "Retrying…" tracks THIS control's own attempt rather than the query's
 * `isFetching`. These reads poll on a 15-second interval that keeps firing
 * while a query is in error, so a label wired to `isFetching` would rewrite
 * itself — and the accessible name of a control the user may have focused —
 * every fifteen seconds with nobody having done anything.
 */
export function QueryErrorState({ title, description, onRetry }: QueryErrorStateProps) {
  const [retrying, setRetrying] = useState(false)

  async function handleRetry() {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>{description}</span>
        <Button size="sm" variant="outline" onClick={() => void handleRetry()} aria-busy={retrying}>
          {retrying ? 'Retrying…' : 'Try again'}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
