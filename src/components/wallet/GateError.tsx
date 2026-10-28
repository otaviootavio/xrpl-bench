import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** The one surface for an unreadable wallet list or unreadable saved state (AD-37).
 * Names no cause: the underlying error text is never rendered. */
export function GateError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-full flex-col justify-center gap-6 p-6">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle as="h1">Wallets unavailable</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p role="alert" className="text-sm text-text-destructive">
            The wallets on this device could not be read. Nothing was changed.
          </p>
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
