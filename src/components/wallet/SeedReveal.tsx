import { useEffect, useRef, useState } from 'react'
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/**
 * account-onboarding.md US-1/US-6: the seed is shown once (or on explicit
 * re-verification), never logged, and cleared as soon as this component
 * unmounts.
 *
 * The seed is supplied as a GETTER rather than a plain prop, and is written
 * straight to the DOM from an effect. That keeps guardrail #3 satisfied — the
 * secret never becomes React state, and callers don't have to read a ref
 * during render to hand it over (which React flags, since a ref change alone
 * won't re-render). Nothing here ever puts the value in a serializable place.
 */
export function SeedReveal({ getSeed }: { getSeed: () => string | null }) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const outputRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const node = outputRef.current
    if (!node) return
    const seed = getSeed() ?? ''
    node.textContent = visible ? seed : '•'.repeat(seed.length)
    return () => {
      // Don't leave the plaintext sitting in a detached DOM node.
      node.textContent = ''
    }
  }, [visible, getSeed])

  async function handleCopy() {
    const seed = getSeed()
    if (!seed) return
    await navigator.clipboard.writeText(seed)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-3">
      <Alert variant="warning">
        <AlertTitle>This is the ONLY way to recover your wallet</AlertTitle>
        <AlertDescription>
          Write it down and store it somewhere safe and offline. Anyone with this seed has full control of your funds. This app
          never transmits it anywhere.
        </AlertDescription>
      </Alert>
      <div className="panel-well flex items-center gap-2 rounded-md px-3 py-2">
        <span ref={outputRef} className="flex-1 break-all font-data text-sm leading-relaxed tracking-tight" />
        <Button variant="ghost" size="icon" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Hide seed' : 'Show seed'} aria-pressed={visible} type="button">
          {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          aria-label={copied ? 'Seed copied' : 'Copy seed'}
          type="button"
        >
          {copied ? <CheckIcon className="size-4 text-text-success" /> : <CopyIcon className="size-4" />}
        </Button>
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? 'Seed copied to clipboard' : ''}
        </span>
      </div>
    </div>
  )
}
