import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FingerprintIcon } from 'lucide-react'
import { getLockoutState, hasPasskeyRegistered, unlockVault } from '@/lib/crypto/auth'
import { ChassisShell } from '@/components/ChassisShell'
import { tearDownAllLocalState } from '@/lib/teardown'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/store/app-store'
import { toast } from '@/lib/notify'
import { BUILD, shortSha, sourceUrl } from '@/lib/build-info'
import { ExternalLinkIcon } from 'lucide-react'

/** wallet-security.md US-1: locked by default, only an Unlock action is
 * shown — no balance/address/history until a successful unlock. */
export function Unlock() {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const queryClient = useQueryClient()
  const unlock = useAppStore((s) => s.unlock)
  const autoLockMinutes = useAppStore((s) => s.autoLockMinutes)

  // Async local-vault reads go through the same query layer as everything
  // else, rather than setState-inside-useEffect.
  const passkeyQuery = useQuery({ queryKey: ['passkeyRegistered'], queryFn: hasPasskeyRegistered })
  const lockoutQuery = useQuery({ queryKey: ['lockoutState'], queryFn: getLockoutState })
  const passkeyAvailable = passkeyQuery.data ?? false
  const hardLocked = lockoutQuery.data?.hardLocked ?? false

  // The backoff has to tick down on its own and re-enable the form. Deriving
  // it from a clock tick (rather than storing a countdown) means the message
  // can never get stuck: previously nothing re-checked it, so a 1-second
  // backoff disabled the UI until the user reloaded the page.
  // An ABSOLUTE expiry from the vault, so nothing impure is called during
  // render. `hardLocked` is permanent until a reset; this backoff is not.
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

  async function handleUnlock(method: 'passkey' | 'pin') {
    setBusy(true)
    try {
      const key = await unlockVault(method, method === 'pin' ? pin : undefined, autoLockMinutes)
      unlock(key)
    } catch (err: any) {
      toast.error(err?.message ?? 'Unlock failed.')
      await refreshLockout()
    } finally {
      setBusy(false)
    }
  }

  /** wallet-security.md: after the hard-lock threshold the only way forward is
   * a fresh import. That instruction was previously unactionable — wipeVault
   * lived only in Settings, which sits behind this very lock screen. */
  async function handleReset() {
    await tearDownAllLocalState(queryClient)
    window.location.reload()
  }

  return (
    <ChassisShell maxWidthClassName="max-w-md">
      <div className="flex min-h-full flex-col justify-center gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle as="h1">Unlock wallet</CardTitle>
            <CardDescription>Your wallet is locked.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {hardLocked && (
              <p className="text-sm text-text-destructive">
                Too many failed attempts. Reset this device and re-import your wallet with your seed to continue.
              </p>
            )}
            {!hardLocked && backedOff && (
              <p className="text-sm text-text-destructive">Too many failed attempts. Try again in {Math.ceil(remainingMs / 1000)}s.</p>
            )}

            {!hardLocked && (
              <>
                {passkeyAvailable && (
                  <Button onClick={() => handleUnlock('passkey')} disabled={busy || backedOff}>
                    <FingerprintIcon /> Unlock with passkey
                  </Button>
                )}
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
                  <Button variant="outline" onClick={() => handleUnlock('pin')} disabled={busy || backedOff}>
                    Unlock with PIN
                  </Button>
                </div>
              </>
            )}

            <Button variant={hardLocked ? 'destructive' : 'ghost'} size="sm" onClick={() => setConfirmReset(true)}>
              Reset this device and re-import
            </Button>
          </CardContent>
        </Card>

        {/* app-versioning-and-updates.md US-1: "the same values are reachable
            without unlocking the wallet, so a user can identify a build
            before entering a PIN." Deliberately just a stamp, not a Settings
            card — the wallet is still locked and nothing else on this screen
            should compete with the PIN field for attention. */}
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
                This erases every wallet stored on this device, including their encrypted seeds. Anything you have not backed up
                elsewhere will be permanently lost — this cannot be undone. You will need your seed to import your wallet again.
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
    </ChassisShell>
  )
}
