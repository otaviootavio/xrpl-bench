import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrustSetFlags, Wallet, XrplError, decode, type AccountSet } from 'xrpl'
import { MAX_FEE_DROPS } from '../money'
import { getXrplClient, resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import {
  resetTxInFlightReporter,
  setTxInFlightReporter,
  submitAndClassify,
  submitIssuedPayment,
  submitMasterKeyFlag,
  submitSetRegularKey,
  submitTrustSet,
  submitXrpPayment,
  FeeAboveCapError,
  TWO_DEVICE_LEDGER_WINDOW,
  prepareUnsigned,
  signPrepared,
  submitSignedBlob,
  validatedLedgerIndex,
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

function installFakeClient(
  behaviour: {
    submit?: () => Promise<any>
    validatedLedgerIndex?: number
    /** What autofill attaches as `Fee` when the transaction carries none.
     * `'absent'` attaches nothing, to test a missing field. */
    autofillFee?: string | 'absent'
  } = {},
) {
  const client = {
    autofilled: [] as any[],
    autofillOptions: [] as any[],
    isConnected: () => true,
    connect: async () => {
      log.push('connect')
    },
    autofill: async (tx: any, options?: any) => {
      log.push('autofill')
      // A shallow copy, so the record is what reached autofill, not what
      // it returned.
      client.autofilled.push({ ...tx })
      client.autofillOptions.push(options)
      // Like xrpl.js: a preset `Fee` is left alone; otherwise one is computed.
      // Like xrpl.js: a caller-set `LastLedgerSequence` is left alone.
      const prepared: any = { Sequence: 1, LastLedgerSequence: 100, ...tx }
      if (prepared.Fee == null) {
        const fee = behaviour.autofillFee ?? '12'
        if (fee !== 'absent') prepared.Fee = fee
      }
      return prepared
    },
    submitted: [] as string[],
    submitAndWait: async (blob: string) => {
      log.push('submitAndWait')
      client.submitted.push(blob)
      if (behaviour.submit) return behaviour.submit()
      return { result: { meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 42 } }
    },
    // The first read is the window, taken at signing: 80 gives LastLedgerSequence
    // 100, as the old autofill fixture did. Later reads are expiry checks.
    request: async () => {
      log.push('request')
      const first = client.windowRead
      client.windowRead = false
      return { result: { ledger_index: first ? 80 : (behaviour.validatedLedgerIndex ?? 50) } }
    },
    windowRead: true,
  }
  setXrplClientFactory(() => client as any)
  return client as unknown as FakeClient & { autofilled: any[]; autofillOptions: any[]; submitted: string[] }
}

const realWallet = Wallet.fromSeed('sEdTM1uX8pu2do5XvTnutH6HsouMaM2')
/** The handle the choke point takes: `open` stands in for the Signing Check. */
const wallet = {
  address: realWallet.address,
  open: async () => ({ sign: (tx: any) => realWallet.sign(tx), dispose: () => {} }),
}

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
    // Asserted on the signed blob, not on what the fake was handed: only the
    // SDK's output is what the ledger receives (anti-patterns.md §11).
    expect(client.submitted).toHaveLength(1)
    const signed = decode(client.submitted[0])
    expect(signed.Amount).toEqual({ currency: 'USD', issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq', value: '25.5' })
    expect(signed.DestinationTag).toBe(7)
  })


  it('calls autofill with the transaction alone — no bogus options in the signersCount slot', async () => {
    const client = installFakeClient()

    await submitXrpPayment('testnet', wallet, { destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', amountDrops: '1000000' })

    // xrpl.js 5's second argument is `signersCount`; an object there was
    // silently ignored, leaving the 2 XRP default as the only ceiling. This
    // pins only OUR call shape. It is not the cap guard: the cap is pinned by
    // the signed-blob tests in 'the fee cap on every write' below, because a
    // fake's recorded input says nothing about what the SDK did with it
    // (anti-patterns.md §11).
    expect(client.autofillOptions).toEqual([undefined])
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

  it('classifies the SDK-reported expiry as expired without asking the ledger', async () => {
    // What xrpl.js's submitAndWait rejects with once the network passes
    // LastLedgerSequence. Read structurally in isExpiry, so this pins that read.
    installFakeClient({
      submit: async () => {
        throw new XrplError(
          "The latest ledger sequence 101 is greater than the transaction's LastLedgerSequence (100).",
        )
      },
      // Not past LastLedgerSequence: only the error itself can say expired.
      validatedLedgerIndex: 50,
    })

    const outcome = await submitXrpPayment('testnet', wallet, {
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      amountDrops: '1000000',
    })

    expect(outcome.status).toBe('expired')
    // Only the window read; the expiry check never asked the ledger again.
    expect(log.filter((e) => e === 'request')).toHaveLength(1)
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
        request: async () => ({ result: { ledger_index: 50 } }),
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
 * What a trust-line change signs, read off the decoded blob (anti-patterns.md
 * §11): the limit the ledger will hold, and NoRipple, so a holder balance
 * cannot ripple through this account.
 */
describe('a trust-line change signs the limit and NoRipple', () => {
  it('signs the requested limit with NoRipple set', async () => {
    const client = installFakeClient()

    await submitTrustSet('testnet', wallet, { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', limit: '100' })

    expect(client.submitted).toHaveLength(1)
    const signed = decode(client.submitted[0])
    expect(signed.TransactionType).toBe('TrustSet')
    expect(signed.LimitAmount).toEqual({ currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '100' })
    expect(Number(signed.Flags) & TrustSetFlags.tfSetNoRipple).toBe(TrustSetFlags.tfSetNoRipple)
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
    // The first two reads are the two writes' windows (taken at signing); the
    // later ones are expiry checks and see `validatedLedgerIndex`.
    let reads = 0
    const client = {
      isConnected: () => true,
      connect: async () => {},
      autofill: async (tx: any) => ({ ...tx, Fee: '12', Sequence: 1, LastLedgerSequence: 100 }),
      submitAndWait: () =>
        new Promise((resolve, reject) => {
          parked.push({ resolve, reject })
        }),
      request: async () => ({ result: { ledger_index: reads++ < 2 ? 80 : validatedLedgerIndex } }),
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

describe('the fee cap on every write, and the pinned fee', () => {
  const XRP = { destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', amountDrops: '1000000' }
  const signedFee = (blob: string) => decode(blob).Fee

  it('signs and submits exactly the pinned fee, for an XRP payment', async () => {
    const client = installFakeClient({ autofillFee: '12' })

    const outcome = await submitXrpPayment('testnet', wallet, { ...XRP, feeDrops: '10' })

    expect(outcome.status).toBe('validated')
    expect(client.autofilled[0].Fee).toBe('10')
    expect(client.submitted).toHaveLength(1)
    expect(signedFee(client.submitted[0])).toBe('10')
  })

  it('signs and submits exactly the pinned fee, for a token payment', async () => {
    const client = installFakeClient({ autofillFee: '12' })

    await submitIssuedPayment('testnet', wallet, {
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      currency: 'USD',
      issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
      value: '25.5',
      feeDrops: '10',
    })

    expect(client.autofilled[0].Fee).toBe('10')
    expect(signedFee(client.submitted[0])).toBe('10')
  })

  it('leaves the fee to autofill when none is pinned', async () => {
    const client = installFakeClient({ autofillFee: '12' })

    await submitXrpPayment('testnet', wallet, XRP)

    expect('Fee' in client.autofilled[0]).toBe(false)
    expect(signedFee(client.submitted[0])).toBe('12')
  })

  it('signs a fee exactly at the cap', async () => {
    const client = installFakeClient({ autofillFee: MAX_FEE_DROPS })

    const outcome = await submitXrpPayment('testnet', wallet, XRP)

    expect(MAX_FEE_DROPS).toBe('10000')
    expect(outcome.status).toBe('validated')
    expect(signedFee(client.submitted[0])).toBe('10000')
  })

  it('refuses one drop above the cap, before signing, and still lowers the in-flight flag', async () => {
    const client = installFakeClient({ autofillFee: '10001' })

    const attempt = submitXrpPayment('testnet', wallet, XRP)
    await expect(attempt).rejects.toBeInstanceOf(FeeAboveCapError)
    await expect(attempt).rejects.toThrow(/0\.010001 XRP.*limit of 0\.01 XRP.*Nothing was signed or submitted/)

    expect(client.submitted).toEqual([])
    expect(log).not.toContain('submitAndWait')
    expect(log[0]).toBe('in-flight:true')
    expect(log.at(-1)).toBe('in-flight:false')
  })

  it('refuses a pinned fee above the cap too — pinning is not a way around it', async () => {
    const client = installFakeClient()

    await expect(submitXrpPayment('testnet', wallet, { ...XRP, feeDrops: '20000' })).rejects.toBeInstanceOf(
      FeeAboveCapError,
    )
    expect(client.submitted).toEqual([])
  })

  it('refuses above the cap on every write type, not only payments', async () => {
    const client = installFakeClient({ autofillFee: '2000000' })

    await expect(
      submitTrustSet('testnet', wallet, { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', limit: '100' }),
    ).rejects.toBeInstanceOf(FeeAboveCapError)
    const accountSet: AccountSet = { TransactionType: 'AccountSet', Account: wallet.address }
    await expect(submitAndClassify('testnet', wallet, accountSet)).rejects.toBeInstanceOf(FeeAboveCapError)

    expect(client.submitted).toEqual([])
    expect(log.at(-1)).toBe('in-flight:false')
  })

  it.each([
    ['missing', 'absent'],
    ['zero', '0'],
    ['fractional', '12.5'],
    ['not a number', 'abc'],
    ['leading zero', '012'],
    ['negative', '-12'],
  ])('refuses a %s fee before signing (fail closed)', async (_label, fee) => {
    const client = installFakeClient({ autofillFee: fee })

    const attempt = submitXrpPayment('testnet', wallet, XRP)
    await expect(attempt).rejects.toBeInstanceOf(FeeAboveCapError)
    await expect(attempt).rejects.toThrow(/could not be confirmed.*Nothing was signed or submitted/)

    expect(client.submitted).toEqual([])
    expect(log.at(-1)).toBe('in-flight:false')
  })
})

describe('every write forwards the Wallet\'s Node', () => {
  const NODE = 'wss://node.example.com'
  const PARAMS = { destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', amountDrops: '1000000' }

  /** Records the URL of each client built, and lets a test drop the socket. */
  function nodeClient(opts: { failSubmit?: boolean } = {}) {
    const urls: string[] = []
    const state = { connected: true }
    setXrplClientFactory((url) => {
      urls.push(url)
      return {
        isConnected: () => state.connected,
        connect: async () => {},
        disconnect: async () => {},
        autofill: async (tx: any) => ({ ...tx, Fee: '12', Sequence: 1, LastLedgerSequence: 100 }),
        submitAndWait: async () => {
          if (opts.failSubmit) {
            state.connected = false
            throw new Error('connection dropped')
          }
          return { result: { meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 42 } }
        },
        // 50 for the window read; past it once the socket dropped.
        request: async () => ({ result: { ledger_index: state.connected ? 50 : 200 } }),
      } as any
    })
    return urls
  }

  it('submitXrpPayment, submitIssuedPayment and submitTrustSet reach only the custom Node', async () => {
    const urls = nodeClient()
    await submitXrpPayment('mainnet', wallet, PARAMS, NODE)
    await submitIssuedPayment(
      'mainnet',
      wallet,
      { ...PARAMS, currency: 'USD', issuer: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', value: '1' },
      NODE,
    )
    await submitTrustSet('mainnet', wallet, { currency: 'USD', issuer: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', limit: '10' }, NODE)
    // One pooled client, built for the custom Node and never for a built-in one.
    expect(urls).toEqual([NODE])
  })

  it('submitAndClassify forwards it to the hold and to the expiry check', async () => {
    const urls = nodeClient({ failSubmit: true })
    const outcome = await submitAndClassify(
      'mainnet',
      wallet,
      { TransactionType: 'Payment', Account: wallet.address, Destination: PARAMS.destination, Amount: '1' },
      NODE,
    )
    expect(outcome.status).toBe('expired')
    // The hold built it, the dropped socket made the expiry check build another
    // — both for the custom Node.
    expect(urls).toEqual([NODE, NODE])
  })
})

describe('the Signing Check runs inside the choke point (AD-22)', () => {
  const PAY = { destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', amountDrops: '1000000' }

  function loggingHandle(opts: { openFails?: boolean; signFails?: boolean } = {}) {
    const state = { disposed: 0, signed: [] as any[] }
    const handle = {
      address: realWallet.address,
      open: async () => {
        log.push('open')
        if (opts.openFails) throw new Error('check cancelled')
        return {
          sign: (tx: any) => {
            log.push('sign')
            if (opts.signFails) throw new Error('sign failed')
            state.signed.push(tx)
            return realWallet.sign(tx)
          },
          dispose: () => {
            state.disposed += 1
          },
        }
      },
    }
    return { handle, state }
  }

  it('opens the Signer after autofill, reads the window after the open, then signs and submits', async () => {
    installFakeClient({ validatedLedgerIndex: 700 })
    const { handle, state } = loggingHandle()
    await submitXrpPayment('testnet', handle, PAY)
    expect(log.filter((e) => ['autofill', 'open', 'request', 'sign', 'submitAndWait'].includes(e))).toEqual([
      'autofill',
      'open',
      'request',
      'sign',
      'submitAndWait',
    ])
    expect(state.disposed).toBe(1)
  })

  it('sets LastLedgerSequence to the validated ledger read after the open, plus 20', async () => {
    const client = installFakeClient()
    ;(client as any).request = async () => {
      log.push('request')
      // What the ledger is NOW, after a long prompt — not what autofill saw.
      return { result: { ledger_index: log.includes('open') ? 1000 : 10 } }
    }
    const { handle, state } = loggingHandle()
    await submitXrpPayment('testnet', handle, PAY)
    expect(state.signed[0].LastLedgerSequence).toBe(1020)
    expect(decode(client.submitted[0]).LastLedgerSequence).toBe(1020)
  })

  it('submits nothing when the check fails, and lowers the in-flight depth', async () => {
    const client = installFakeClient()
    const { handle } = loggingHandle({ openFails: true })
    await expect(submitXrpPayment('testnet', handle, PAY)).rejects.toThrow('check cancelled')
    expect(client.submitted).toEqual([])
    expect(log).not.toContain('sign')
    expect(log.filter((e) => e.startsWith('in-flight'))).toEqual(['in-flight:true', 'in-flight:false'])
  })

  it('never opens the check for a fee above the cap', async () => {
    installFakeClient({ autofillFee: '99999999' })
    const { handle } = loggingHandle()
    await expect(submitXrpPayment('testnet', handle, PAY)).rejects.toBeInstanceOf(FeeAboveCapError)
    expect(log).not.toContain('open')
  })

  it('disposes the Signer even when signing throws', async () => {
    const client = installFakeClient()
    const { handle, state } = loggingHandle({ signFails: true })
    await expect(submitXrpPayment('testnet', handle, PAY)).rejects.toThrow('sign failed')
    expect(state.disposed).toBe(1)
    expect(client.submitted).toEqual([])
  })

  it('signs a caller-set LastLedgerSequence unchanged and reads no window', async () => {
    const client = installFakeClient({ validatedLedgerIndex: 700 })
    const { handle, state } = loggingHandle()
    await submitAndClassify('testnet', handle, {
      TransactionType: 'Payment',
      Account: realWallet.address,
      Destination: PAY.destination,
      Amount: '1',
      LastLedgerSequence: 4242,
    })
    expect(state.signed[0].LastLedgerSequence).toBe(4242)
    expect(decode(client.submitted[0]).LastLedgerSequence).toBe(4242)
  })

  it('rejects a non-numeric validated ledger index with nothing signed or submitted', async () => {
    const client = installFakeClient()
    ;(client as any).request = async () => ({ result: { ledger_index: '700' } })
    const { handle, state } = loggingHandle()
    await expect(submitXrpPayment('testnet', handle, PAY)).rejects.toThrow(/nothing was signed/)
    expect(state.signed).toEqual([])
    expect(client.submitted).toEqual([])
    expect(state.disposed).toBe(1)
    expect(log.filter((e) => e.startsWith('in-flight'))).toEqual(['in-flight:true', 'in-flight:false'])
  })
})

describe('a Regular Key change signs SetRegularKey for the handle’s Account', () => {
  it('signs the Account and the new Regular Key through the choke point', async () => {
    const client = installFakeClient()

    const outcome = await submitSetRegularKey('testnet', wallet, { regularKey: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' })

    expect(outcome.status).toBe('validated')
    expect(log[0]).toBe('in-flight:true')
    expect(log.at(-1)).toBe('in-flight:false')
    const signed = decode(client.submitted[0])
    expect(signed.TransactionType).toBe('SetRegularKey')
    expect(signed.Account).toBe(wallet.address)
    expect(signed.RegularKey).toBe('rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe')
  })
})

describe('a master-key change signs AccountSet asfDisableMaster for the handle’s Account', () => {
  it.each([
    ['off', false, 'SetFlag', 'ClearFlag'],
    ['on', true, 'ClearFlag', 'SetFlag'],
  ])('turning it %s sets %s and not %s', async (_n, enable, present, absent) => {
    const client = installFakeClient()
    const outcome = await submitMasterKeyFlag('testnet', wallet, { enable })
    expect(outcome.status).toBe('validated')
    const signed = decode(client.submitted[0]) as Record<string, unknown>
    expect(signed.TransactionType).toBe('AccountSet')
    expect(signed.Account).toBe(wallet.address)
    expect(signed[present]).toBe(4)
    expect(signed[absent]).toBeUndefined()
    expect(log[0]).toBe('in-flight:true')
    expect(log.at(-1)).toBe('in-flight:false')
  })
})

describe('two-device building, signing and submitting (AD-30)', () => {
  const payment: any = { TransactionType: 'Payment', Account: realWallet.address, Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', Amount: '1000000' }

  it('sets LastLedgerSequence to the validated ledger plus 75, explicitly, over autofill\'s own', async () => {
    installFakeClient({ validatedLedgerIndex: 1000 })
    // The fake's first ledger read answers 80 (the signing window); drain it.
    await validatedLedgerIndex('testnet')
    expect(TWO_DEVICE_LEDGER_WINDOW).toBe(75)
    const prepared: any = await prepareUnsigned('testnet', payment)
    expect(prepared.LastLedgerSequence).toBe(1075)
    expect(prepared.Sequence).toBe(1)
    expect(prepared.Fee).toBe('12')
    expect(log).not.toContain('submitAndWait')
  })

  it('refuses a fee above the cap, building nothing', async () => {
    installFakeClient({ autofillFee: '20000' })
    await expect(prepareUnsigned('testnet', payment)).rejects.toThrow(FeeAboveCapError)
  })

  it('signs once, disposes the Signer in finally, and refuses a foreign Account or an over-cap fee', async () => {
    let disposed = 0
    const handle = {
      address: realWallet.address,
      open: async () => ({ sign: (tx: any) => realWallet.sign(tx), dispose: () => void (disposed += 1) }),
    }
    const tx: any = { ...payment, Sequence: 3, Fee: '12', LastLedgerSequence: 500 }
    const signed = await signPrepared(handle, tx)
    expect(decode(signed.tx_blob).Amount).toBe('1000000')
    expect(disposed).toBe(1)
    await expect(signPrepared(handle, { ...tx, Account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' })).rejects.toThrow(/not for this wallet/)
    await expect(signPrepared(handle, { ...tx, Fee: '10001' })).rejects.toThrow(FeeAboveCapError)
    const throwing = { ...handle, open: async () => ({ sign: () => { throw new Error('boom') }, dispose: () => void (disposed += 1) }) }
    await expect(signPrepared(throwing, tx)).rejects.toThrow('boom')
    expect(disposed).toBe(2)
  })

  it('submits a received blob through the choke point: in-flight signal, one submission of that exact blob', async () => {
    const client = installFakeClient()
    const tx: any = { ...payment, Sequence: 3, Fee: '12', LastLedgerSequence: 500 }
    const blob = realWallet.sign(tx).tx_blob
    const outcome = await submitSignedBlob('testnet', tx, blob)
    expect(outcome.status).toBe('validated')
    expect(client.submitted).toEqual([blob])
    expect(log[0]).toBe('in-flight:true')
    expect(log.at(-1)).toBe('in-flight:false')
  })

  it('still caps the fee of a received blob', async () => {
    const client = installFakeClient()
    const tx: any = { ...payment, Sequence: 3, Fee: '20000', LastLedgerSequence: 500 }
    await expect(submitSignedBlob('testnet', tx, 'AB')).rejects.toThrow(FeeAboveCapError)
    expect(client.submitted).toEqual([])
  })
})
