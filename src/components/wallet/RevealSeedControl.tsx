import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SeedReveal } from '@/components/wallet/SeedReveal'
import { revealCheckSentence } from '@/components/wallet/reveal-copy'
import { usePrompts } from '@/hooks/usePrompts'
import { describeCheckFailure, revealSeed, type WalletMeta } from '@/lib/crypto/keystore'
import { toast } from '@/lib/notify'
import { useAppStore } from '@/store/app-store'

/**
 * Reveal this Wallet's Seed (FR-69): a confirm that states the consequence and
 * names the check, then the Wallet's OWN check through `keystore.revealSeed` with
 * its own lock's key, then the Seed in a dialog. Guardrail #3: the decrypted Seed
 * lives in a ref for as long as the dialog is open, never in React state; it is
 * cleared when the dialog closes and when this component unmounts. Focus returns
 * to the Reveal seed key after either dialog.
 */
export function RevealSeedControl({ wallet }: { wallet: WalletMeta }) {
  const prompts = usePrompts()
  const keyRef = useRef<HTMLButtonElement | null>(null)
  const [confirming, setConfirming] = useState(false)
  // Only a flag drives rendering; the Seed itself is in the ref.
  const [seedVisible, setSeedVisible] = useState(false)
  const revealedSeedRef = useRef<string | null>(null)
  const getRevealedSeed = useCallback(() => revealedSeedRef.current, [])

  // True while this control is on the page; a reveal that resolves after it left must not write the Seed anywhere.
  const mountedRef = useRef(true)
  // One check at a time: a second press while a PIN or passkey prompt is open would ask twice and count twice against a lockout.
  const pendingRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      revealedSeedRef.current = null
    }
  }, [])

  async function handleConfirmReveal() {
    // The key of THIS Wallet's lock: opening one lock never reveals another's Seed.
    const openKey = useAppStore.getState().openLocks[wallet.lockId]?.key ?? null
    if (!openKey) {
      toast.error('Open this wallet first: its lock is closed.')
      return
    }
    if (pendingRef.current) return
    pendingRef.current = true
    try {
      const result = await revealSeed(wallet.id, { openKey, prompts })
      if (!mountedRef.current) return // left meanwhile: the Seed goes nowhere
      if (result.status !== 'ok') {
        toast.error(result.status === 'cancelled' ? 'Cancelled. The seed was not revealed.' : describeCheckFailure(result))
        return
      }
      revealedSeedRef.current = result.value
      setSeedVisible(true)
      setConfirming(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not reveal seed.')
    } finally {
      pendingRef.current = false
    }
  }

  function closeSeedDialog() {
    revealedSeedRef.current = null
    setSeedVisible(false)
  }

  return (
    <>
      <Button
        ref={keyRef}
        type="button"
        variant="outline"
        size="sm"
        className="h-auto min-h-8 w-fit max-w-full whitespace-normal py-1 pointer-coarse:min-h-11"
        onClick={() => setConfirming(true)}
      >
        Reveal seed
      </Button>

      <Dialog open={confirming} onOpenChange={(o) => !o && setConfirming(false)}>
        <DialogContent dismissOnOutsidePress returnFocusTo={() => keyRef.current}>
          <DialogHeader>
            <DialogTitle>Reveal this wallet's seed?</DialogTitle>
            <DialogDescription>
              Your seed grants full control of this wallet's funds to anyone who sees it. Make sure nobody can see your screen and
              that you are not being recorded before continuing. {revealCheckSentence(wallet)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleConfirmReveal()}>
              Show my seed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={seedVisible} onOpenChange={(o) => !o && closeSeedDialog()}>
        <DialogContent dismissOnOutsidePress returnFocusTo={() => keyRef.current}>
          <DialogHeader>
            <DialogTitle>Wallet seed</DialogTitle>
          </DialogHeader>
          {seedVisible && <SeedReveal getSeed={getRevealedSeed} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
