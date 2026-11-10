/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HandoffPlate } from '../HandoffPlate'
import { encodeSigned } from '@/lib/qr-codec'
import { BACK, MAKE_THE_CODE_LARGER } from '@/lib/offline-round-words'

/** The QR hand-off plate (story 6; EXPERIENCE "QR hand-off plate", "Round timing", P-59). */
const TEXT = encodeSigned({ network: 'mainnet', txBlob: 'ABCD' }).text

afterEach(() => {
  cleanup()
  delete (navigator as { wakeLock?: unknown }).wakeLock
})

describe('HandoffPlate', () => {
  it('names its heading and the Network, with the Mainnet stamp', () => {
    render(<HandoffPlate heading="Data to sign needed" network="mainnet" text={TEXT} />)
    expect(screen.getByRole('heading', { name: 'Data to sign needed' })).toBeTruthy()
    expect(screen.getByText('Mainnet')).toBeTruthy()
    expect(screen.getByText('Real funds')).toBeTruthy()
  })

  it('"Make the code larger" shows the code filling the screen; "Back" returns', async () => {
    render(<HandoffPlate heading="Data to sign needed" network="testnet" text={TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: MAKE_THE_CODE_LARGER }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: BACK }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('holds a screen wake lock while it is up, and releases it when it goes', async () => {
    const release = vi.fn(async () => {})
    const request = vi.fn(async () => ({ release }))
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    const { unmount } = render(<HandoffPlate heading="x" network="testnet" text={TEXT} />)
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))
    await act(async () => unmount())
    expect(release).toHaveBeenCalled()
  })

  it('changes nothing where the browser has no wake lock', () => {
    expect(() => render(<HandoffPlate heading="x" network="testnet" text={TEXT} />)).not.toThrow()
  })
})
