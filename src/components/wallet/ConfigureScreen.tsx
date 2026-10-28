import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfigPlate } from '@/components/wallet/ConfigPlate'
import { ControlledNote } from '@/components/wallet/ControlledNote'
import { MasterKeyControl } from '@/components/wallet/MasterKeyControl'
import { OtherNetworksPlate } from '@/components/wallet/OtherNetworksPlate'
import { TwoDeviceSign } from '@/components/wallet/TwoDeviceSign'
import { WalletNodeSection } from '@/components/wallet/WalletNodeSection'
import { RevealSeedControl } from '@/components/wallet/RevealSeedControl'
import { NO_OPEN_CHECK_DETAIL, STANDARD_SIGNING_DETAIL, openCheckWords, signingWords } from '@/components/wallet/check-words'
import { launchFromConfigure, peekConfigureFocusReturn } from '@/lib/configure-launch'
import { useLockMinutesChanged } from '@/hooks/useLockMinutesChanged'
import { usePrompts } from '@/hooks/usePrompts'
import { setLockAutoLock, type WalletMeta } from '@/lib/crypto/keystore'
import { AUTO_LOCK_CHOICES } from '@/lib/crypto/policy'
import { minutesLabel } from '@/lib/minutes-label'
import { useAppStore } from '@/store/app-store'
import { holdsMasterKey } from '@/lib/control'
import { getLockInfo } from '@/lib/crypto/lock'
import { walletScreenPath } from '@/lib/route'
import { queryKeys } from '@/lib/xrpl/query-keys'

/** A key that wraps its legend rather than push a plate past 320px or 200% text. */
const KEY = 'h-auto min-h-8 w-fit max-w-full whitespace-normal py-1 pointer-coarse:min-h-11'

/** The data-attribute a task screen's return lands on. */
const EDIT_CHECKS_KEY = 'edit-checks'

/**
 * The lock's auto-lock minutes (AD-44). The keystore re-proves the lock's Open Check
 * and applies the Mainnet floor over every Wallet on the lock; nothing here decides
 * a rule. The shown value is always the `lockInfo` read, so a refusal reverts it.
 */
function AutoLockRow({ lockId, minutes }: { lockId: string; minutes: number | null }) {
  const prompts = usePrompts()
  const lockMinutesChanged = useLockMinutesChanged()
  const wallets = useAppStore((s) => s.wallets)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const id = useId()
  const problemId = `${id}-problem`
  const sharedBy = new Set(wallets.filter((w) => w.lockId === lockId).map((w) => w.seedId)).size
  const choices: number[] = [...AUTO_LOCK_CHOICES]
  // A lock whose minutes are not a choice (legacy) still shows what it really has.
  if (minutes !== null && !choices.includes(minutes)) choices.push(minutes)
  choices.sort((a, b) => a - b)

  async function change(next: number) {
    setProblem(null)
    setBusy(true)
    try {
      const verdict = await setLockAutoLock(lockId, next, { prompts })
      if (!verdict.ok) {
        setProblem(verdict.reason)
        return
      }
      try {
        await lockMinutesChanged(lockId, next)
      } catch {
        // The keystore already wrote the change: a refresh that failed is not a change that failed.
        setProblem('The auto-lock was changed, but this screen could not refresh. Reopen it to see the new value.')
      }
    } catch (err: unknown) {
      setProblem(err instanceof Error && err.message ? err.message : 'Could not change the auto-lock.')
    } finally {
      setBusy(false)
      // The select was disabled while the check ran, which drops focus; put it back where the keyboard user was.
      setTimeout(() => triggerRef.current?.focus(), 0)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>Auto-lock after inactivity</Label>
        <Select value={minutes === null ? '' : String(minutes)} onValueChange={(v) => void change(Number(v))} disabled={minutes === null || busy}>
          <SelectTrigger ref={triggerRef} id={id} className="w-36" aria-describedby={problem ? problemId : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {minutesLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {minutes === null && <p className="text-xs text-muted-foreground">Available once this wallet's checks are read.</p>}
      {busy && (
        <p role="status" className="text-xs text-muted-foreground">
          Changing the auto-lock…
        </p>
      )}
      {problem && (
        <p id={problemId} role="alert" className="break-words text-sm text-text-destructive">
          {problem}
        </p>
      )}
      {sharedBy > 1 && (
        <p className="text-xs text-muted-foreground">This lock is shared by {sharedBy} wallets. A change applies to all of them.</p>
      )}
    </div>
  )
}

function ChecksPlate({ wallet }: { wallet: WalletMeta }) {
  // The same read Edit checks makes, from the same key: one cache entry per lock.
  const lock = useQuery({ queryKey: queryKeys.lockInfo(wallet.lockId), queryFn: () => getLockInfo(wallet.lockId) })
  const signing = wallet.seedMethod === 'passkey-derived' ? 'passkey' : wallet.signingCheck

  return (
    <ConfigPlate title="Checks">
      {lock.isError ? (
        // A failed read is never shown as "no check" or as a current one.
        <>
          <p role="alert" className="text-sm text-text-destructive">
            Could not read this wallet's checks.
          </p>
          <Button type="button" variant="outline" size="sm" className={KEY} onClick={() => void lock.refetch()}>
            Retry
          </Button>
        </>
      ) : !lock.data ? (
        <p role="status" className="text-sm text-muted-foreground">
          Reading this wallet's checks…
        </p>
      ) : (
        <dl className="flex flex-col gap-2 text-sm">
          <div className="min-w-0">
            <dt className="panel-legend">Open Check</dt>
            <dd className="mt-0.5 break-words">{openCheckWords(lock.data.openCheck)}</dd>
            {lock.data.openCheck === 'none' && <dd className="text-xs text-muted-foreground">{NO_OPEN_CHECK_DETAIL}</dd>}
          </div>
          <div className="min-w-0">
            <dt className="panel-legend">Signing Check</dt>
            <dd className="mt-0.5 break-words">{signingWords(signing)}</dd>
            {signing === 'standard' && <dd className="text-xs text-muted-foreground">{STANDARD_SIGNING_DETAIL}</dd>}
          </div>
        </dl>
      )}
      <AutoLockRow key={wallet.lockId} lockId={wallet.lockId} minutes={lock.isError || !lock.data ? null : lock.data.autoLockMinutes} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={KEY}
        data-configure-key={EDIT_CHECKS_KEY}
        onClick={() => launchFromConfigure(walletScreenPath('edit-checks', wallet.id), EDIT_CHECKS_KEY)}
      >
        Edit checks
      </Button>
    </ConfigPlate>
  )
}

function SeedPlate({ wallet }: { wallet: WalletMeta }) {
  return (
    <ConfigPlate title="Seed">
      <p className="text-sm text-muted-foreground">Show this wallet's Seed so you can write it down. Anyone who sees it controls the funds.</p>
      <RevealSeedControl wallet={wallet} />
    </ConfigPlate>
  )
}

const CONTROL_KEY = 'let-another-wallet-sign'
const TWO_DEVICE_KEY = 'two-device'

function ControlPlate({ wallet }: { wallet: WalletMeta }) {
  return (
    <ConfigPlate title="Operating another account">
      <ControlledNote wallet={wallet} />
      {holdsMasterKey(wallet) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={KEY}
          data-configure-key={CONTROL_KEY}
          onClick={() => launchFromConfigure(walletScreenPath('control', wallet.id), CONTROL_KEY)}
        >
          Let another wallet sign
        </Button>
      )}
      <MasterKeyControl wallet={wallet} />
    </ConfigPlate>
  )
}

/**
 * Per-wallet configuration (FR-88): one routed screen, a plate per concern in a
 * fixed order. The app shell mounts it only for the active Wallet whose lock is
 * open (AD-32); this component trusts that and reads no other Wallet.
 */
export function ConfigureScreen({ wallet }: { wallet: WalletMeta }) {
  const headingRef = useRef<HTMLHeadingElement | null>(null)

  // Landing: the key that opened the task screen we came back from, else the screen's own heading.
  useEffect(() => {
    const returnKey = peekConfigureFocusReturn()
    const target = returnKey ? document.querySelector<HTMLElement>(`[data-configure-key="${CSS.escape(returnKey)}"]`) : null
    ;(target ?? headingRef.current)?.focus()
  }, [])

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 ref={headingRef} tabIndex={-1} className="font-legend text-base font-semibold uppercase leading-tight tracking-[0.08em]">
          Configure wallet
        </h1>
        <p className="min-w-0 break-words text-sm text-muted-foreground">{wallet.label}</p>
      </div>
      <ChecksPlate wallet={wallet} />
      <SeedPlate wallet={wallet} />
      {/* A wallet either operates another account or holds the Account Master Key, so this plate always has something to say. */}
      <ControlPlate wallet={wallet} />
      <OtherNetworksPlate wallet={wallet} />
      <ConfigPlate title="Node">
        <WalletNodeSection wallet={wallet} />
      </ConfigPlate>
      <ConfigPlate title="Two-device signing">
        <TwoDeviceSign wallet={wallet} configureKey={TWO_DEVICE_KEY} />
      </ConfigPlate>
    </div>
  )
}
