import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/lib/notify'
import { RESET_INCOMPLETE_MESSAGE, tearDownAllLocalState } from '@/lib/teardown'
import { useAppStore } from '@/store/app-store'

/**
 * "Remove all wallets from this device": the plate and its confirm dialog, shared by
 * app-level Settings and by first-run Onboarding when an App PIN or a failure count
 * outlived the last Wallet (AD-46). The one reset is `tearDownAllLocalState`; nothing
 * is cleared here field by field. Reads no wallet and no ledger.
 */
export function RemoveAllPlate({ children }: { /** A line above the key, for a screen that needs to say why it is here. */ children?: ReactNode }) {
  const closeAllLocks = useAppStore((s) => s.closeAllLocks)
  const queryClient = useQueryClient()
  const [confirmResetAll, setConfirmResetAll] = useState(false)

  async function handleFullReset() {
    // `tearDownAllLocalState` owns the whole clear set (AD-16), including the
    // persisted app store — wallets, Address Book, auto-lock and declined
    // updates — so no field is cleared here.
    try {
      await tearDownAllLocalState(queryClient)
    } catch {
      // Do not reload as though the device were clean when it is not.
      toast.error(RESET_INCOMPLETE_MESSAGE)
      return
    } finally {
      closeAllLocks()
    }
    window.location.reload()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>This device</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {children}
          <Button variant="danger" className="h-auto min-h-9 w-fit max-w-full whitespace-normal py-2 text-left pointer-coarse:min-h-11" onClick={() => setConfirmResetAll(true)}>
            Remove all wallets from this device
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmResetAll} onOpenChange={setConfirmResetAll}>
        <DialogContent dismissOnOutsidePress>
          <DialogHeader>
            <DialogTitle>Remove all wallets from this device?</DialogTitle>
            <DialogDescription>
              This erases every wallet stored here, including their encrypted seeds, along with the address book and settings,
              and clears all cached balance and history data. Any wallet you have not backed up elsewhere will be permanently
              lost — this cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmResetAll(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleFullReset}>
              Erase everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
