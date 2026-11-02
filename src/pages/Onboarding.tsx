import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateWalletFlow } from '@/components/wallet/CreateWalletFlow'
import { useSeedImport } from '@/components/wallet/useSeedImport'
import { ChassisShell } from '@/components/ChassisShell'
import { hasPasskeyRegistered } from '@/lib/crypto/auth'
import { RemoveAllPlate } from '@/components/wallet/RemoveAllPlate'
import { appPinResidue, type WalletMeta } from '@/lib/crypto/keystore'
import { toast } from '@/lib/notify'
import { useAppStore } from '@/store/app-store'
import { BUILD, shortSha, sourceUrl } from '@/lib/build-info'
import { ExternalLinkIcon } from 'lucide-react'

type Step = 'choice' | 'create' | 'import'

/**
 * `CreateWalletFlow` (Create and Import alike) opens the Wallet's own lock, then
 * sets the wallet list, which is when the Gate flips to Main, then calls `onDone`,
 * which selects the Wallet. Guardrail #3: no Seed is ever in React state; the
 * generated one lives in the flow and the typed one in `useSeedImport`, in refs only.
 */
export function Onboarding() {
  const [step, setStep] = useState<Step>('choice')
  const [creating, setCreating] = useState(false)

  // An App PIN or a failure count that outlived the last Wallet (a removal whose
  // discard failed, AD-46). Read through the keystore each time this step shows.
  const [pinResidue, setPinResidue] = useState(false)
  useEffect(() => {
    if (step !== 'choice') return undefined
    let cancelled = false
    appPinResidue().then(
      (found) => !cancelled && setPinResidue(found),
      // An unreadable vault is not proof of a clean one: keep the way out on offer.
      () => !cancelled && setPinResidue(true),
    )
    return () => {
      cancelled = true
    }
  }, [step])

  const setActiveWalletId = useAppStore((s) => s.setActiveWalletId)

  if (step === 'choice') {
    return (
      <ChassisShell maxWidthClassName="max-w-md">
        <div className="flex min-h-full flex-col justify-center gap-6 p-6">
          {/* The power-on nameplate. Engraved, not a display heading: the
              panel's maker's mark is the smallest thing on it, and the
              instrument itself is what the user came to read. */}
          <div className="border-b border-border pb-4">
            <h1 className="panel-legend text-[0.75rem] tracking-[0.22em] text-foreground">XRPL Bench</h1>
            <p className="mt-1.5 text-sm leading-snug text-muted-foreground">
              A self-custody wallet for the XRP Ledger. Keys are generated and stored on this device only.
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Get started</CardTitle>
              <CardDescription>Generate a brand-new wallet, or import one you already have.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button
                onClick={() => setStep('create')}
              >
                Create a new wallet
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep('import')}
              >
                Import an existing wallet
              </Button>
            </CardContent>
          </Card>

          {pinResidue && (
            <RemoveAllPlate>
              <p className="text-sm leading-snug text-muted-foreground">
                An App PIN or its failed-attempt count is still stored on this device, left over from a wallet that was removed.
                Removing everything clears it, so setup asks for a new PIN.
              </p>
            </RemoveAllPlate>
          )}

          {/* app-versioning-and-updates.md US-1: reachable before there is
              even a vault to unlock, not only after one exists. */}
          <p className="text-center text-xs text-muted-foreground">
            v{BUILD.version} ·{' '}
            <a href={sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:underline">
              {shortSha}
              <ExternalLinkIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
            </a>
          </p>
        </div>
      </ChassisShell>
    )
  }

  if (step === 'import') {
    return (
      <ImportStep
        creating={creating}
        onInProgressChange={setCreating}
        onDone={(meta) => {
          setActiveWalletId(meta.id)
          toast.success('Wallet imported.')
        }}
        onBack={() => setStep('choice')}
      />
    )
  }

  if (step === 'create') {
    return (
      <ChassisShell maxWidthClassName="max-w-md">
        <div className="flex min-h-full flex-col justify-center gap-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle as="h1">Create a new wallet</CardTitle>
              <CardDescription>Answer each question, or keep the answer already chosen. Keys are generated and stored on this device only.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/* Commits to the store itself, after the seed backup. */}
              <CreateWalletFlow onInProgressChange={setCreating} onDone={(meta) => setActiveWalletId(meta.id)} />
              <Button variant="outline" onClick={() => setStep('choice')} disabled={creating}>
                Back to start
              </Button>
            </CardContent>
          </Card>
        </div>
      </ChassisShell>
    )
  }

  return null
}

/**
 * First-run Import: the creation flow with the Seed source Add wallet uses, so the
 * first Wallet is made like any Wallet (its own lock, the App PIN on demand). A
 * component of its own so the typed Seed is dropped when the step is left.
 */
function ImportStep({
  creating,
  onInProgressChange,
  onDone,
  onBack,
}: {
  creating: boolean
  onInProgressChange: (inProgress: boolean) => void
  onDone: (meta: WalletMeta) => void
  onBack: () => void
}) {
  const { importSource, warningDialog } = useSeedImport()
  // The flow's primary action renders in a sticky footer here, so it stays reachable at 320px and 200% text.
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null)
  return (
    <ChassisShell maxWidthClassName="max-w-md">
      <div className="flex min-h-full flex-col justify-center gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle as="h1">Import wallet</CardTitle>
            <CardDescription>Answer each question, or keep the answer already chosen. Your seed never leaves this device.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button variant="outline" size="sm" className="h-auto min-h-8 w-fit max-w-full whitespace-normal py-1" onClick={onBack} disabled={creating}>
              Back to start
            </Button>
            {/* Commits to the store itself, after the Wallet is written. */}
            <CreateWalletFlow importSource={importSource} actionHost={footerHost} onInProgressChange={onInProgressChange} onDone={onDone} />
            <div ref={setFooterHost} className="contents" />
          </CardContent>
        </Card>
      </div>
      {warningDialog}
    </ChassisShell>
  )
}

// A thin re-export of hasPasskeyRegistered() consumed by Unlock; kept here so
// the onboarding flow that registers the passkey and the check for it stay in
// one place.
// oxlint-disable-next-line react/only-export-components
export async function passkeyAvailableForReturningUser() {
  return hasPasskeyRegistered()
}
