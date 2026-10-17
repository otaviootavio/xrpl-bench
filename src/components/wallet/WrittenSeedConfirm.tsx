import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SeedReveal } from '@/components/wallet/SeedReveal'
import { answersMatch, pickChallenge, type ChallengeGroup } from '@/lib/seed-confirmation'
import type { NetworkId } from '@/lib/xrpl/networks'

/**
 * The written-Seed confirmation (FR-72): the Seed is shown, three groups of it are
 * typed back, and only then does the caller go on. Shared by the creation flow
 * and the edit-checks dialog.
 *
 * The Seed stays in the caller's ref (`getSeed`); the typed answers live in
 * uncontrolled inputs and are cleared as soon as the step ends — never state,
 * never kept (guardrail #3). The caller reads `onSettle` and drops the Seed.
 */
export function WrittenSeedConfirm({
  getSeed,
  network,
  onSettle,
  reason = 'Your passkey is the only check on this wallet, so a written Seed is how you get your funds back if the passkey is lost.',
}: {
  getSeed: () => string | null
  network: NetworkId
  /** `true`: the groups matched. `false`: the person cancelled. */
  onSettle: (ok: boolean) => void
  reason?: string
}) {
  const group = useId()
  const answerRefs = useRef<Array<HTMLInputElement | null>>([])
  const [challenge] = useState<ChallengeGroup[]>(() => pickChallenge((getSeed() ?? '').length))
  const [mismatch, setMismatch] = useState(false)
  // True once the person has confirmed: the caller is now writing, so the buttons are inert.
  const [settled, setSettled] = useState(false)

  function clearAnswers() {
    for (const input of answerRefs.current) if (input) input.value = ''
  }

  function settle(ok: boolean) {
    clearAnswers()
    if (ok) setSettled(true)
    onSettle(ok)
  }

  function check() {
    const seed = getSeed()
    if (!seed) return
    const answers = challenge.map((_, i) => answerRefs.current[i]?.value ?? '')
    if (!answersMatch(seed, challenge, answers)) {
      // Unlimited tries; the wrong answers are cleared, never kept or logged.
      clearAnswers()
      setMismatch(true)
      return
    }
    setMismatch(false)
    settle(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium">Write down your Seed</h2>
        <p className="text-sm text-muted-foreground">
          {network === 'mainnet' ? 'This is a Mainnet wallet: it holds real funds. ' : ''}
          {reason} Write it on paper and keep it offline. Nothing is saved until you have typed three parts of it back.
        </p>
      </div>
      <SeedReveal getSeed={getSeed} heading="Anyone with this Seed can take your funds" />
      <div className="grid gap-2">
        {challenge.map((part, i) => (
          <div key={part.from} className="grid gap-1">
            <Label htmlFor={`${group}-confirm-${i}`}>
              Characters {part.from}–{part.to}
            </Label>
            <Input
              id={`${group}-confirm-${i}`}
              ref={(el) => {
                answerRefs.current[i] = el
              }}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={8}
              className="font-data"
              aria-invalid={mismatch ? true : undefined}
            />
          </div>
        ))}
      </div>
      {mismatch && (
        <p role="alert" className="text-sm text-text-destructive">
          That does not match. Check what you wrote.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={settled} onClick={check}>
          Check what I wrote
        </Button>
        <Button type="button" variant="outline" disabled={settled} onClick={() => settle(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
