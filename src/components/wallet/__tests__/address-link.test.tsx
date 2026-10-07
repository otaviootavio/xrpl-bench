/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AddressLink } from '../AddressLink'
import { accountExplorerUrl, type NetworkId } from '@/lib/xrpl/networks'

/**
 * AD-10: every explorer link is built here, and it always points at the
 * ACTIVE network's explorer. The `iconOnly` mode exists for the serial plate,
 * which previously hand-rolled its own anchor; nothing rendered it, so a
 * hardcoded mainnet URL or a missing accessible name would have left all four
 * gates green. These assertions are what make that visible.
 *
 * The store is mocked because it persists through `idb-keyval`, which has no
 * jsdom implementation, and the network is the only field this component reads.
 */
let network: NetworkId = 'mainnet'
vi.mock('@/store/app-store', () => ({
  useAppStore: (selector: (s: { network: NetworkId }) => unknown) => selector({ network }),
}))

afterEach(cleanup)

const ADDRESS = 'r4NagxniGTmPRr8yBRXRD6NNpZP7FfP4KR'

describe('AddressLink — icon-only explorer affordance', () => {
  it('follows the active network on Mainnet and on Testnet', () => {
    for (const id of ['mainnet', 'testnet'] as const) {
      network = id
      render(<AddressLink address={ADDRESS} iconOnly label="View account on block explorer" />)
      const link = screen.getByRole('link', { name: 'View account on block explorer' })
      expect(link.getAttribute('href')).toBe(accountExplorerUrl(id, ADDRESS))
      // Not merely "a URL": it must differ per network, which is the whole
      // failure mode a hardcoded href would reintroduce.
      expect(link.getAttribute('href')).toContain(id === 'mainnet' ? 'livenet' : 'testnet')
      cleanup()
    }
  })

  it('has an accessible name and opens safely, with the icon hidden from it', () => {
    network = 'mainnet'
    const { container } = render(
      <AddressLink address={ADDRESS} iconOnly label="View account on block explorer" />,
    )
    const link = screen.getByRole('link', { name: 'View account on block explorer' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noreferrer noopener')
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders nothing rather than a stray dash when there is no address', () => {
    const { container } = render(<AddressLink address="" iconOnly label="View account on block explorer" />)
    expect(container.textContent).toBe('')
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('AddressLink — the ordinary link is unchanged', () => {
  it('shows the full address in full mode and links to the active network', () => {
    network = 'testnet'
    render(<AddressLink address={ADDRESS} truncate={false} />)
    const link = screen.getByRole('link', { name: new RegExp(ADDRESS) })
    expect(link.getAttribute('href')).toBe(accountExplorerUrl('testnet', ADDRESS))
  })

  it('still renders the placeholder for an empty address outside icon-only mode', () => {
    render(<AddressLink address="" />)
    expect(screen.getByText('—')).toBeTruthy()
  })
})
