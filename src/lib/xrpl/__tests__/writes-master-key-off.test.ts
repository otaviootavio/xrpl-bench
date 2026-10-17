import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Wallet, decode } from 'xrpl'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import { MasterKeyOffError, resetTxInFlightReporter, submitAndClassify } from '../writes'

/**
 * Browser pass (stories 9–10): a send from an Account whose master key is OFF,
 * signed by that master key, ended as "expired before validating" with no cause
 * named. The choke point now reads the flag before the Signing Check and refuses
 * with the reason, and a failed read does not relax it.
 */
const wallet = Wallet.fromSeed('sEdTM1uX8pu2do5XvTnutH6HsouMaM2')
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const DISABLE_MASTER = 0x00100000

const ledger = { flags: 0, accountReadFails: false, submitted: [] as string[] }

beforeEach(() => {
  ledger.flags = 0
  ledger.accountReadFails = false
  ledger.submitted = []
  resetXrplClients()
  setXrplClientFactory(
    () =>
      ({
        isConnected: () => true,
        connect: async () => {},
        autofill: async (tx: any) => ({ Sequence: 1, Fee: '12', LastLedgerSequence: 100, ...tx }),
        request: async (req: { command: string }) => {
          if (req.command === 'account_info') {
            if (ledger.accountReadFails) throw new Error('ledger unreachable')
            return { result: { account_data: { Balance: '100000000', OwnerCount: 0, Sequence: 1, Flags: ledger.flags } } }
          }
          return { result: { ledger_index: 80 } }
        },
        submitAndWait: async (blob: string) => {
          ledger.submitted.push(blob)
          return { result: { meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 90 } }
        },
      }) as any,
  )
})
afterEach(() => {
  resetTxInFlightReporter()
  resetXrplClients()
  resetXrplClientFactory()
})

const payment = { TransactionType: 'Payment', Account: wallet.address, Destination: DEST, Amount: '1000000' } as const
const handle = (signsAsMaster: boolean | undefined, open = vi.fn(async () => ({ sign: (tx: any) => wallet.sign(tx), dispose: () => {} }))) => ({
  signing: { address: wallet.address, ...(signsAsMaster === undefined ? {} : { signsAsMaster }), open },
  open,
})

describe('the choke point and an Account whose master key is off', () => {
  it('refuses a master-key signer with the reason, before the Signing Check, and submits nothing', async () => {
    ledger.flags = DISABLE_MASTER
    const { signing, open } = handle(true)
    await expect(submitAndClassify('testnet', signing, payment)).rejects.toBeInstanceOf(MasterKeyOffError)
    await expect(submitAndClassify('testnet', signing, payment)).rejects.toThrow(/Regular Key/)
    expect(open).not.toHaveBeenCalled()
    expect(ledger.submitted).toEqual([])
  })

  it('lets the Regular Key signer through while the master key is off', async () => {
    ledger.flags = DISABLE_MASTER
    const { signing, open } = handle(false)
    expect((await submitAndClassify('testnet', signing, payment)).status).toBe('validated')
    expect(open).toHaveBeenCalledOnce()
    expect(decode(ledger.submitted[0]).TransactionType).toBe('Payment')
  })

  it('lets the master-key signer through while the master key is on', async () => {
    ledger.flags = 0
    const { signing } = handle(true)
    expect((await submitAndClassify('testnet', signing, payment)).status).toBe('validated')
  })

  it('a failed read of the Account does not relax the guard: nothing is signed', async () => {
    ledger.accountReadFails = true
    const { signing, open } = handle(true)
    await expect(submitAndClassify('testnet', signing, payment)).rejects.toThrow(/could not be read to confirm its master key is on/)
    expect(open).not.toHaveBeenCalled()
    expect(ledger.submitted).toEqual([])
  })

  it('a handle that does not say it signs as the master key asks nothing (unchanged behaviour)', async () => {
    ledger.accountReadFails = true
    const { signing } = handle(undefined)
    expect((await submitAndClassify('testnet', signing, payment)).status).toBe('validated')
  })
})
