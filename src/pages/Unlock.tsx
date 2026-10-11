import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLinkIcon, FingerprintIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getLockoutState } from '@/lib/crypto/auth'
import { getLockInfo, openLock as openWithCheck, type OpenMethod } from '@/lib/crypto/lock'
import { describeCheckFailure, type WalletMeta } from '@/lib/crypto/keystore'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { RESET_INCOMPLETE_MESSAGE, tearDownAllLocalState } from '@/lib/teardown'
import { useAppStore } from '@/store/app-store'
import { toast } from '@/lib/notify'
import { BUILD, shortSha, sourceUrl } from '@/lib/build-info'

/**
 * The locked-Wallet view (CAP-4, AD-26): the active Wallet's NAME and its own
 * unlock prompt — no address, balance, history, network or Node. The app has no
 * app-wide gate; this stands in for the Wallet's panels until ITS lock is open,
 * and `Main` mounts no ledger hook while it is showing.
 *
 * The form is the old Unlock screen's: a PIN field, a passkey button, the
 * lockout countdown and the explicit full reset. What differs is that it opens
 * one lock — the Wallet's — and shows only what that lock accepts. A lock with
 * no Open Check (Testnet and Devnet only) opens at once with no prompt.
 */
export function Unlock({ wallet }: { wallet: WalletMeta }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const queryClient = useQueryClient()
  const openLock = useAppStore((s) => s.openLock)
  const lockId = wallet.lockId

  // Async local-vault reads go through the same query layer as everything
  // else, rather than setState-inside-useEffect.
  const infoQuery = useQuery({ queryKey: queryKeys.lockInfo(lockId), queryFn: () => getLockInfo(lockId) })
  const lockoutQuery = useQuery({ queryKey: queryKeys.lockoutState(), queryFn: getLockoutState })
  const info = infoQuery.data
  const passkeyAvailable = info?.passkey ?? false
  const pinAvailable = info?.pin ?? false
  const hardLocked = lockoutQuery.data?.hardLocked ?? false
  // A hard lock disables PIN derivation, never a passkey (AD-25).
  const pinBlocked = hardLocked

  // The backoff has to tick down on its own and re-enable the form. Deriving
  // it from a clock tick (rather than storing a countdown) means the message
  // can never get stuck. An ABSOLUTE expiry from the vault, so nothing impure
  // is called during render. `hardLocked` is permanent until a reset; this
  // backoff is not.
  const lockedUntil = lockoutQuery.data?.lockedUntil ?? 0
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (lockedUntil <= now) return
    const timer = setTimeout(() => setNow(Date.now()), 500)
    return () => clearTimeout(timer)
  }, [lockedUntil, now])

  const remainingMs = Math.max(0, lockedUntil - now)
  const backedOff = remainingMs > 0

  async function refreshLockout() {
    await lockoutQuery.refetch()
    setNow(Date.now())
  }

  async function handleOpen(method: OpenMethod) {
    setBusy(true)
    try {
      const result = await openWithCheck(lockId, method, { pin: method === 'pin' ? pin : undefined })
      if (result.status === 'ok') {
        setPin('')
        openLock(lockId, result.value.key, result.value.autoLockMinutes)
        return
      }
      toast.error(
        result.status === 'cancelled'
          ? 'Cancelled. The wallet stays locked.'
          : result.status === 'unsupported'
            ? 'This device or browser cannot open the wallet that way.'
            : describeCheckFailure(result).replace(' Nothing was signed.', ''),
      )
      await refreshLockout()
    } catch (err: any) {
      toast.error(err?.message ?? 'Unlock failed.')
      await refreshLockout()
    } finally {
      setBusy(false)
    }
  }

  // No Open Check: open with no prompt, once per mount.
  const autoOpened = useRef(false)
  useEffect(() => {
    if (info?.openCheck !== 'none' || autoOpened.current) return
    autoOpened.current = true
    openWithCheck(lockId, 'none').then(
      (result) => {
        if (result.status === 'ok') openLock(lockId, result.value.key, result.value.autoLockMinutes)
        else setOpenError('This wallet could not be opened.')
      },
      () => setOpenError('This wallet could not be opened.'),
    )
  }, [info?.openCheck, lockId, openLock, attempt])

  /** Retry after a failed auto-open or a failed read of the lock. */
  function retry() {
    setOpenError(null)
    autoOpened.current = false
    setAttempt((n) => n + 1)
    void infoQuery.refetch()
  }

  /** The explicit full reset: the only way a Seed is ever removed because of a
   * hard lock, and never automatic. `tearDownAllLocalState` owns the whole clear
   * set (AD-16) — the vault AND the persisted app store — so nothing is cleared
   * field by field here. */
  async function handleReset() {
    try {
      await tearDownAllLocalState(queryClient)
    } catch {
      // Do not reload as though the device were clean when it is not.
      toast.error(RESET_INCOMPLETE_MESSAGE)
      return
    }
    window.location.reload()
  }

  return (
    <div className="flex min-h-full flex-col justify-center gap-6 p-6">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle as="h1">{wallet.label}</CardTitle>
          <CardDescription>This wallet is locked.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {pinAvailable && hardLocked && (
            <p className="text-sm text-text-destructive">
              Too many failed PIN attempts: PIN entry is turned off on this device.{' '}
              {passkeyAvailable
                ? 'Your passkey still opens this wallet. Nothing has been erased.'
                : 'Nothing has been erased, but this wallet cannot be opened with a PIN now. You can erase this device below and import your wallet again with your seed.'}
            </p>
          )}
          {pinAvailable && !hardLocked && backedOff && (
            <p className="text-sm text-text-destructive">Too many failed attempts. Try again in {Math.ceil(remainingMs / 1000)}s.</p>
          )}

          {/* A failed read is never shown as an empty form: say so and offer a retry. */}
          {!info && infoQuery.isError && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-text-destructive">This wallet&apos;s lock could not be read. Nothing was changed.</p>
              <Button variant="outline" onClick={retry}>
                Retry
              </Button>
            </div>
          )}
          {!info && !infoQuery.isError && <p className="text-sm text-muted-foreground">Checking this wallet&apos;s lock…</p>}
          {openError && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-text-destructive">{openError}</p>
              <Button variant="outline" onClick={retry}>
                Retry
              </Button>
            </div>
          )}

          {info && info.openCheck !== 'none' && (
            <>
              {passkeyAvailable && (
                <Button onClick={() => handleOpen('passkey')} disabled={busy}>
                  <FingerprintIcon /> Unlock with passkey
                </Button>
              )}
              {pinAvailable && !pinBlocked && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="unlock-pin">PIN</Label>
                  <Input
                    id="unlock-pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    disabled={busy || backedOff}
                  />
                  <Button variant="outline" onClick={() => handleOpen('pin')} disabled={busy || backedOff}>
                    Unlock with PIN
                  </Button>
                </div>
              )}
            </>
          )}

          <Button variant={pinAvailable && pinBlocked && !passkeyAvailable ? 'destructive' : 'ghost'} size="sm" onClick={() => setConfirmReset(true)}>
            Reset this device and re-import
          </Button>
        </CardContent>
      </Card>

      {/* app-versioning-and-updates.md US-1: "the same values are reachable
          without unlocking the wallet, so a user can identify a build before
          entering a PIN." The app opens without a gate now, but Settings sits
          behind the Wallet's lock, so the stamp stays here. */}
      <p className="text-center text-xs text-muted-foreground">
        v{BUILD.version} ·{' '}
        <a href={sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:underline">
          {shortSha}
          <ExternalLinkIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
        </a>
      </p>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset this device?</DialogTitle>
            <DialogDescription>
              This erases every wallet stored on this device, including their encrypted seeds, along with the address book
              and settings. Anything you have not backed up elsewhere will be permanently lost — this cannot be undone. You
              will need your seed to import your wallet again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReset}>
              Erase and reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
