/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'

/**
 * AD-32: the entry module rewrites a bookmarked or reloaded in-wallet path to `/`
 * before the first render, so no in-wallet subtree can mount from it.
 */
describe('main — boot location', () => {
  it('has rewritten the location to / by the time the first render is requested', async () => {
    window.history.replaceState({ screen: true, depth: 1 }, '', '/wallets/x/checks')
    document.body.innerHTML = '<div id="root"></div>'
    let pathAtRender: string | null = null
    vi.resetModules()
    vi.doMock('react-dom/client', () => ({
      createRoot: () => ({
        render: () => {
          pathAtRender = window.location.pathname
        },
      }),
    }))
    vi.doMock('@/lib/sw-register', () => ({ registerServiceWorker: () => {} }))
    vi.doMock('../App.tsx', () => ({ default: () => null }))
    vi.doMock('../index.css', () => ({}))
    await import('../main.tsx')
    expect(pathAtRender).toBe('/')
    expect(window.history.state).toBeNull()
  })
})
