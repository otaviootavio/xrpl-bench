import { useId } from 'react'
import { NETWORK_IDS, NETWORKS, type NetworkId } from '@/lib/xrpl/networks'
import { Radio } from '@/components/ui/radio'
import { DEVNET_NOTICE } from '@/components/wallet/DevnetNotice'

/**
 * Which network a new Wallet lives on (FR-61). A Wallet's network is fixed at
 * creation, so the choice is shown with its consequence in words: Mainnet is
 * real funds, Devnet can be reset. Native radios, so arrow keys and the
 * accessible name come from the platform; nothing styles focus.
 */
export function NetworkChoice({
  value,
  onChange,
  disabledNetworks = [],
  disabled = false,
}: {
  value: NetworkId
  onChange: (network: NetworkId) => void
  /** Networks not offered (the Seed already has a view there). */
  disabledNetworks?: NetworkId[]
  /** The whole choice is frozen (a check or a write is running). */
  disabled?: boolean
}) {
  const name = useId()
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="panel-legend mb-1">Network</legend>
      {NETWORK_IDS.map((id) => (
        <label key={id} className="flex items-start gap-2 text-sm pointer-coarse:min-h-11 pointer-coarse:items-center">
          <Radio
            name={name}
            value={id}
            checked={value === id}
            disabled={disabled || disabledNetworks.includes(id)}
            onChange={() => onChange(id)}
          />
          <span>
            {NETWORKS[id].label}
            {id === 'mainnet' && <span className="text-muted-foreground"> — real funds</span>}
            {id === 'testnet' && <span className="text-muted-foreground"> — test XRP, free from a faucet</span>}
          </span>
        </label>
      ))}
      {value === 'devnet' && <p className="text-xs text-muted-foreground">{DEVNET_NOTICE}</p>}
    </fieldset>
  )
}
