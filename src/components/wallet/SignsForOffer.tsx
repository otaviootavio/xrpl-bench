import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { setSignsFor, SignsForRefusedError, type KeyWalletMeta } from '@/lib/crypto/keystore'
import { notify } from '@/lib/notify'
import { NOT_NOW, SET_IT, SET_IT_ELSEWHERE, SET_WALLET_TO_SIGN_FOR } from '@/lib/signs-for-words'
import { forgetSyncedAddress } from '@/lib/teardown'
import { fill } from '@/lib/transmit-words'
import type { RegularKeySet } from '@/lib/transmit-step'
import { signsForTarget } from '@/lib/signs-for'
import { useAppStore } from '@/store/app-store'

/**
 * P-54 (OS-FR-20): after a Regular Key change the ledger validated at a Transmit
 * step, offers to set the new key's Wallet to sign for that Account when the key is a
 * Wallet on this device on that Network ("Set it" · "Not now"), else tells the user to
 * do it in the wallet that has the key. "Set it" goes through `setSignsFor`, so FR-93's
 * refusal (P-35) and a shared record ("Nothing was changed.") hold here too.
 */
export function SignsForOffer({ set }: { set: RegularKeySet }) {
  const queryClient = useQueryClient()
  const wallets = useAppStore((s) => s.wallets)
  const setWallets = useAppStore((s) => s.setWallets)
  const [closed, setClosed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const target = signsForTarget(wallets, set)
  if (closed || target === 'done') return null
  if (target === null) {
    return <p className="text-sm">{SET_IT_ELSEWHERE}</p>
  }

  async function setIt(wallet: KeyWalletMeta) {
    if (busy) return
    setBusy(true)
    setRefusal(null)
    try {
      const meta = await setSignsFor(wallet.id, set.account)
      const { wallets: current } = useAppStore.getState()
      setWallets(current.map((w) => (w.id === meta.id ? meta : w)))
      if (wallet.kind === 'online' && wallet.address !== meta.address) forgetSyncedAddress(queryClient, wallet.id, wallet.network, wallet.address)
      setClosed(true)
    } catch (err) {
      if (err instanceof SignsForRefusedError && err.refusal === 'duplicate') setRefusal(err.message)
      else notify.error('Nothing was changed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm [overflow-wrap:anywhere]">{fill(SET_WALLET_TO_SIGN_FOR, target.label)}</p>
      {refusal && (
        <p role="alert" className="text-sm text-text-destructive">
          {refusal}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void setIt(target)}>
          {SET_IT}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setClosed(true)}>
          {NOT_NOW}
        </Button>
      </div>
    </div>
  )
}
