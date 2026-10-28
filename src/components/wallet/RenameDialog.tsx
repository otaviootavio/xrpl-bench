import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RENAME_ERRORS, RENAME_HELP, RENAME_WRITE_FAILED } from '@/components/wallet/rename-copy'
import { normalizeWalletName, validateWalletName, type WalletNameReason } from '@/lib/wallet-name'

export interface RenameTarget {
  seedId: string
  name: string
}

/**
 * A single-field dialog (AD-41, AD-42). The rule is `validateWalletName`, the
 * same function `keystore.renameWallet` re-runs. The field holds a name, never a
 * secret. `onSave` resolves `true` when the write went through, `false` when it
 * failed (the dialog then stays open with the typed name), or a reason when the
 * keystore refused the name.
 */
export function RenameDialog({
  target,
  others,
  onSave,
  onClose,
  returnFocusTo,
}: {
  target: RenameTarget | null
  /** The names of every OTHER Seed. */
  others: readonly string[]
  onSave: (seedId: string, name: string) => Promise<true | WalletNameReason | 'write-failed'>
  onClose: () => void
  returnFocusTo: (seedId: string) => HTMLElement | null
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target && <RenameForm key={target.seedId} target={target} others={others} onSave={onSave} onClose={onClose} returnFocusTo={returnFocusTo} />}
    </Dialog>
  )
}

function RenameForm({
  target,
  others,
  onSave,
  onClose,
  returnFocusTo,
}: {
  target: RenameTarget
  others: readonly string[]
  onSave: (seedId: string, name: string) => Promise<true | WalletNameReason | 'write-failed'>
  onClose: () => void
  returnFocusTo: (seedId: string) => HTMLElement | null
}) {
  const [value, setValue] = useState(target.name)
  const [shown, setShown] = useState(false) // errors appear on submit and on blur
  const [refused, setRefused] = useState<WalletNameReason | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`

  const verdict = validateWalletName(value, others)
  const changed = normalizeWalletName(value) !== normalizeWalletName(target.name)
  // An unchanged name is never an error: a grandfathered duplicate may stay as it is.
  const reason = !changed ? null : !verdict.ok ? verdict.reason : refused
  const error = shown && reason ? RENAME_ERRORS[reason] : null
  const canSave = verdict.ok && changed && !busy

  async function submit() {
    setShown(true)
    if (busy) return
    if (!changed) {
      onClose()
      return
    }
    if (!verdict.ok) return
    setBusy(true)
    setFailed(false)
    setRefused(null)
    const result = await onSave(target.seedId, verdict.name)
    setBusy(false)
    if (result === true) return // the caller closes the dialog
    if (result === 'write-failed') setFailed(true)
    else setRefused(result)
  }

  return (
    <DialogContent dismissOnOutsidePress={false} returnFocusTo={() => returnFocusTo(target.seedId)}>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <DialogHeader>
          <DialogTitle>Rename wallet</DialogTitle>
          <DialogDescription className="sr-only">Change the name this device shows for this wallet.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            id={`${id}-name`}
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${helpId} ${errorId}` : helpId}
            onChange={(event) => {
              setValue(event.target.value)
              setRefused(null)
              setFailed(false)
            }}
            onBlur={() => setShown(true)}
            onKeyDown={(event) => {
              // A disabled Save blocks implicit submission; Enter still has to answer.
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <p id={helpId} className="text-xs text-muted-foreground">
            {RENAME_HELP}
          </p>
          {error && (
            <p id={errorId} className="text-sm font-medium text-text-destructive">
              {error}
            </p>
          )}
        </div>
        {failed && (
          <p role="alert" className="text-sm font-medium text-text-destructive">
            {RENAME_WRITE_FAILED}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSave}>
            Save name
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
