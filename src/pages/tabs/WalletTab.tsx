import { useEffect, useId, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfigPlate } from '@/components/wallet/ConfigPlate'
import { AddressBookPlate } from '@/components/wallet/AddressBookPlate'
import { AddressDisplay } from '@/components/wallet/AddressDisplay'
import { NetworkPlate } from '@/components/wallet/NetworkPlate'
import { KindStamp } from '@/components/wallet/KindStamp'
import { RemoveDialog, type RemoveTarget } from '@/components/wallet/RemoveDialog'
import { removeBodyFor, type RemoveBody } from '@/components/wallet/remove-copy'
import { RenameDialog } from '@/components/wallet/RenameDialog'
import { ControlledNote } from '@/components/wallet/ControlledNote'
import { MasterKeyControl } from '@/components/wallet/MasterKeyControl'
import { TwoDeviceSign } from '@/components/wallet/TwoDeviceSign'
import { WalletNodeSection } from '@/components/wallet/WalletNodeSection'
import { RevealSeedControl } from '@/components/wallet/RevealSeedControl'
import { formatAlgorithm, formatSeedMethod, QUESTION_TERMS } from '@/components/wallet/walk-questions'
import {
  NO_OPEN_CHECK_DETAIL,
  OPEN_CHECK_QUESTION,
  SIGNING_CHECK_QUESTION,
  openCheckWords,
  signingWords,
} from '@/components/wallet/check-words'
import { launchFromConfigure, peekConfigureFocusReturn, clearConfigureFocusReturn } from '@/lib/configure-launch'
import { useLockMinutesChanged } from '@/hooks/useLockMinutesChanged'
import { usePrompts } from '@/hooks/usePrompts'
import { listWallets, renameWallet, setLockAutoLock, setShowBeforeSending, type WalletMeta } from '@/lib/crypto/keystore'
import { BEFORE_SENDING_DESCRIPTION, BEFORE_SENDING_PLATE, SHOW_BEFORE_SENDING } from '@/lib/transmit-words'
import { notify } from '@/lib/notify'
import { AUTO_LOCK_CHOICES } from '@/lib/crypto/policy'
import { minutesLabel } from '@/lib/minutes-label'
import { useAppStore } from '@/store/app-store'
import { holdsMasterKey } from '@/lib/control'
import { getLockInfo } from '@/lib/crypto/lock'
import { confirmRemoveWallet, openWalletNow } from '@/lib/remove-wallet'
import { leaveToChooser, walletScreenPath } from '@/lib/route'
import { NETWORKS } from '@/lib/xrpl/networks'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { NOT_SYNCED } from '@/lib/wallet-kind-words'

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
  // A lock whose minutes are not a choice still shows what it really has.
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

const NAME_PLATE = 'name'

/**
 * The wallet's name (FR-92). The rule, the write and the copy are the chooser card's:
 * `RenameDialog` and `keystore.renameWallet`. A name is a property of the Seed, so a save
 * replaces the keystore's metas for that Seed and every row of it shows the new name.
 */
function NamePlate({ wallet }: { wallet: WalletMeta }) {
  const [renaming, setRenaming] = useState(false)
  const wallets = useAppStore((s) => s.wallets)
  const setWallets = useAppStore((s) => s.setWallets)
  // One name per other Seed, not per row.
  const others = [...new Map(wallets.filter((w) => w.seedId !== wallet.seedId).map((w) => [w.seedId, w.label])).values()]

  async function save(seedId: string, name: string) {
    const result = await renameWallet(seedId, name)
    if (!result.ok) return result.reason
    const { wallets: current } = useAppStore.getState()
    // A Seed removed meanwhile is not brought back by its rename.
    if (current.some((w) => w.seedId === seedId)) setWallets(current.filter((w) => w.seedId !== seedId).concat(result.metas))
    setRenaming(false)
    notify.success('Wallet renamed.')
    return true as const
  }

  return (
    <ConfigPlate title="Name" focusId={NAME_PLATE}>
      <p className="min-w-0 break-words text-sm">{wallet.label}</p>
      <Button type="button" variant="outline" size="sm" className={KEY} aria-label={`Rename ${wallet.label}`} onClick={() => setRenaming(true)}>
        Rename
      </Button>
      <RenameDialog
        target={renaming ? { seedId: wallet.seedId, name: wallet.label } : null}
        others={others}
        onSave={save}
        onClose={() => setRenaming(false)}
        returnFocusTo={() => document.querySelector<HTMLElement>(`[data-configure-plate="${NAME_PLATE}"]`)}
      />
    </ConfigPlate>
  )
}

/** The checks of this Wallet. A Transmitter Wallet holds no key, so it shows its
 * Open Check and auto-lock only: no Signing Check row and no Edit checks key (OS-FR-3). */
function ChecksPlate({ wallet }: { wallet: WalletMeta }) {
  const signs = wallet.kind !== 'transmitter'
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
            <dt className="panel-legend">{OPEN_CHECK_QUESTION}</dt>
            <dd className="mt-0.5 break-words">{openCheckWords(lock.data.openCheck)}</dd>
            {lock.data.openCheck === 'none' && <dd className="text-xs text-muted-foreground">{NO_OPEN_CHECK_DETAIL}</dd>}
          </div>
          {signs && (
            <div className="min-w-0">
              <dt className="panel-legend">{SIGNING_CHECK_QUESTION}</dt>
              <dd className="mt-0.5 break-words">{signingWords(signing)}</dd>
            </div>
          )}
        </dl>
      )}
      <AutoLockRow key={wallet.lockId} lockId={wallet.lockId} minutes={lock.isError || !lock.data ? null : lock.data.autoLockMinutes} />
      {signs && (
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
      )}
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

const REMOVE_KEY = 'remove'

/**
 * Removing this wallet (FR-92, AD-46). The dialog, the copy and the removal itself are the chooser
 * card's, through `lib/remove-wallet`: the lock is re-checked from the store when Remove is pressed
 * and again at confirm. It acts on this one Wallet only.
 */
function RemovePlate({ wallet }: { wallet: WalletMeta }) {
  const [removing, setRemoving] = useState<RemoveTarget | null>(null)
  const queryClient = useQueryClient()
  const network = NETWORKS[wallet.network].label

  // The key's own state stops nothing a keyboard can do, so the guard is here, at call time.
  function press() {
    const now = openWalletNow(wallet.id)
    if (!now) return
    setRemoving({ walletId: wallet.id, name: now.label, body: removeBodyFor(useAppStore.getState().wallets, wallet.id) })
  }

  const confirm = (walletId: string, shownBody: RemoveBody) =>
    confirmRemoveWallet(queryClient, walletId, shownBody, {
      refused: () => setRemoving(null),
      settling: (remaining) => {
        setRemoving(null)
        // Leave before the store write, so the history is unwound rather than replaced. With no wallet left, first run shows by itself.
        if (remaining !== 0) leaveToChooser()
      },
      settled: () => {},
    })

  return (
    <ConfigPlate title="Remove this wallet">
      <p className="text-sm text-muted-foreground">
        Remove {wallet.label} on {network} and its Address Book from this device.
      </p>
      <Button type="button" variant="danger" size="sm" className={KEY} data-configure-key={REMOVE_KEY} aria-label={`Remove ${wallet.label} on ${network}`} onClick={press}>
        Remove
      </Button>
      <RemoveDialog
        target={removing}
        onConfirm={confirm}
        onClose={() => setRemoving(null)}
        returnFocusTo={() => document.querySelector<HTMLElement>(`[data-configure-key="${REMOVE_KEY}"]`)}
      />
    </ConfigPlate>
  )
}

/** One read-only line of what was chosen at creation and cannot change: its legend and its words. */
function SetupLine({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="min-w-0 flex-1 basis-40">
        <dt className="panel-legend">{term}</dt>
        <dd className="mt-0.5 break-words">{value}</dd>
      </div>
      <span className="text-xs text-muted-foreground">Fixed at creation</span>
    </div>
  )
}

/**
 * Who this wallet is: its full Address, and the two choices made at creation that no plate can change,
 * read-only from the `WalletMeta` (no ledger read). The name and the Network are in the page heading,
 * so they are not repeated, and the Node and the two checks are not repeated either: their own plates
 * below show them. The words are the quiz's (`walk-questions`).
 */
function IdentityPlate({ wallet }: { wallet: WalletMeta }) {
  // A Transmitter Wallet holds no key, so it has no key rows; until Sync exists it has no address either (P-5).
  if (wallet.kind === 'transmitter') {
    return (
      <ConfigPlate title="This wallet">
        <p className="text-sm">{NOT_SYNCED}</p>
      </ConfigPlate>
    )
  }
  return (
    <ConfigPlate title="This wallet">
      <AddressDisplay address={wallet.address} />
      <dl className="flex flex-col gap-2.5 text-sm">
        <SetupLine term={QUESTION_TERMS['Signature type']} value={wallet.algorithm === 'unresolved' ? 'Unknown' : formatAlgorithm(wallet.algorithm)} />
        <SetupLine term={QUESTION_TERMS['Seed Method']} value={formatSeedMethod(wallet.seedMethod)} />
      </dl>
    </ConfigPlate>
  )
}

/**
 * Before sending (OS-FR-10, CAP-6): "Show the signed transaction before sending",
 * off by default, on Online and Transmitter Wallets only. The control is the
 * Checkbox primitive with switch semantics (there is no Switch primitive in the
 * panel vocabulary): it takes effect at once, on the next send.
 */
function BeforeSendingPlate({ wallet }: { wallet: WalletMeta }) {
  const setWallets = useAppStore((s) => s.setWallets)
  const [busy, setBusy] = useState(false)
  const descriptionId = useId()

  async function change(on: boolean) {
    setBusy(true)
    try {
      await setShowBeforeSending(wallet.id, on)
      setWallets(await listWallets())
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfigPlate title={BEFORE_SENDING_PLATE}>
      <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
        <Checkbox
          role="switch"
          checked={wallet.showBeforeSending === true}
          disabled={busy}
          aria-describedby={descriptionId}
          onCheckedChange={(v) => void change(v === true)}
        />
        {SHOW_BEFORE_SENDING}
      </label>
      <p id={descriptionId} className="text-sm text-muted-foreground">
        {BEFORE_SENDING_DESCRIPTION}
      </p>
    </ConfigPlate>
  )
}

/** The plates after Name and Address Book, per kind, in the spine's fixed order (EXPERIENCE
 * "Local settings plates, per kind"). The Online list is today's, unchanged. */
function KindPlates({ wallet }: { wallet: WalletMeta }) {
  switch (wallet.kind) {
    case 'online':
      return (
        <>
          <ChecksPlate wallet={wallet} />
          <SeedPlate wallet={wallet} />
          {/* A wallet either operates another account or holds the Account Master Key, so this plate always has something to say. */}
          <ControlPlate wallet={wallet} />
          <ConfigPlate title="Node">
            <WalletNodeSection wallet={wallet} />
          </ConfigPlate>
          <BeforeSendingPlate wallet={wallet} />
          <ConfigPlate title="Two-device signing">
            <TwoDeviceSign wallet={wallet} configureKey={TWO_DEVICE_KEY} />
          </ConfigPlate>
        </>
      )
    case 'offline':
      // No Node: an Offline Wallet never touches the ledger. Key changes are New transaction types, not plates.
      return (
        <>
          <ChecksPlate wallet={wallet} />
          <SeedPlate wallet={wallet} />
        </>
      )
    case 'transmitter':
      // No Seed: a Transmitter Wallet holds no key.
      return (
        <>
          <ChecksPlate wallet={wallet} />
          <ConfigPlate title="Node">
            <WalletNodeSection wallet={wallet} />
          </ConfigPlate>
          <BeforeSendingPlate wallet={wallet} />
        </>
      )
    default: {
      const unknown: never = wallet.kind
      void unknown
      return null
    }
  }
}

/**
 * The Local settings tab (FR-88, CAP-1): this wallet's own settings, a plate per concern in a fixed order,
 * in one column and with no jump list. `Main` mounts it only for an open Wallet, inside that kind's
 * shell, so the lock is open (AD-32); this component trusts that and reads no other Wallet. The plates
 * depend on the kind (OS-FR-1). App-level plates (Remove all, Version) are not here: they belong to `/settings`.
 */
export function WalletTab({ wallet }: { wallet: WalletMeta }) {
  // Landing: only when a task screen opened from this tab has just returned, put focus on the key
  // that opened it. A plain tab selection never moves focus off the tab list. The pending return
  // is cleared on the next tick, so a dev double mount still sees it and a later visit does not.
  useEffect(() => {
    const returnKey = peekConfigureFocusReturn()
    if (returnKey) document.querySelector<HTMLElement>(`[data-configure-key="${CSS.escape(returnKey)}"]`)?.focus()
    const timer = setTimeout(clearConfigureFocusReturn, 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-lg flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        {/* One h1: the fixed label and the wallet's name as two spans, so the name keeps the case the user typed. */}
        <h1 className="min-w-0 break-words leading-tight">
          <span className="panel-legend block">Local settings</span>{' '}
          <span className="mt-0.5 block break-words text-lg font-semibold">{wallet.label}</span>
        </h1>
        {/* The kind first, then the Network: the chooser card's order (OS-FR-1). */}
        <div className="flex flex-wrap items-center gap-2">
          <KindStamp kind={wallet.kind} />
          <NetworkPlate />
        </div>
      </div>
      <IdentityPlate wallet={wallet} />
      <NamePlate wallet={wallet} />
      <AddressBookPlate walletId={wallet.id} />
      <KindPlates wallet={wallet} />
      <RemovePlate wallet={wallet} />
    </div>
  )
}
