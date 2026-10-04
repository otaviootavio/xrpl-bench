import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Wallet, type AccountSet } from 'xrpl'
import { getXrplClient, resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import {
  resetTxInFlightReporter,
  setTxInFlightReporter,
  submitAndClassify,
  submitIssuedPayment,
  submitTrustSet,
  submitXrpPayment,
} from '../writes'

/**
 * AD-9/FR-48: every write passes `submitAndClassify`, which raises the
 * in-flight flag BEFORE the first network call and clears it in a `finally`
 * — an app update must never activate mid-transaction. Before the AD-1
 * inversion this could not be tested without standing up React state; the
 * reporter seam is what makes these assertions possible, so they also prove
 * the inversion did not weaken the choke point.
 */

// A shared ordered log: the reporter and the fake client both push into it,
// so the assertions are about ORDER, not merely about the calls happening.
let log: string[] = []

interface FakeClient {
  autofilled: any[]
  autofillOptions: any[]
  request: () => Promise<any>
}

function installFakeClient(behaviour: { submit?: () => Promise<any>; validatedLedgerIndex?: number } = {}) {
  const client = {
    autofilled: [] as any[],
    autofillOptions: [] as any[],
    isConnected: () => true,
    connect: async () => {
      log.push('connect')
    },
    autofill: async (tx: any, options?: any) => {
      log.push('autofill')
      client.autofilled.push(tx)
      client.autofillOptions.push(options)
      return { ...tx, Fee: '12', Sequence: 1, LastLedgerSequence: 100 }
    },
    submitAndWait: async () => {
      log.push('submitAndWait')
      if (behaviour.submit) return behaviour.submit()
      return { result: { meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 42 } }
    },
    request: async () => {
      log.push('request')
      return { result: { ledger_index: behaviour.validatedLedgerIndex ?? 50 } }
    },
  }
  setXrplClientFactory(() => client as any)
  return client as unknown as FakeClient & { autofilled: any[]; autofillOptions: any[] }
}

const wallet = Wallet.fromSeed('sEdTM1uX8pu2do5XvTnutH6HsouMaM2')

beforeEach(() => {
  log = []
  resetXrplClients()
  setTxInFlightReporter((inFlight) => log.push(`in-flight:${inFlight}`))
})

afterEach(() => {
  resetTxInFlightReporter()
  resetXrplClients()
  resetXrplClientFactory()
})

describe('the write choke point raises and clears the in-flight flag', () => {
  it('reports true before the first network call and false last, on a validated payment', async () => {
    installFakeClient()

    const outcome = await submitXrpPayment('testnet', wallet, {
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      amountDrops: '1000000',
    })

    expect(outcome.status).toBe('validated')
    expect(log[0]).toBe('in-flight:true')
    expect(log.indexOf('in-flight:true')).toBeLessThan(log.indexOf('connect'))
    expect(log.indexOf('in-flight:true')).toBeLessThan(log.indexOf('autofill'))
    expect(log.at(-1)).toBe('in-flight:false')
  })

  it('still clears the flag when the submit throws', async () => {
    installFakeClient({
      submit: async () => {
        throw new Error('socket closed')
      },
    })

    await expect(
      submitXrpPayment('testnet', wallet, { destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', amountDrops: '1000000' }),
    ).rejects.toThrow('socket closed')

    expect(log[0]).toBe('in-flight:true')
    expect(log.at(-1)).toBe('in-flight:false')
    expect(log.filter((e) => e === 'in-flight:false')).toHaveLength(1)
  })

  it('still clears the flag when the connection itself fails, before anything is signed', async () => {
    setXrplClientFactory(() => {
      log.push('construct')
      return {
        isConnected: () => false,
        connect: async () => {
          throw new Error('ECONNREFUSED')
        },
      } as any
    })

    await expect(
      submitXrpPayment('testnet', wallet, { destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', amountDrops: '1000000' }),
    ).rejects.toThrow(/Could not reach/)

    expect(log[0]).toBe('in-flight:true')
    expect(log.at(-1)).toBe('in-flight:false')
  })

  it('routes trust-line writes through the same choke point', async () => {
    installFakeClient()

    const outcome = await submitTrustSet('testnet', wallet, {
      currency: 'USD',
      issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      limit: '100',
    })

    expect(outcome.status).toBe('validated')
    expect(log[0]).toBe('in-flight:true')
    expect(log.at(-1)).toBe('in-flight:false')
  })

  it('classifies a tec result as claimed and still clears the flag', async () => {
    installFakeClient({
      submit: async () => ({ result: { meta: { TransactionResult: 'tecUNFUNDED_PAYMENT' }, ledger_index: 7 } }),
    })

    const outcome = await submitXrpPayment('testnet', wallet, {
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      amountDrops: '1000000',
    })

    expect(outcome.status).toBe('claimed')
    expect(log.at(-1)).toBe('in-flight:false')
  })

  it('routes the issued-currency payment through the same choke point, with an amount object', async () => {
    const client = installFakeClient()

    const outcome = await submitIssuedPayment('testnet', wallet, {
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      currency: 'USD',
      issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
      value: '25.5',
      destinationTag: 7,
    })

    expect(outcome.status).toBe('validated')
    expect(log[0]).toBe('in-flight:true')
    expect(log.at(-1)).toBe('in-flight:false')
    // The drops path sends a string Amount; this one must send the issued
    // object, untouched — no arithmetic, no Number().
    expect(client.autofilled[0].Amount).toEqual({ currency: 'USD', issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq', value: '25.5' })
    expect(client.autofilled[0].DestinationTag).toBe(7)
  })

  it('caps the fee autofill may attach, on every write', async () => {
    const client = installFakeClient()

    await submitXrpPayment('testnet', wallet, { destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', amountDrops: '1000000' })
    await submitTrustSet('testnet', wallet, { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', limit: '100' })

    // Without this, xrpl.js defaults to 2 XRP and a fee-escalation spike
    // quietly turns a small payment into an expensive one.
    expect(client.autofillOptions).toEqual([{ maxFeeXRP: '0.01' }, { maxFeeXRP: '0.01' }])
  })

  it('classifies a tef/tem/ter result as failed, with no ledgerIndex, and clears the flag', async () => {
    installFakeClient({
      submit: async () => ({ result: { meta: { TransactionResult: 'tefPAST_SEQ' }, ledger_index: 11 } }),
    })

    const outcome = await submitXrpPayment('testnet', wallet, {
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      amountDrops: '1000000',
    })

    expect(outcome.status).toBe('failed')
    // Never applied, so there is no ledger to point at — a 'failed' outcome
    // must not carry one.
    expect('ledgerIndex' in outcome).toBe(false)
    expect(log.at(-1)).toBe('in-flight:false')
  })

  it('classifies the expiry branch when the network moved past LastLedgerSequence', async () => {
    installFakeClient({
      submit: async () => {
        throw new Error('connection dropped while waiting')
      },
      // autofill stamps LastLedgerSequence 100; validated is past it.
      validatedLedgerIndex: 101,
    })

    const outcome = await submitXrpPayment('testnet', wallet, {
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      amountDrops: '1000000',
    })

    expect(outcome.status).toBe('expired')
    expect(outcome).not.toHaveProperty('resultCode')
    expect(log.at(-1)).toBe('in-flight:false')
  })

  it('does not call an expiry an expiry while the tx could still be included', async () => {
    installFakeClient({
      submit: async () => {
        throw new Error('connection dropped while waiting')
      },
      validatedLedgerIndex: 99,
    })

    await expect(
      submitXrpPayment('testnet', wallet, { destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', amountDrops: '1000000' }),
    ).rejects.toThrow('connection dropped while waiting')

    expect(log.at(-1)).toBe('in-flight:false')
  })

  it('defaults to a no-op reporter, so lib/xrpl needs no store to run', async () => {
    resetTxInFlightReporter()
    installFakeClient()

    const outcome = await submitXrpPayment('testnet', wallet, {
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      amountDrops: '1000000',
    })

    expect(outcome.status).toBe('validated')
    expect(log.some((e) => e.startsWith('in-flight'))).toBe(false)
  })
})

/**
 * PR #33 review: the socket drops while `submitAndWait` is polling, and a read
 * (a refetch interval, `refetchOnReconnect`) replaces the dropped client. The
 * write must keep its client open — xrpl.js's reconnect of it is what lets the
 * poll observe the outcome — and the client is closed only once the write ends.
 */
describe('a write keeps its client open across a drop and a concurrent replacement', () => {
  it('reports the validated outcome and closes the replaced client only after the write settles', async () => {
    const built: any[] = []
    setXrplClientFactory(() => {
      const client: any = {
        connected: true,
        disconnectCalls: 0,
        isConnected: () => client.connected,
        connect: async () => {},
        disconnect: async () => {
          client.disconnectCalls += 1
          client.connected = false
        },
        autofill: async (tx: any) => ({ ...tx, Fee: '12', Sequence: 1, LastLedgerSequence: 100 }),
        submitAndWait: async () => {
          // The drop, then a concurrent read that replaces the cached client.
          client.connected = false
          await getXrplClient('testnet')
          await new Promise((r) => setTimeout(r, 0))
          // A disconnect() here would have cancelled xrpl.js's reconnect.
          if (client.disconnectCalls > 0) throw new Error('NotConnectedError')
          client.connected = true // xrpl.js's own reconnect succeeded
          return { result: { meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 42 } }
        },
      }
      built.push(client)
      return client
    })

    const outcome = await submitXrpPayment('testnet', wallet, {
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      amountDrops: '1000000',
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(outcome.status).toBe('validated')
    expect(built).toHaveLength(2)
    expect(built[0].disconnectCalls).toBe(1)
    expect(built[1].disconnectCalls).toBe(0)
  })
})

/**
 * Story 7.1 (G-16): the choke point is exported and typed on
 * `SubmittableTransaction`, so a transaction type this module has no wrapper
 * for still passes through it — and therefore still raises the in-flight
 * signal the update interlock reads. Before, a new type could only bypass it.
 */
describe('any transaction type can reach the write choke point', () => {
  it('submits an AccountSet through the exported choke point and raises the in-flight signal for it', async () => {
    const client = installFakeClient()
    const tx: AccountSet = { TransactionType: 'AccountSet', Account: wallet.address }

    const outcome = await submitAndClassify('testnet', wallet, tx)

    expect(outcome.status).toBe('validated')
    expect(client.autofilled[0].TransactionType).toBe('AccountSet')
    expect(log[0]).toBe('in-flight:true')
    expect(log.indexOf('in-flight:true')).toBeLessThan(log.indexOf('autofill'))
    expect(log.at(-1)).toBe('in-flight:false')
  })
})

/**
 * Story 7.2 (G-17): the in-flight signal counts, it does not toggle. Two
 * writes can overlap — the flag is global precisely because Radix unmounts
 * inactive tabs, so a payment and a trust-line change can both be awaiting
 * validation — and a boolean cleared by whichever settles first would tell
 * `useAppUpdate` nothing is in flight while the other is still live.
 */
describe("two overlapping writes cannot clear each other's in-flight signal", () => {
  /** A fake client whose `submitAndWait` calls park until the test settles
   * them, so the test decides which write finishes first. */
  function installParkedClient(validatedLedgerIndex = 50) {
    const parked: { resolve: (v: any) => void; reject: (e: unknown) => void }[] = []
    const client = {
      isConnected: () => true,
      connect: async () => {},
      autofill: async (tx: any) => ({ ...tx, Fee: '12', Sequence: 1, LastLedgerSequence: 100 }),
      submitAndWait: () =>
        new Promise((resolve, reject) => {
          parked.push({ resolve, reject })
        }),
      request: async () => ({ result: { ledger_index: validatedLedgerIndex } }),
    }
    setXrplClientFactory(() => client as any)
    return parked
  }

  const validated = { result: { meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 42 } }

  async function untilParked(parked: unknown[], n: number) {
    for (let i = 0; i < 50 && parked.length < n; i++) await new Promise((r) => setTimeout(r, 0))
    expect(parked).toHaveLength(n)
  }

  function startBoth() {
    const payment = submitXrpPayment('testnet', wallet, {
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      amountDrops: '1000000',
    })
    const trustLine = submitTrustSet('testnet', wallet, {
      currency: 'USD',
      issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      limit: '100',
    })
    return { payment, trustLine }
  }

  const reports = () => log.filter((e) => e.startsWith('in-flight'))

  it('stays raised across the first settlement and clears only when the last write settles', async () => {
    const parked = installParkedClient()
    const { payment, trustLine } = startBoth()
    await untilParked(parked, 2)

    // Both writes are inside the choke point: raised exactly once.
    expect(reports()).toEqual(['in-flight:true'])

    parked[0].resolve(validated)
    expect((await payment).status).toBe('validated')
    // The trust-line change is still awaiting validation: the payment
    // settling must not have cleared the signal.
    expect(reports(), 'AD-9: the first of two overlapping writes to settle must not clear the in-flight signal').toEqual([
      'in-flight:true',
    ])

    parked[1].resolve(validated)
    expect((await trustLine).status).toBe('validated')
    expect(reports()).toEqual(['in-flight:true', 'in-flight:false'])
  })

  it('stays raised when the first of two overlapping writes throws, and clears when the second settles', async () => {
    // Validated index 99 < LastLedgerSequence 100: the throw is not an expiry.
    const parked = installParkedClient(99)
    const { payment, trustLine } = startBoth()
    await untilParked(parked, 2)

    parked[0].reject(new Error('socket closed'))
    await expect(payment).rejects.toThrow('socket closed')
    expect(reports()).toEqual(['in-flight:true'])

    parked[1].resolve(validated)
    await trustLine
    expect(reports()).toEqual(['in-flight:true', 'in-flight:false'])
  })

  it('stays raised when the first of two overlapping writes expires, and clears when the second settles', async () => {
    // Validated index 101 > LastLedgerSequence 100: the throw is an expiry.
    const parked = installParkedClient(101)
    const { payment, trustLine } = startBoth()
    await untilParked(parked, 2)

    parked[0].reject(new Error('connection dropped while waiting'))
    expect((await payment).status).toBe('expired')
    expect(reports()).toEqual(['in-flight:true'])

    parked[1].reject(new Error('connection dropped while waiting'))
    expect((await trustLine).status).toBe('expired')
    expect(reports()).toEqual(['in-flight:true', 'in-flight:false'])
  })

  it('does not strand the signal: after both throw, the next write is a fresh raise and clear', async () => {
    const parked = installParkedClient(99)
    const { payment, trustLine } = startBoth()
    await untilParked(parked, 2)

    parked[1].reject(new Error('socket closed'))
    parked[0].reject(new Error('socket closed'))
    await expect(payment).rejects.toThrow('socket closed')
    await expect(trustLine).rejects.toThrow('socket closed')
    expect(reports()).toEqual(['in-flight:true', 'in-flight:false'])

    // Depth is back at zero, so the next write is a new 0→1 transition.
    const third = submitXrpPayment('testnet', wallet, { destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', amountDrops: '1' })
    await untilParked(parked, 3)
    parked[2].resolve(validated)
    await third
    expect(reports()).toEqual(['in-flight:true', 'in-flight:false', 'in-flight:true', 'in-flight:false'])
  })

  it('does not strand the depth when the reporter itself throws on the raise', async () => {
    installFakeClient()
    let throwOnce = true
    setTxInFlightReporter((inFlight) => {
      if (inFlight && throwOnce) {
        throwOnce = false
        throw new Error('reporter failed')
      }
      log.push(`in-flight:${inFlight}`)
    })

    await expect(
      submitXrpPayment('testnet', wallet, { destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', amountDrops: '1' }),
    ).rejects.toThrow('reporter failed')

    // The failed raise was inside the `try`, so the `finally` lowered the
    // depth: the next write is a fresh 0→1 transition and raises the signal.
    log = []
    await submitXrpPayment('testnet', wallet, { destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', amountDrops: '1' })
    expect(reports()).toEqual(['in-flight:true', 'in-flight:false'])
  })
})

/**
 * The depth is lowered in a `finally` nested inside the one that releases the
 * held client, so a `release()` that throws cannot strand the signal raised —
 * which would refuse every update for the rest of the session. `release` only
 * calls the non-throwing `abandon` today, so the client module is replaced
 * here to make it throw.
 */
describe('a throwing client release cannot strand the in-flight depth', () => {
  afterEach(() => {
    vi.doUnmock('../client')
    vi.resetModules()
  })

  it('still lowers the depth and clears the signal when release() throws', async () => {
    vi.resetModules()
    const fake = {
      autofill: async (tx: any) => ({ ...tx, Fee: '12', Sequence: 1, LastLedgerSequence: 100 }),
      submitAndWait: async () => ({ result: { meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 42 } }),
    }
    vi.doMock('../client', () => ({
      getXrplClient: async () => fake,
      holdXrplClient: async () => ({
        client: fake,
        release: () => {
          throw new Error('release failed')
        },
      }),
    }))
    const writes = await import('../writes')
    const reported: boolean[] = []
    writes.setTxInFlightReporter((inFlight) => reported.push(inFlight))
    const params = { destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', amountDrops: '1' }

    // Only the depth is pinned here. What a validated write reports to its
    // caller when release() throws is deliberately left unspecified: today the
    // release error replaces the validated outcome, and a payment that
    // validated but shows as an error invites a second send, so no test may
    // fix that behaviour in place.
    await writes.submitXrpPayment('testnet', wallet, params).catch(() => {})
    expect(reported).toEqual([true, false])

    // And the depth is back at zero: the next write raises again.
    await writes.submitXrpPayment('testnet', wallet, params).catch(() => {})
    expect(reported).toEqual([true, false, true, false])
  })
})
