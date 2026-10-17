/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { detectPrfSupport } from '../webauthn'

const w = window as unknown as { PublicKeyCredential?: unknown }
afterEach(() => {
  delete w.PublicKeyCredential
})

describe('detectPrfSupport', () => {
  it('no WebAuthn: no', async () => {
    delete w.PublicKeyCredential
    expect(await detectPrfSupport()).toBe('no')
  })
  it('no getClientCapabilities: unknown', async () => {
    w.PublicKeyCredential = function () {}
    expect(await detectPrfSupport()).toBe('unknown')
  })
  it('extension:prf true: yes', async () => {
    w.PublicKeyCredential = { getClientCapabilities: async () => ({ 'extension:prf': true }) }
    expect(await detectPrfSupport()).toBe('yes')
  })
  it('extension:prf false: no', async () => {
    w.PublicKeyCredential = { getClientCapabilities: async () => ({ 'extension:prf': false }) }
    expect(await detectPrfSupport()).toBe('no')
  })
  it('capability missing from the answer: unknown', async () => {
    w.PublicKeyCredential = { getClientCapabilities: async () => ({}) }
    expect(await detectPrfSupport()).toBe('unknown')
  })
  it('getClientCapabilities rejects: unknown', async () => {
    w.PublicKeyCredential = { getClientCapabilities: async () => { throw new Error('nope') } }
    expect(await detectPrfSupport()).toBe('unknown')
  })
})
