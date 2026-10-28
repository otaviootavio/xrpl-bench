import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { ConfigPlate } from '@/components/wallet/ConfigPlate'
import { RevealSeedControl } from '@/components/wallet/RevealSeedControl'
import { NO_OPEN_CHECK_DETAIL, STANDARD_SIGNING_DETAIL, openCheckWords, signingWords } from '@/components/wallet/check-words'
import { launchFromConfigure, peekConfigureFocusReturn } from '@/lib/configure-launch'
import type { WalletMeta } from '@/lib/crypto/keystore'
import { getLockInfo } from '@/lib/crypto/lock'
import { walletScreenPath } from '@/lib/route'
import { queryKeys } from '@/lib/xrpl/query-keys'

/** A key that wraps its legend rather than push a plate past 320px or 200% text. */
const KEY = 'h-auto min-h-8 w-fit max-w-full whitespace-normal py-1 pointer-coarse:min-h-11'

/** The data-attribute a task screen's return lands on. */
const EDIT_CHECKS_KEY = 'edit-checks'

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

/**
 * Per-wallet configuration (FR-88): one routed screen, a plate per concern in a
 * fixed order. The app shell mounts it only for the active Wallet whose lock is
 * open (AD-32); this component trusts that and reads no other Wallet. The plates
 * after Seed arrive in Story 15, each in its place in the order.
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
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 ref={headingRef} tabIndex={-1} className="font-legend text-base font-semibold uppercase leading-tight tracking-[0.08em]">
          Configure wallet
        </h1>
        <p className="min-w-0 break-words text-sm text-muted-foreground">{wallet.label}</p>
      </div>
      <ChecksPlate wallet={wallet} />
      <SeedPlate wallet={wallet} />
    </div>
  )
}
