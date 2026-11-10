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
  it('names its heading and the Network, with the Mainnet stamp, the scan count and the alt text', async () => {
    render(<HandoffPlate heading="Data to sign needed" network="mainnet" text={TEXT} scan={1} />)
    expect(screen.getByRole('heading', { name: 'Data to sign needed' })).toBeTruthy()
    // The plate is named by its heading (aria-labelledby), not by a copy of it.
    const region = screen.getByRole('region', { name: 'Data to sign needed' })
    expect(region.getAttribute('aria-label')).toBeNull()
    expect(screen.getByText('Scan 1 of 3')).toBeTruthy()
    expect(await screen.findByAltText('QR code: data to sign needed for Mainnet')).toBeTruthy()
    expect(screen.getByText('Mainnet')).toBeTruthy()
    expect(screen.getByText('Real funds')).toBeTruthy()
  })

  it('"Make the code larger" shows the code filling the screen; "Back" returns', async () => {
    render(<HandoffPlate heading="Data to sign needed" network="testnet" text={TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: MAKE_THE_CODE_LARGER }))
    const dialog = await screen.findByRole('dialog')
    // Sized by CSS to the viewport, not by a size read at render.
    const img = await waitFor(() => {
      const found = dialog.querySelector('img')
      if (!found) throw new Error('no image yet')
      return found
    })
    expect(img.style.width).toContain('100vw')
    expect(img.style.width).toContain('100dvh')
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

  it('releases a wake lock that arrives after the plate is gone', async () => {
    const release = vi.fn(async () => {})
    let resolve: (s: unknown) => void = () => {}
    const request = vi.fn(() => new Promise((r) => (resolve = r)))
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    const { unmount } = render(<HandoffPlate heading="x" network="testnet" text={TEXT} />)
    unmount()
    await act(async () => resolve({ release, released: false }))
    expect(release).toHaveBeenCalled()
  })

  it('takes it again when the page comes back after the browser let it go; one request at a time', async () => {
    const sentinels: Array<{ released: boolean; release: () => Promise<void> }> = []
    const request = vi.fn(async () => {
      const s = { released: false, release: vi.fn(async () => {}) }
      sentinels.push(s)
      return s
    })
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    render(<HandoffPlate heading="x" network="testnet" text={TEXT} />)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    // Visible again while still held: no second request.
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(request).toHaveBeenCalledTimes(1)
    // The browser let it go (page hidden), then the page is visible again.
    sentinels[0].released = true
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('changes nothing where the browser has no wake lock', () => {
    expect(() => render(<HandoffPlate heading="x" network="testnet" text={TEXT} />)).not.toThrow()
  })
})
