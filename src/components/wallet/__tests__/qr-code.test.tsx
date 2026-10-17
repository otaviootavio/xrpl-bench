/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ toDataURL: vi.fn(), reject: false }))
vi.mock('qrcode', () => ({
  default: {
    // A plain function for the rejection: a vi.fn's own bookkeeping would see it as unhandled.
    toDataURL: (...a: unknown[]) => (h.reject ? Promise.reject(new Error('too big')) : h.toDataURL(...a)),
  },
}))

import { QrCode } from '../QrCode'

beforeEach(() => {
  h.toDataURL.mockReset()
  h.reject = false
})
afterEach(cleanup)

describe('QrCode', () => {
  it('draws the text over the address, at error correction M', async () => {
    h.toDataURL.mockResolvedValue('data:image/png;base64,AAA')
    await act(async () => void render(<QrCode address="rA" text="xrplbench:1:u:Z" size={300} />))
    expect(h.toDataURL).toHaveBeenCalledWith('xrplbench:1:u:Z', expect.objectContaining({ errorCorrectionLevel: 'M', width: 300 }))
    expect(screen.getByAltText('QR code carrying a signing payload')).toBeTruthy()
  })

  it('draws a ripple: URI for an address with a destination tag', async () => {
    h.toDataURL.mockResolvedValue('data:image/png;base64,AAA')
    await act(async () => void render(<QrCode address="rA" destinationTag={42} />))
    expect(h.toDataURL.mock.calls[0][0]).toBe('ripple:rA?dt=42')
    expect(screen.getByAltText('QR code for address rA')).toBeTruthy()
  })

  it('says so when the code cannot be drawn', async () => {
    h.reject = true
    await act(async () => void render(<QrCode text="x" />))
    expect(screen.getByText('The QR code could not be drawn.')).toBeTruthy()
  })

  it('never shows the previous image under a new payload', async () => {
    h.toDataURL.mockResolvedValueOnce('data:image/png;base64,OLD')
    let finish: (v: string) => void = () => {}
    h.toDataURL.mockReturnValueOnce(new Promise<string>((r) => (finish = r)))
    const view = render(<QrCode text="first" />)
    await act(async () => {})
    expect(screen.getByRole('img').getAttribute('src')).toContain('OLD')
    view.rerender(<QrCode text="second" />)
    await act(async () => {})
    expect(screen.queryByRole('img')).toBeNull()
    await act(async () => finish('data:image/png;base64,NEW'))
    expect(screen.getByRole('img').getAttribute('src')).toContain('NEW')
  })
})
