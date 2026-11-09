/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { QrScanner } from '../QrScanner'
import { decodeSigned, encodeSigned } from '@/lib/qr-codec'
import { planQr, type QrPlan } from '@/lib/qr-frames'
import { encodeMinimal } from '@/lib/ur/bytewords'
import { FountainEncoder, encodePartCbor } from '@/lib/ur/fountain'
import { decodeSinglePart } from '@/lib/ur/ur'

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

/**
 * OS-FR-24, P-65: an animated QR is read frame by frame, from any frame and with
 * frames missed; the progress line updates each frame, the status a screen reader
 * hears changes at each quarter only; the payload is handed up once, whole, and
 * only with a correct checksum.
 */
describe('QrScanner animated code', () => {
  const blob = 'AB'.repeat(3000)
  const whole = encodeSigned({ network: 'testnet', txBlob: blob }).text
  const plan = planQr(whole) as Extract<QrPlan, { kind: 'animated' }>
  const status = () => document.querySelector('[role="status"]')?.textContent ?? null

  it('reads frames from the camera, from frame 6 with every third missed, and hands up the whole payload once', async () => {
    const frames: string[][] = []
    for (let i = 5; frames.length < 200; i++) if (i % 3 !== 0) frames.push([plan.frameAt(i)])
    cam.frames = frames
    const onPayload = vi.fn()
    render(<QrScanner onPayload={onPayload} label="the code" />)
    await startScan()
    const heard = new Set<string>()
    await waitFor(
      () => {
        const t = status()
        if (t) heard.add(t)
        expect(onPayload).toHaveBeenCalledTimes(1)
      },
      { timeout: 20_000, interval: 50 },
    )
    expect(decodeSigned(onPayload.mock.calls[0][0])).toMatchObject({ ok: true, value: { tx_blob: blob } })
    expect(cam.stopped).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId('scan-progress').textContent).toBe('The app read the code.')
    expect(status()).toBe('The app read the code.')
    // Only quarter values were ever in the status region.
    for (const t of heard) expect(t).toMatch(/^The app read (0|25|50|75) percent of the code\.$|^The app read the code\.$/)
  }, 30_000)

  it('pasted frames add up across pastes; the status changes at quarters, the line at each frame', async () => {
    delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector
    const onPayload = vi.fn()
    render(<QrScanner onPayload={onPayload} label="the code" />)
    const box = screen.getByLabelText('Or paste the text of the code') as HTMLTextAreaElement
    const lines: string[] = []
    const heard: string[] = []
    for (let i = 0; i < plan.seqLen && onPayload.mock.calls.length === 0; i++) {
      fireEvent.change(box, { target: { value: plan.frameAt(i).toLowerCase() } })
      await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Use the pasted text' })))
      lines.push(screen.getByTestId('scan-progress').textContent ?? '')
      const t = status()
      if (t && heard.at(-1) !== t) heard.push(t)
    }
    expect(onPayload).toHaveBeenCalledTimes(1)
    expect(onPayload.mock.calls[0][0]).toBe(whole)
    expect(new Set(lines).size).toBe(lines.length) // a new line at each frame
    expect(heard).toEqual([
      'The app read 0 percent of the code.',
      'The app read 25 percent of the code.',
      'The app read 50 percent of the code.',
      'The app read 75 percent of the code.',
      'The app read the code.',
    ])
  })

  it('several frames pasted at once, out of order, complete in one paste', async () => {
    delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector
    const onPayload = vi.fn()
    render(<QrScanner onPayload={onPayload} label="the code" />)
    const all = Array.from({ length: plan.seqLen + 4 }, (_, i) => plan.frameAt(i)).reverse().join('\n')
    fireEvent.change(screen.getByLabelText('Or paste the text of the code'), { target: { value: all } })
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Use the pasted text' })))
    expect(onPayload).toHaveBeenCalledTimes(1)
    expect(onPayload.mock.calls[0][0]).toBe(whole)
  })

  it('hands up nothing when the joined frames fail their checksum, and says the code could not be read', async () => {
    delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector
    const enc = new FountainEncoder(decodeSinglePart(whole).cbor, 250)
    const frames = Array.from({ length: enc.seqLen }, (_, i) => {
      const p = enc.nextPart()
      if (i === 0) p.data[0] ^= 1
      return `ur:xrplbench-signed/${p.seqNum}-${p.seqLen}/${encodeMinimal(encodePartCbor(p))}`
    })
    const onPayload = vi.fn()
    render(<QrScanner onPayload={onPayload} label="the code" />)
    fireEvent.change(screen.getByLabelText('Or paste the text of the code'), { target: { value: frames.join(' ') } })
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Use the pasted text' })))
    expect(onPayload).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('That code could not be read.')
  })

  it('any other pasted text is still handed up whole for the screen to judge', async () => {
    delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector
    const onPayload = vi.fn()
    render(<QrScanner onPayload={onPayload} label="the code" />)
    fireEvent.change(screen.getByLabelText('Or paste the text of the code'), { target: { value: 'hello there' } })
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Use the pasted text' })))
    expect(onPayload).toHaveBeenCalledWith('hello there')
    expect(screen.queryByTestId('scan-progress')).toBeNull()
  })
})
