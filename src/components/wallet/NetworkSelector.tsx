import { useAppStore } from '@/store/app-store'
import { NETWORK_IDS, type NetworkId } from '@/lib/xrpl/networks'
import { cn } from '@/lib/utils'

const LABEL: Record<NetworkId, string> = {
  mainnet: 'Mainnet',
  testnet: 'Testnet',
}

/**
 * The range selector.
 *
 * A panel sets a mode with a positional switch, not a dropdown: both positions
 * are visible at rest, so which network you are on AND what the alternative is
 * are readable without opening anything. That matters more here than in a
 * generic app — the two positions differ by whether the money is real.
 *
 * Built on radiogroup semantics rather than a listbox, because that is what
 * this is: a small set of mutually exclusive settings, all shown. Arrow keys
 * move between positions natively. Nothing styles focus (§6.3).
 *
 * The selected position is marked by fill AND by `aria-checked`, never by
 * colour alone.
 */
export function NetworkSelector({ className }: { className?: string }) {
  const network = useAppStore((s) => s.network)
  const setNetwork = useAppStore((s) => s.setNetwork)

  return (
    <div
      role="radiogroup"
      aria-label="Network"
      className={cn(
        'inline-flex shrink-0 rounded-md border border-input bg-background p-px',
        'shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.16)]',
        className,
      )}
    >
      {NETWORK_IDS.map((id) => {
        const active = id === network
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setNetwork(id)}
            className={cn(
              'rounded-sm px-2.5 py-1 font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.1em]',
              'transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.14)]'
                // An unselected position on a range selector is available, not
                // disabled: full-strength ink on the plate, so both positions
                // read as things you can set.
                : 'text-foreground hover:bg-accent',
            )}
          >
            {LABEL[id]}
          </button>
        )
      })}
    </div>
  )
}
