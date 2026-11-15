import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { requestFaucetFunds } from '@/lib/xrpl/faucet'
import { NETWORKS, type NetworkId } from '@/lib/xrpl/networks'
import { invalidateAccountScoped } from '@/lib/xrpl/query-keys'
import { toast } from '@/lib/notify'

/**
 * The Testnet / Devnet faucet key for one address: an Online Wallet's own address
 * on Balances, and a Transmitter's Synced address on its Account (issue #71), so
 * the address an Offline Wallet holds can be funded from the online device.
 * Renders nothing on a Network with no faucet. The words are Balances' shipped words.
 */
export function FaucetButton({
  network,
  address,
  variant,
}: {
  network: NetworkId
  address: string
  variant?: 'outline'
}) {
  const queryClient = useQueryClient()
  const [funding, setFunding] = useState(false)
  if (!NETWORKS[network].faucetUrl) return null

  async function handleFaucet() {
    setFunding(true)
    try {
      const result = await requestFaucetFunds(network, address)
      toast.success(`Funded with ${result.amountXrp} test XRP on ${NETWORKS[network].label}.`)
      await invalidateAccountScoped(queryClient, network, address)
    } catch (err: unknown) {
      toast.error((err as { message?: string } | null)?.message ?? 'Faucet request failed.')
    } finally {
      setFunding(false)
    }
  }

  return (
    <Button size="sm" variant={variant} onClick={handleFaucet} disabled={funding}>
      {funding ? 'Requesting…' : `Fund with ${NETWORKS[network].label} XRP`}
    </Button>
  )
}

