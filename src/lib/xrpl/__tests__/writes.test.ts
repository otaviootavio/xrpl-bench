import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Wallet } from 'xrpl'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import {
  resetTxInFlightReporter,
  setTxInFlightReporter,
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
