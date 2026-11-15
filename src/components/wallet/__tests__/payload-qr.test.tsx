/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ toDataURL: vi.fn() }))
vi.mock('qrcode', async (importOriginal) => {
  const actual = await importOriginal<{ default: object }>()
  // Planning (QRCode.create) is real; only drawing is recorded.
  return { default: { ...actual.default, toDataURL: (...a: unknown[]) => h.toDataURL(...a) } }
})

import { PayloadQr } from '../PayloadQr'
import { encodeSigned } from '@/lib/qr-codec'
import { FRAME_INTERVAL_MS } from '@/lib/qr-frames'

/**
 * OS-FR-24, P-64: a payload that fits is one still code; one that does not is an
 * animated QR at not more than three frames each second, with Pause/Continue and
 * Next frame keys and the caption, starting paused under reduced motion.
 */

const small = encodeSigned({ network: 'testnet', txBlob: 'AB'.repeat(100) }).text
const big = encodeSigned({ network: 'testnet', txBlob: 'AB'.repeat(3000) }).text
const CAPTION = 'This code has more than one frame. Keep the camera on the code until the other device reads all of it.'

let reduce = false
let mqListeners: ((e: { matches: boolean }) => void)[] = []
beforeEach(() => {
  vi.useFakeTimers()
  reduce = false
  mqListeners = []
  h.toDataURL.mockReset().mockImplementation(async (text: string) => `data:image/png;base64,${encodeURIComponent(text.slice(0, 40))}`)
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes('reduce') && reduce,
      media: q,
      addEventListener: (_: string, l: (e: { matches: boolean }) => void) => void mqListeners.push(l),
      removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => void (mqListeners = mqListeners.filter((x) => x !== l)),
    }),
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const frameShown = () => Number(screen.getByAltText('QR code carrying a signing payload').getAttribute('data-frame'))
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)))

describe('PayloadQr', () => {
  it('draws a payload that fits as one still code, in upper case, with no keys', async () => {
    render(<PayloadQr text={small} />)
    await settle()
    expect(h.toDataURL).toHaveBeenCalledTimes(1)
    expect(h.toDataURL.mock.calls[0][0]).toBe(small.toUpperCase())
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
    expect(screen.queryByText(CAPTION)).toBeNull()
  })

  it('animates a payload that does not fit: frames at the pinned version, not faster than the interval', async () => {
    render(<PayloadQr text={big} />)
    await settle()
    expect(frameShown()).toBe(1)
    const [text, opts] = h.toDataURL.mock.calls[0]
    expect(text).toMatch(/^UR:XRPLBENCH-SIGNED\/1-\d+\//)
    expect(opts).toMatchObject({ errorCorrectionLevel: 'M', version: expect.any(Number) })
    await act(async () => void (await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS - 1)))
    expect(frameShown()).toBe(1)
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)))
    expect(frameShown()).toBe(2)
    // Ten seconds: at most three frames each second.
    await act(async () => void (await vi.advanceTimersByTimeAsync(10_000)))
    expect(frameShown()).toBeLessThanOrEqual(2 + 30)
    expect(new Set(h.toDataURL.mock.calls.map((c) => c[1].version)).size).toBe(1)
    expect(screen.getByText(CAPTION)).toBeTruthy()
  })

  it('Pause stops the frames, Continue starts them, Next frame steps while paused', async () => {
    render(<PayloadQr text={big} />)
    await settle()
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Pause' })))
    const at = frameShown()
    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)))
    expect(frameShown()).toBe(at)
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Next frame' })))
    await settle()
    expect(frameShown()).toBe(at + 1)
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Continue' })))
    await act(async () => void (await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS)))
    expect(frameShown()).toBe(at + 2)
  })

  it('starts paused under reduced motion; Next frame reaches every frame', async () => {
    reduce = true
    render(<PayloadQr text={big} />)
    await settle()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)))
    expect(frameShown()).toBe(1)
    for (let i = 2; i <= 4; i++) {
      await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Next frame' })))
      await settle()
      expect(frameShown()).toBe(i)
    }
  })

  it('a new payload replaces the animation from its own first frame', async () => {
    const view = render(<PayloadQr text={big} />)
    await settle()
    await act(async () => void (await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3)))
    const other = encodeSigned({ network: 'testnet', txBlob: 'CD'.repeat(3000) }).text
    view.rerender(<PayloadQr text={other} />)
    await settle()
    expect(frameShown()).toBe(1)
    expect(h.toDataURL.mock.calls.at(-1)?.[0]).toBe(h.toDataURL.mock.calls.at(-1)?.[0].toUpperCase())
  })

  it('pauses when reduced motion is switched on while it runs', async () => {
    render(<PayloadQr text={big} />)
    await settle()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
    await act(async () => mqListeners.forEach((l) => l({ matches: true })))
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    const at = frameShown()
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)))
    expect(frameShown()).toBe(at)
  })
})
