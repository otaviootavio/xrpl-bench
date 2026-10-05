import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AddressDisplay } from '@/components/wallet/AddressDisplay'
import { QrCode } from '@/components/wallet/QrCode'
import { QueryErrorState } from '@/components/wallet/QueryErrorState'
import { useAppStore, useActiveWallet } from '@/store/app-store'
import { useAccountState } from '@/hooks/useAccountState'

export function ReceiveTab() {
  const network = useAppStore((s) => s.network)
  const wallet = useActiveWallet()
  const accountState = useAccountState(network, wallet?.address ?? null)

  if (!wallet) return <p className="text-muted-foreground">No active wallet.</p>

  // `?? false` on its own makes a failed read indistinguishable from "no tag
  // required", so the warning below would simply vanish and the account would
  // look like one nobody needs to tag. The requirement is only reported as
  // absent when a read actually said so.
  const requiresTag = !accountState.isError && (accountState.data?.requireDestTag ?? false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receive</CardTitle>
        <CardDescription>Share your address to receive XRP or tokens.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <AddressDisplay address={wallet.address} />
        {accountState.isError && (
          <div className="w-full">
            <QueryErrorState
              title="Tag requirement unknown"
              description="This account's settings could not be read from the ledger, so the app cannot say whether senders must include a destination tag. The address itself is correct either way."
              onRetry={() => accountState.refetch()}
            />
          </div>
        )}
        {requiresTag && (
          <Alert variant="warning" className="w-full">
            <AlertTitle>Your account requires a destination tag</AlertTitle>
            <AlertDescription>Anyone sending to you from a shared address (like an exchange) must include one.</AlertDescription>
          </Alert>
        )}
        <QrCode address={wallet.address} />
        <p className="text-xs text-muted-foreground text-center">
          Incoming payments will appear automatically once validated — check the History tab, or keep this app open to get an
          in-app notification.
        </p>
      </CardContent>
    </Card>
  )
}
