import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { REMOVE_TITLE, removeSentences, type RemoveBody } from '@/components/wallet/remove-copy'

export interface RemoveTarget {
  walletId: string
  name: string
  body: RemoveBody
}

/**
 * The Remove confirm (AD-46): the shipped dialog, with one of three consequence
 * bodies. Escape, an overlay press and Back close it. It only asks; the chooser's
 * handler re-checks the lock and does the removal, so a closed lock is refused
 * whatever this dialog shows. The confirm key is the saturated `destructive` fill
 * and nothing else here is.
 */
export function RemoveDialog({
  target,
  onConfirm,
  onClose,
  returnFocusTo,
}: {
  target: RemoveTarget | null
  onConfirm: (walletId: string, shownBody: RemoveBody) => Promise<void>
  onClose: () => void
  returnFocusTo: () => HTMLElement | null
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      {target && (
        <DialogContent dismissOnOutsidePress returnFocusTo={returnFocusTo}>
          <DialogHeader>
            <DialogTitle>{REMOVE_TITLE}</DialogTitle>
            <DialogDescription>{removeSentences(target.body).join(' ')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await onConfirm(target.walletId, target.body)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Removing…' : 'Remove wallet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
