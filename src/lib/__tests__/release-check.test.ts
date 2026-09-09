import { describe, expect, it, vi, afterEach } from 'vitest'
import { checkForRelease } from '../release-check'

describe('checkForRelease', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns ok:true with the parsed manifest on a valid response', async () => {
    const manifest = {
      version: '1.2.0',
      commit: 'a'.repeat(40),
      releasedAt: '2026-09-02T00:00:00.000Z',
      bump: 'minor',
      security: false,
      notes: 'https://example.com/commit/a',
      verify: 'https://example.com#security',
      assets: {},
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 })),
    )
    const result = await checkForRelease()
    expect(result).toEqual({ ok: true, manifest })
  })

  it('returns ok:false on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    )
    expect(await checkForRelease()).toEqual({ ok: false })
  })

  it('returns ok:false when fetch throws (offline)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network error')
      }),
    )
    expect(await checkForRelease()).toEqual({ ok: false })
  })

  it('returns ok:false for a malformed manifest, never throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ version: '1.0.0' }), { status: 200 })),
    )
    expect(await checkForRelease()).toEqual({ ok: false })
  })
})
