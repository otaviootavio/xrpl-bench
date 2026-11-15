import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PromptsContext } from '@/hooks/usePrompts'
import type { Prompts } from '@/lib/crypto/keystore'
import { MAX_ATTEMPTS_BEFORE_HARD_LOCK } from '@/lib/crypto/pin'
import type { SignedForReview } from '@/lib/xrpl/writes'
import { currentPathname, subscribeRoute } from '@/lib/route'
import { useAppStore } from '@/store/app-store'
import { SignedTransactionReview } from './SignedTransactionReview'

/**
 * The App PIN prompt for a PIN Signing Check and for revealing a Seed behind
 * one (FR-66, FR-69). It states how many tries remain and what a lock-out is, in
 * plain words. Closing it by any route resolves `null`: a cancelled prompt is not
 * a wrong PIN and never counts.
 *
 * The typed PIN lives in an uncontrolled input, is read once on submit and is
 * cleared; it is never React state.
 */
export function PinPromptDialog({
  triesRemaining,
  onSubmit,
  onCancel,
}: {
  triesRemaining: number
  onSubmit: (pin: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const pin = inputRef.current?.value ?? ''
    if (pin === '') return
    if (inputRef.current) inputRef.current.value = ''
    onSubmit(pin)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent variant="sheet">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Enter your App PIN</DialogTitle>
            <DialogDescription>This wallet asks for the App PIN each time it signs or shows its seed.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="signing-pin">App PIN</Label>
            <Input id="signing-pin" ref={inputRef} type="password" inputMode="numeric" autoComplete="off" />
            <p className="text-sm" role="status">
              {triesRemaining} {triesRemaining === 1 ? 'try' : 'tries'} remaining.
            </p>
            <p className="text-xs text-muted-foreground">
              A wrong PIN counts against everything that uses the App PIN. After {MAX_ATTEMPTS_BEFORE_HARD_LOCK} wrong tries the PIN is
              locked and cannot be used until it is reset. Cancelling does not count.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Continue</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Gives the screens below it a `Prompts` whose PIN prompt is the dialog above,
 * and whose `reviewSignedTransaction` is the show-before-sending screen
 * (OS-FR-10). One prompt of each at a time: a second request dismisses the first.
 *
 * The review is always answered, because the in-flight depth stays raised until
 * it is: Send is `true`; Do not send, Escape and the close control are `false`;
 * and so are the Wallet's lock closing, the route changing (leaving), a newer
 * review, and this provider unmounting. */
export function PinPromptProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<{ triesRemaining: number } | null>(null)
  const resolver = useRef<((pin: string | null) => void) | null>(null)
  const [review, setReview] = useState<{ signed: SignedForReview; lockId: string | null; pathname: string } | null>(null)
  const reviewResolver = useRef<((send: boolean) => void) | null>(null)

  const prompts = useMemo<Prompts>(
    () => ({
      pin: (info) =>
        new Promise<string | null>((resolve) => {
          resolver.current?.(null)
          resolver.current = resolve
          setRequest({ triesRemaining: info.triesRemaining })
        }),
      reviewSignedTransaction: (signed) =>
        new Promise<boolean>((resolve) => {
          reviewResolver.current?.(false)
          reviewResolver.current = resolve
          // The lock of the Wallet being sent from, if it is open now: its
          // closing answers "no".
          const { wallets, activeWalletId, openLocks } = useAppStore.getState()
          const lockId = wallets.find((w) => w.id === activeWalletId)?.lockId ?? null
          setReview({ signed, lockId: lockId && openLocks[lockId] ? lockId : null, pathname: currentPathname() })
        }),
    }),
    [],
  )

  // The host screen going away mid-prompt must not leave its caller waiting for
  // ever with its busy state set: an unmounted prompt is a cancelled one.
  useEffect(
    () => () => {
      const resolve = resolver.current
      resolver.current = null
      resolve?.(null)
      const answer = reviewResolver.current
      reviewResolver.current = null
      answer?.(false)
    },
    [],
  )

  function settle(pin: string | null) {
    const resolve = resolver.current
    resolver.current = null
    setRequest(null)
    resolve?.(pin)
  }

  function answerReview(send: boolean) {
    const answer = reviewResolver.current
    reviewResolver.current = null
    // The blob leaves memory with the screen.
    setReview(null)
    answer?.(send)
  }

  // A lock while the screen is open: nothing is sent.
  useEffect(() => {
    const lockId = review?.lockId
    if (!lockId) return undefined
    return useAppStore.subscribe((s) => {
      if (!s.openLocks[lockId]) answerReview(false)
    })
  }, [review])

  // Leaving the screen (Back, a link, a typed URL): nothing is sent.
  useEffect(() => {
    if (!review) return undefined
    return subscribeRoute(() => {
      if (currentPathname() !== review.pathname) answerReview(false)
    })
  }, [review])

  return (
    <PromptsContext.Provider value={prompts}>
      {children}
      {request && <PinPromptDialog triesRemaining={request.triesRemaining} onSubmit={settle} onCancel={() => settle(null)} />}
      {review && <SignedTransactionReview key={review.signed.hash} signed={review.signed} onAnswer={answerReview} />}
    </PromptsContext.Provider>
  )
}
