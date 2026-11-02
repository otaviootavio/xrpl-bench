import { useState } from 'react'
import { CreateWalletFlow } from '@/components/wallet/CreateWalletFlow'
import { TaskScreen } from '@/components/wallet/TaskScreen'
import { useSeedImport } from '@/components/wallet/useSeedImport'
import { useLeaveBlocker } from '@/hooks/useRoute'
import { announceAdded } from '@/lib/chooser-signals'
import { toast } from '@/lib/notify'

/**
 * Add wallet (`/wallets/new`), a chooser-side screen the app shell renders (AD-32,
 * AD-40): it needs no open wallet. Generate and Import are both `CreateWalletFlow`,
 * the component onboarding renders: it asks the per-wallet questions, makes the
 * Wallet its own lock and commits itself, and it never selects or enters the
 * wallet. On success this returns to where the user came from and announces the
 * new card so the Chooser can focus it.
 *
 * Import (AD-39) supplies the flow with a Seed source from `useSeedImport`, the one
 * wiring shared with first-run Onboarding (parse, duplicate probe, master-key check,
 * then `importStoredWallet` under its own new lock; Guardrail #3 is kept there).
 */
export function AddWalletScreen({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'generate' | 'import'>('generate')
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null)
  // A new Wallet is being checked, written or backed up inside the flow. Not
  // leavable meanwhile: leaving reads as "stop", and the write would still land.
  const [creating, setCreating] = useState(false)
  useLeaveBlocker(creating)

  // Set when the path was just changed: the remounted flow gives the picked radio focus once.
  const [focusPath, setFocusPath] = useState(false)

  const { importSource, clearSeed, warningDialog } = useSeedImport()

  return (
    <TaskScreen
      title="Add another wallet"
      description="Generate a new wallet or import one with a seed."
      backLabel="Wallets"
      onBack={onClose}
      locked={creating}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        {/* Keyed by mode: each mode starts its own answers, and the Seed field goes with Import. */}
        <CreateWalletFlow
          key={mode}
          defaultLabel=""
          actionHost={footerHost}
          onInProgressChange={setCreating}
          pathChoice={{
            value: mode === 'import' ? 'import' : 'create',
            disabled: creating,
            focusOnMount: focusPath,
            onFocusTaken: () => setFocusPath(false),
            onChange: (next) => {
              if (next === (mode === 'import' ? 'import' : 'create')) return
              if (next === 'create') clearSeed() // the typed Seed does not wait in a detached field
              setFocusPath(true)
              setMode(next === 'import' ? 'import' : 'generate')
            },
          }}
          {...(mode === 'import' ? { importSource } : {})}
          onDone={(meta) => {
            // Adding selects and enters nothing: the Chooser focuses the new card.
            announceAdded(meta.id)
            toast.success('Wallet added.')
            onClose()
          }}
        />
      </div>
      <div ref={setFooterHost} className="contents" />
      {warningDialog}
    </TaskScreen>
  )
}
