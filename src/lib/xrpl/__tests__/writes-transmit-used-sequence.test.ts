import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decode, Wallet } from 'xrpl'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import { resetSentThisSession, setTransmitPollMsForTests, submitXrpPayment, transmitSignedTransaction } from '../writes'

/**
 * The Transmit step of a scanned Signed Transaction reads the submit's
 * preliminary result (story 7; OS-FR-16, route-checks "Retry without paying
 * twice", P-23). `tefPAST_SEQ` with the blob's hash not on the ledger is
 * `sent-before` at once, never failed or expired; every other path classifies as
 * xrpl.js 5.1.0's `submitAndWait` does. Blobs are really signed; what left the
 * process is read off `submits` (anti-patterns.md §11).
 */

type TxReply = { result: Record<string, unknown> } | { error: string; searched_all?: boolean } | Error

function installRawClient(opts: { preliminary?: string; tx?: TxReply[]; ledgers?: number[] }) {
  const txReplies = [...(opts.tx ?? [])]
  const ledgers = [...(opts.ledgers ?? [90])]
  const client = {
    submits: [] as Array<{ tx_blob: string; fail_hard: boolean }>,
    txReads: 0,
    submitAndWaitCalls: 0,
    isConnected: () => true,
    connect: async () => {},
    autofill: async (tx: Record<string, unknown>) => ({ Sequence: 1, Fee: '12', ...tx }),
    getLedgerIndex: async () => (ledgers.length > 1 ? ledgers.shift()! : ledgers[0]),
    submitAndWait: async () => {
      client.submitAndWaitCalls += 1
      return { result: { meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 91 } }
    },
    request: async (req: Record<string, unknown>) => {
      if (req.command === 'submit') {
        client.submits.push({ tx_blob: req.tx_blob as string, fail_hard: req.fail_hard as boolean })
        return { result: { engine_result: opts.preliminary ?? 'tesSUCCESS', engine_result_message: 'message' } }
      }
      if (req.command === 'tx') {
        client.txReads += 1
        const reply = txReplies.length > 1 ? txReplies.shift()! : txReplies[0]
        if (reply instanceof Error) throw reply
        if ('error' in reply) throw Object.assign(new Error(reply.error), { data: { error: reply.error, searched_all: reply.searched_all } })
        return reply
      }
      // The window read: the validated ledger.
      return { result: { ledger_index: 80 } }
    },
  }
  setXrplClientFactory(() => client as never)
  return client
}

const master = Wallet.fromSeed('sEdTM1uX8pu2do5XvTnutH6HsouMaM2')
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const signedPayment = (over: Record<string, unknown> = {}) =>
  master.sign({ TransactionType: 'Payment', Account: master.address, Destination: DEST, Amount: '1000000', Fee: '12', Sequence: 3, LastLedgerSequence: 100, ...over } as never)
const VALIDATED = { result: { validated: true, meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 91 } }
const send = (blob: string) => transmitSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, master.address)

beforeEach(() => {
  resetSentThisSession()
  resetXrplClients()
  setTransmitPollMsForTests(0)
})
afterEach(() => {
  setTransmitPollMsForTests(null)
  resetXrplClients()
  resetXrplClientFactory()
})

describe('tefPAST_SEQ on a scanned blob is P-23, "Probably sent before" (OS-FR-16)', () => {
  it('hash not on the ledger: sent-before at once, after exactly one submit; never offered again', async () => {
    const client = installRawClient({ preliminary: 'tefPAST_SEQ', tx: [{ error: 'txnNotFound' }] })
    const signed = signedPayment()
    const outcome = await send(signed.tx_blob)
    expect(outcome).toEqual({ status: 'sent-before', hash: signed.hash, resultCode: 'tefPAST_SEQ' })
    expect(client.submits).toHaveLength(1)
    expect(decode(client.submits[0].tx_blob).Sequence).toBe(3)
    expect(client.txReads).toBe(1)
    // The hash stays claimed: the same blob is refused, nothing is submitted again.
    await expect(send(signed.tx_blob)).rejects.toMatchObject({ reason: 'already-sent' })
    expect(client.submits).toHaveLength(1)
  })

  it('a lookup that fails is still sent-before, never failed', async () => {
    installRawClient({ preliminary: 'tefPAST_SEQ', tx: [new Error('socket closed')] })
    expect((await send(signedPayment().tx_blob)).status).toBe('sent-before')
  })

  it('the same hash found validated (this very blob applied before) reports its real outcome', async () => {
    const client = installRawClient({ preliminary: 'tefPAST_SEQ', tx: [VALIDATED] })
    expect(await send(signedPayment().tx_blob)).toMatchObject({ status: 'validated', resultCode: 'tesSUCCESS', ledgerIndex: 91 })
    expect(client.submits).toHaveLength(1)
  })

  it('the hash known to the server but not validated (rippled keeps a rejected hash) is sent-before at once, not waited out', async () => {
    const client = installRawClient({ preliminary: 'tefPAST_SEQ', tx: [{ result: { validated: false } }, VALIDATED] })
    expect((await send(signedPayment().tx_blob)).status).toBe('sent-before')
    expect(client.txReads).toBe(1)
  })

  it('the same blob in a closed ledger not yet validated (a ledger_index) is waited for, not sent-before (story 7 review)', async () => {
    const client = installRawClient({ preliminary: 'tefPAST_SEQ', tx: [{ result: { validated: false, ledger_index: 90 } }, VALIDATED] })
    expect(await send(signedPayment().tx_blob)).toMatchObject({ status: 'validated', ledgerIndex: 91 })
    expect(client.txReads).toBe(2)
  })

  it('the online write path is unchanged: it still goes through submitAndWait, never its own submit', async () => {
    const client = installRawClient({ preliminary: 'tefPAST_SEQ', tx: [{ error: 'txnNotFound' }] })
    const handle = { address: master.address, open: async () => ({ sign: (tx: never) => master.sign(tx), dispose: () => {} }) }
    expect((await submitXrpPayment('testnet', handle, { destination: DEST, amountDrops: '1' })).status).toBe('validated')
    expect(client.submitAndWaitCalls).toBe(1)
    expect(client.submits).toHaveLength(0)
  })
})

describe('every other result classifies as submitAndWait did (story 2 outcomes)', () => {
  it('txnNotFound waits again, then the validated result', async () => {
    const client = installRawClient({ tx: [{ error: 'txnNotFound' }, { error: 'txnNotFound' }, VALIDATED] })
    expect(await send(signedPayment().tx_blob)).toMatchObject({ status: 'validated', ledgerIndex: 91 })
    expect(client.txReads).toBe(3)
    expect(client.submits).toHaveLength(1)
  })

  it('a tec result is claimed (fee charged)', async () => {
    installRawClient({ tx: [{ result: { validated: true, meta: { TransactionResult: 'tecUNFUNDED_PAYMENT' }, ledger_index: 91 } }] })
    expect(await send(signedPayment().tx_blob)).toMatchObject({ status: 'claimed', resultCode: 'tecUNFUNDED_PAYMENT' })
  })

  it('no readable result is unknown, never failed', async () => {
    installRawClient({ tx: [{ result: { validated: true, meta: 'BINARYMETA' } }] })
    expect((await send(signedPayment().tx_blob)).status).toBe('unknown')
  })

  it('past its LastLedgerSequence and not found anywhere in its window: expired', async () => {
    installRawClient({ tx: [{ error: 'txnNotFound' }, { error: 'txnNotFound', searched_all: true }], ledgers: [95, 101] })
    expect((await send(signedPayment().tx_blob)).status).toBe('expired')
  })

  it('past its LastLedgerSequence but validated before the first read after a sleep: its real outcome (story 7 review)', async () => {
    installRawClient({ tx: [VALIDATED], ledgers: [140] })
    expect(await send(signedPayment().tx_blob)).toMatchObject({ status: 'validated', ledgerIndex: 91 })
  })

  it('past its LastLedgerSequence and the final read fails: unknown, never expired', async () => {
    installRawClient({ tx: [new Error('socket closed')], ledgers: [140] })
    expect((await send(signedPayment().tx_blob)).status).toBe('unknown')
  })

  it('another preliminary tef is waited for, not reported as sent-before', async () => {
    installRawClient({ preliminary: 'tefMAX_LEDGER', tx: [{ error: 'txnNotFound', searched_all: true }], ledgers: [101] })
    expect((await send(signedPayment().tx_blob)).status).toBe('expired')
  })

  it('a tem preliminary result throws, as submitAndWait did (the screen shows it may have been sent)', async () => {
    const client = installRawClient({ preliminary: 'temBAD_AMOUNT' })
    await expect(send(signedPayment().tx_blob)).rejects.toThrow('Transaction failed, temBAD_AMOUNT')
    expect(client.submits).toHaveLength(1)
  })

  it('a lookup error other than txnNotFound is passed on (it may have been sent)', async () => {
    installRawClient({ tx: [{ error: 'internal' }] })
    await expect(send(signedPayment().tx_blob)).rejects.toThrow('internal')
  })

  it('an AccountDelete is submitted with fail_hard, as xrpl.js does', async () => {
    const client = installRawClient({ tx: [VALIDATED] })
    const blob = master.sign({ TransactionType: 'AccountDelete', Account: master.address, Destination: DEST, Fee: '12', Sequence: 3, LastLedgerSequence: 100 } as never).tx_blob
    await send(blob)
    expect(client.submits[0].fail_hard).toBe(true)
    resetXrplClients()
    const client2 = installRawClient({ tx: [VALIDATED] })
    await send(signedPayment({ Sequence: 4 }).tx_blob)
    expect(client2.submits[0].fail_hard).toBe(false)
  })
})
