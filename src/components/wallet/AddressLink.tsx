import { ExternalLinkIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { accountExplorerUrl, txExplorerUrl } from '@/lib/xrpl/networks'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

function truncateMiddle(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

/**
 * The full value is reachable through the shared Tooltip primitive, not a
 * `title` attribute. `title` never fires for keyboard or touch users, and on
 * this app checking a full address character by character is the entire point
 * of the row (block-explorer-links.md US-1, docs/decisions.md §6.6).
 *
 * Radix's tooltip exposes its content via `aria-describedby`, so the full
 * value reaches a screen reader as well as the eye.
 */
function TruncatedExplorerLink({
  value,
  href,
  display,
  className,
}: {
  value: string
  href: string
  display: string
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className={cn('inline-flex items-center gap-1 rounded-sm font-data text-sm hover:underline', className)}
        >
          {display}
          <ExternalLinkIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
        </a>
      </TooltipTrigger>
      <TooltipContent className="max-w-[min(90vw,28rem)] break-all font-data">{value}</TooltipContent>
    </Tooltip>
  )
}

/** Every address anywhere in the app renders through this component — see
 * docs/decisions.md enforced pattern: no hand-rolled <a href> to an explorer,
 * and the explorer link always matches the currently active network
 * (block-explorer-links.md US-1, US-4). */
export function AddressLink({ address, truncate = true, className }: { address: string; truncate?: boolean; className?: string }) {
  const network = useAppStore((s) => s.network)
  if (!address) {
    return <span className={cn('text-muted-foreground', className)}>—</span>
  }
  const display = truncate ? truncateMiddle(address) : address
  // Nothing is hidden when the value is shown in full, so no tooltip.
  if (display === address) {
    return (
      <a
        href={accountExplorerUrl(network, address)}
        target="_blank"
        rel="noreferrer noopener"
        className={cn('inline-flex items-center gap-1 rounded-sm break-all font-data text-sm hover:underline', className)}
      >
        {address}
        <ExternalLinkIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
      </a>
    )
  }
  return (
    <TruncatedExplorerLink
      value={address}
      href={accountExplorerUrl(network, address)}
      display={display}
      className={className}
    />
  )
}

/** Transaction hash equivalent — block-explorer-links.md US-2. */
export function TxLink({ hash, className }: { hash: string; className?: string }) {
  const network = useAppStore((s) => s.network)
  if (!hash) {
    return <span className={cn('text-muted-foreground', className)}>—</span>
  }
  return (
    <TruncatedExplorerLink
      value={hash}
      href={txExplorerUrl(network, hash)}
      display={truncateMiddle(hash, 8, 6)}
      className={className}
    />
  )
}
