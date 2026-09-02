import { useState } from 'react'
import { CheckIcon, CopyIcon, ExternalLinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { accountExplorerUrl } from '@/lib/xrpl/networks'
import { useAppStore } from '@/store/app-store'

/**
 * The engraved serial plate.
 *
 * Full, untruncated address with a copy action — account-onboarding.md US-3,
 * receiving-payments.md US-1 — and an explorer link (block-explorer-links.md).
 *
 * Characters are grouped in fours, the way a key fingerprint is set, because
 * the job this row exists for is comparing an address against another surface
 * character by character. The groups are separate elements with CSS gaps rather
 * than inserted space characters, so selecting the plate still yields the exact
 * base58 string and never a version with spaces in it.
 */
function groupsOf(value: string, size = 4): string[] {
  const out: string[] = []
  for (let i = 0; i < value.length; i += size) out.push(value.slice(i, i + size))
  return out
}

export function AddressDisplay({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const network = useAppStore((s) => s.network)

  async function handleCopy() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="panel-plate flex items-start gap-1 rounded-md px-3 py-2">
      <div className="min-w-0 flex-1">
        <h2 className="panel-legend">Account</h2>
        {/* No whitespace text nodes between groups: the gap is layout, so a
            copy of the selection is still the canonical address. */}
        <p className="mt-1 flex flex-wrap gap-x-[0.45em] font-data text-[0.8125rem] leading-relaxed tracking-tight">
          {groupsOf(address).map((g, i) => (
            <span key={`${i}-${g}`}>{g}</span>
          ))}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        {/* The icon swap alone is invisible to a screen reader, so the accessible
            name changes with the state AND the change is announced. The live
            region is rendered unconditionally so the announcement is not a DOM
            insertion — docs/decisions.md §6.5. */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          aria-label={copied ? 'Address copied' : 'Copy address'}
          type="button"
        >
          {copied ? <CheckIcon className="size-4 text-text-success" /> : <CopyIcon className="size-4" />}
        </Button>
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? 'Address copied to clipboard' : ''}
        </span>
        <Button variant="ghost" size="icon" asChild aria-label="View account on block explorer">
          <a href={accountExplorerUrl(network, address)} target="_blank" rel="noreferrer noopener">
            <ExternalLinkIcon className="size-4" />
          </a>
        </Button>
      </div>
    </div>
  )
}
