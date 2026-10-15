/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { QrScanner } from '../QrScanner'

/**
 * Review finding (stories 9–11): the camera branch of the scanner never ran in
 * any test, because jsdom has no BarcodeDetector. It promises a prefix filter, one
 * hand-off, and a camera that stops when scanning stops or the screen goes away.
 */
const cam = vi.hoisted(() => ({
  frames: [] as string[][],
  stopped: 0,
  getUserMedia: vi.fn(),
}))

class FakeDetector {
  constructor(_options: { formats: string[] }) {}
  async detect() {
    return (cam.frames.shift() ?? []).map((rawValue) => ({ rawValue }))
  }
}

function track() {
  return { stop: () => void (cam.stopped += 1) }
}

beforeEach(() => {
  cam.frames = []
  cam.stopped = 0
  cam.getUserMedia.mockReset().mockImplementation(async () => ({ getTracks: () => [track(), track()] }))
  ;(globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = FakeDetector
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: cam.getUserMedia }, configurable: true })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
})

const startScan = async () => act(async () => void fireEvent.click(screen.getByRole('button', { name: /^Scan .* with the camera$/ })))

describe('QrScanner camera path', () => {
  it('hands up a code with the xrplbench: prefix once, and stops the camera', async () => {
    cam.frames = [['xrplbench:u1:payload']]
    const onPayload = vi.fn()
    render(<QrScanner onPayload={onPayload} label="the code" />)
    await startScan()
    await waitFor(() => expect(onPayload).toHaveBeenCalledWith('xrplbench:u1:payload'))
    expect(onPayload).toHaveBeenCalledTimes(1)
    expect(cam.stopped).toBeGreaterThanOrEqual(2) // both tracks (stop is idempotent, so a second call is harmless)
    expect(screen.getByRole('button', { name: /^Scan .* with the camera$/ })).toBeTruthy()
  })

  it('ignores a code without the prefix and keeps scanning', async () => {
    cam.frames = [['https://example.com'], ['xrplbench:u1:later']]
    const onPayload = vi.fn()
    render(<QrScanner onPayload={onPayload} label="the code" />)
    await startScan()
    await waitFor(() => expect(onPayload).toHaveBeenCalledWith('xrplbench:u1:later'), { timeout: 2000 })
    expect(onPayload).toHaveBeenCalledTimes(1)
  })

  it('stops the camera when the screen unmounts mid-scan, handing up nothing', async () => {
    const onPayload = vi.fn()
    const view = render(<QrScanner onPayload={onPayload} label="the code" />)
    await startScan()
    await waitFor(() => expect(cam.getUserMedia).toHaveBeenCalled())
    view.unmount()
    await waitFor(() => expect(cam.stopped).toBe(2))
    expect(onPayload).not.toHaveBeenCalled()
  })

  it('says to paste instead when the camera cannot be opened', async () => {
    cam.getUserMedia.mockRejectedValue(new Error('denied'))
    render(<QrScanner onPayload={vi.fn()} label="the code" />)
    await startScan()
    expect(await screen.findByText('The camera could not be opened. Paste the text instead.')).toBeTruthy()
  })

  it('a camera that opens after the scan was stopped is released at once', async () => {
    let open: (s: unknown) => void = () => {}
    cam.getUserMedia.mockImplementation(() => new Promise((resolve) => (open = resolve)))
    render(<QrScanner onPayload={vi.fn()} label="the code" />)
    await startScan()
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Stop the camera' })))
    await act(async () => open({ getTracks: () => [track()] }))
    expect(cam.stopped).toBe(1)
  })
})
