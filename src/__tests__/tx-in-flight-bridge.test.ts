/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Wallet } from 'xrpl'

/**
 * FR-48 / AD-9: an app update must never activate mid-transaction. After the
 * AD-1 inversion the ONLY thing joining `lib/xrpl/writes.ts` to the store is
 * the reporter `src/App.tsx` installs at module scope. Every other suite
 * either installs its own reporter or mocks the store, so without this test
 * that single line could be deleted and the whole suite would stay green
 * while the update gate silently stopped working.
 *
 * So this imports `@/App` itself — for the module-scope side effect only,
 * nothing is rendered — and drives a real submit through the client seam,
 * asserting the REAL app store's `txInFlight`.
 *
 * The three page modules are stubbed because they transitively import
 * `virtual:pwa-register`, which this runner cannot resolve (see
 * hooks/__tests__/useAppUpdate.test.tsx). `@/store/app-store` is deliberately
 * NOT mocked — it is half of what is under test.
 */
// `app-store` persists its non-secret slice through `idb-keyval`, which has no
// jsdom implementation. Only the persistence sink is faked — the store itself
// is real, and `txInFlight` is session-only and never persisted anyway.
vi.mock('idb-keyval', () => {
  const mem = new Map<string, string>()
  return {
    get: async (k: string) => mem.get(k),
    set: async (k: string, v: string) => void mem.set(k, v),
    del: async (k: string) => void mem.delete(k),
  }
})

vi.mock('@/pages/Onboarding', () => ({ Onboarding: () => null }))
vi.mock('@/pages/Unlock', () => ({ Unlock: () => null }))
vi.mock('@/pages/Main', () => ({ Main: () => null }))

// A stand-in signer rather than a real `Wallet`: under jsdom, `@noble`'s
// Uint8Array realm check rejects a key derived there, and nothing in this
// test is about key derivation — `submitAndClassify` only reads `.address`
// and calls `.sign()`.
const wallet = {
  address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
  sign: () => ({ tx_blob: '00', hash: 'ABCD' }),
} as unknown as Wallet
const DESTINATION = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

async function loadApp() {
  await import('@/App')
  const [{ useAppStore }, client, writes] = await Promise.all([
    import('@/store/app-store'),
    import('@/lib/xrpl/client'),
    import('@/lib/xrpl/writes'),
  ])
  return { useAppStore, ...client, ...writes }
}

describe('App installs the in-flight reporter the update gate depends on', () => {
  beforeEach(async () => {
    const { resetXrplClients } = await loadApp()
    resetXrplClients()
  })

  afterEach(async () => {
    const { resetXrplClients, resetXrplClientFactory } = await import('@/lib/xrpl/client')
    resetXrplClients()
    resetXrplClientFactory()
  })

  it('flips the real store flag true for the whole submit and false after it', async () => {
    const { useAppStore, setXrplClientFactory, submitXrpPayment } = await loadApp()

    const seenDuringSubmit: boolean[] = []
    setXrplClientFactory(
      () =>
        ({
          isConnected: () => true,
          connect: async () => {},
          autofill: async (tx: any) => {
            seenDuringSubmit.push(useAppStore.getState().txInFlight)
            return { ...tx, Fee: '12', Sequence: 1, LastLedgerSequence: 100 }
          },
          submitAndWait: async () => {
            seenDuringSubmit.push(useAppStore.getState().txInFlight)
            return { result: { meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 9 } }
          },
        }) as any,
    )

    expect(useAppStore.getState().txInFlight).toBe(false)

    await submitXrpPayment('testnet', wallet, { destination: DESTINATION, amountDrops: '1000000' })

    expect(seenDuringSubmit).toEqual([true, true])
    expect(useAppStore.getState().txInFlight).toBe(false)
  })

  it('clears the real store flag when the submit throws', async () => {
    const { useAppStore, setXrplClientFactory, submitXrpPayment } = await loadApp()

    const seenDuringSubmit: boolean[] = []
    setXrplClientFactory(
      () =>
        ({
          isConnected: () => true,
          connect: async () => {},
          autofill: async (tx: any) => ({ ...tx, Fee: '12', Sequence: 1, LastLedgerSequence: 100 }),
          submitAndWait: async () => {
            seenDuringSubmit.push(useAppStore.getState().txInFlight)
            throw new Error('socket closed')
          },
        }) as any,
    )

    await expect(submitXrpPayment('testnet', wallet, { destination: DESTINATION, amountDrops: '1000000' })).rejects.toThrow(
      'socket closed',
    )

    expect(seenDuringSubmit).toEqual([true])
    expect(useAppStore.getState().txInFlight).toBe(false)
  })
})
