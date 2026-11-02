import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RemoveAllPlate } from '@/components/wallet/RemoveAllPlate'
import { ExternalLinkIcon } from 'lucide-react'
import { BUILD, shortSha, sourceUrl, formatBuiltAt } from '@/lib/build-info'
import { useAppUpdate } from '@/hooks/useAppUpdate'

/**
 * The app-level Settings plates: Version and updates, and Remove
 * all wallets from this device. Served by `/settings` only (CAP-1, AD-51); the
 * in-wallet Wallet tab holds this wallet's own settings and none of these. It reads no wallet and no
 * ledger: no `useActive*`, no account-scoped query, no lock read (AD-36). Do not
 * add one; a per-wallet control (the Address Book included) belongs in the Wallet tab, and a per-app one here.
 */
export function AppSettings() {
  const { updateReady, applying, applyUpdate, checking, checkError, checkForUpdate, pendingRelease, blockedReason, declined, declineCurrent } =
    useAppUpdate()

  return (
    <div className="flex flex-col gap-4">
      <RemoveAllPlate />

      {/* Which build is running, and the only control that changes it.
          app-versioning-and-updates.md US-1 / US-2 / US-3 / US-4 / US-5 / US-6 / US-8. */}
      <Card>
        <CardHeader>
          <CardTitle>Version</CardTitle>
          <CardDescription>
            This wallet never updates itself. A new version waits until you install it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <dt className="panel-legend">Version</dt>
              <dd className="font-data text-sm tracking-tight">{BUILD.version}</dd>
            </div>
            <div className="min-w-0">
              <dt className="panel-legend">Commit</dt>
              <dd className="mt-0.5">
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-data text-sm tracking-tight hover:underline"
                >
                  {shortSha}
                  <ExternalLinkIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
                </a>
              </dd>
            </div>
            <div>
              <dt className="panel-legend">Built</dt>
              <dd className="font-data text-sm tracking-tight">{formatBuiltAt()}</dd>
            </div>
          </dl>

          {/* US-2: an explicit on-demand check, distinct from the automatic
              one the service worker already runs on registration. */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void checkForUpdate()} disabled={checking}>
              {checking ? 'Checking…' : 'Check for updates'}
            </Button>
            {checkError && (
              <span className="text-xs text-text-warning">Could not check — you may be offline.</span>
            )}
          </div>

          {updateReady && !declined ? (
            /* V4: a major or security-marked release warns harder; minor/patch
               stay quiet. Unknown (manifest unreachable) falls back to the
               louder treatment, since understating a security fix is worse
               than overstating an ordinary one. */
            <Alert variant={pendingRelease && !pendingRelease.security && pendingRelease.bump !== 'major' ? 'default' : 'warning'}>
              <AlertTitle>{pendingRelease?.security ? 'Security update available' : 'Update available'}</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2">
                <span>
                  A new version has downloaded and is waiting
                  {pendingRelease ? ` (v${pendingRelease.version}, released ${new Date(pendingRelease.releasedAt).toLocaleDateString()})` : ''}.
                  Installing it reloads the app onto the new version; anything you have typed and not
                  submitted is lost. Your wallets and keys are untouched.
                </span>
                {pendingRelease && (
                  <div className="flex flex-wrap gap-3">
                    <a href={pendingRelease.notes} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm hover:underline">
                      What changed <ExternalLinkIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
                    </a>
                    {/* US-7: the wallet never claims to verify itself — this
                        only links to instructions a third party can follow. */}
                    <a href={pendingRelease.verify} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm hover:underline">
                      How to verify this build <ExternalLinkIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
                    </a>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void applyUpdate()}
                    disabled={applying || !!blockedReason}
                    aria-disabled={!!blockedReason}
                  >
                    {applying ? 'Installing…' : 'Install update'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={declineCurrent} disabled={applying}>
                    Not now
                  </Button>
                </div>
                {/* Never hidden — a disabled control states its reason in
                    visible text (docs/decisions.md §6.4). */}
                {blockedReason && <span className="text-xs text-text-warning">{blockedReason}</span>}
              </AlertDescription>
            </Alert>
          ) : updateReady && declined ? (
            // US-4: declined, so it stops nagging with a full alert — but
            // stays reachable, not hidden.
            <p className="text-xs leading-snug text-muted-foreground">
              An update is available but was dismissed.{' '}
              <button type="button" onClick={() => void applyUpdate()} disabled={applying || !!blockedReason} className="underline hover:no-underline">
                Install it
              </button>
              {blockedReason ? ` (${blockedReason})` : ''}
            </p>
          ) : (
            <p className="text-xs leading-snug text-muted-foreground">
              You are on the newest version this device has downloaded.
            </p>
          )}

          {/* US-8: recovery never mentions clearing site data — that destroys
              the encrypted vault. */}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-legend uppercase tracking-[0.08em]">
              Trouble after an update?
            </summary>
            <p className="mt-1.5 leading-snug">
              Reload the page first. If the app still won't start, reinstall it from your home screen or
              browser. As a last resort, you can re-import this wallet from your seed on a clean install —
              your wallets and keys are never affected by an update. Never clear this site's storage or
              browsing data to fix an update problem: that erases the encrypted seed stored on this device
              and cannot be undone without your own backup.
            </p>
          </details>
        </CardContent>
      </Card>
    </div>
  )
}
