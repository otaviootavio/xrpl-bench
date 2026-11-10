/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A failed read through the real `answerRequest` (story 6 review): the client
 * the pool hands out fails every request, so the account read fails and the
 * screen shows P-28 with no Data to Sign. Only the ledger client is replaced.
 */
vi.mock('@/hooks/usePrompts', () => ({ usePrompts: () => ({ pin: async () => null }) }))

import { TransmitScreen } from '../TransmitScreen'
import { TooltipProvider } from '@/components/ui/tooltip'
import { requestText } from '@/lib/offline-round'
import type { TransmitterMeta } from '@/lib/crypto/keystore'
import * as R from '@/lib/offline-round-words'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '@/lib/xrpl/client'

const master = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const unsynced: TransmitterMeta = { id: 't', seedId: 't', lockId: 'L', label: 'Carrier', createdAt: 1, network: 'testnet', openCheck: 'pin', kind: 'transmitter', address: null }
const REQUEST = requestText('testnet', { type: 'payment', account: master, destination: DEST, amountDrops: '1000000' }, 'a'.repeat(32))
let requests = 0

beforeEach(() => {
  requests = 0
  setXrplClientFactory(
    () =>
      ({
        isConnected: () => true,
        connect: async () => {},
        request: async () => {
          requests += 1
          throw new Error('the node is down')
        },
        autofill: async () => {
          throw new Error('the node is down')
        },
      }) as never,
  )
})
afterEach(() => {
  cleanup()
  resetXrplClientFactory()
  resetXrplClients()
})

describe('Transmit, real answerRequest, failed read (OS-FR-15, FR-59)', () => {
  it('shows P-28 and no Data to Sign; "Read again" reads the ledger again', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TooltipProvider>
          <TransmitScreen wallet={unsynced} />
        </TooltipProvider>
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText(/Or paste the text of a code/), { target: { value: REQUEST } })
    fireEvent.click(screen.getByRole('button', { name: 'Use the pasted text' }))
    expect(await screen.findByText(R.ANSWER_READ_FAILED)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: R.DATA_TO_SIGN_TITLE })).toBeNull()
    expect(requests).toBeGreaterThan(0)
    const before = requests
    fireEvent.click(screen.getByRole('button', { name: R.READ_AGAIN }))
    await waitFor(() => expect(requests).toBeGreaterThan(before))
    expect(await screen.findByText(R.ANSWER_READ_FAILED)).toBeTruthy()
  })
})
