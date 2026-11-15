import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Client, Wallet, decode } from 'xrpl'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import {
  resetTxInFlightReporter,
  submitMasterKeyFlag,
  submitNoChangeAccountSet,
  submitSetRegularKey,
  temResultOf,
  type SigningHandle,
} from '../writes'
import { describeResultCode } from '../result-codes'
import { LEDGER_REFUSAL } from '@/lib/offline-round-words'

/**
 * Story 11 (OS-FR-21, P-31). A `tem` preliminary result is today's `failed` outcome with
 * its code on the online write path too, read from the error xrpl.js 5.1.0's REAL
 * `Client.submitAndWait` throws (only `request`, `autofill` and the connection are stubbed),
 * so a reworded xrpl.js error fails this test rather than reading as "may have been sent".
 * What left the process is read off the submitted blob (anti-patterns.md §11).
 */
const master = Wallet.fromSeed('sEdTM1uX8pu2do5XvTnutH6HsouMaM2')

const ledger = { preliminary: 'tesSUCCESS', result: 'tesSUCCESS', submitted: [] as string[] }

function realClient(): Client {
  const client = new Client('wss://s.altnet.rippletest.net:51233')
  Object.assign(client, {
    isConnected: () => true,
    connect: async () => {},
    autofill: async (tx: Record<string, unknown>) => ({ Sequence: 5, Fee: '12', ...tx }),
    getLedgerIndex: async () => 81,
    request: async (req: Record<string, unknown>) => {
      if (req.command === 'submit') {
        ledger.submitted.push(req.tx_blob as string)
        return { result: { engine_result: ledger.preliminary, engine_result_message: 'message' } }
      }
      if (req.command === 'tx') return { result: { validated: true, meta: { TransactionResult: ledger.result }, ledger_index: 82 } }
      return { result: { ledger_index: 80 } }
    },
  })
  return client
}

const handle: SigningHandle = {
  address: master.address,
  async open() {
    return { sign: (tx) => master.sign(tx), dispose: () => {} }
  },
}

beforeEach(() => {
  ledger.preliminary = 'tesSUCCESS'
  ledger.result = 'tesSUCCESS'
  ledger.submitted = []
  resetXrplClients()
  setXrplClientFactory(() => realClient())
})

afterEach(() => {
  resetXrplClientFactory()
  resetXrplClients()
  resetTxInFlightReporter()
})

describe('temBAD_REGKEY on the online write path (P-31: failed, nothing applied)', () => {
  it('a Regular Key equal to the Account is sent, not refused by the app; the tem is a failed outcome with its code', async () => {
    ledger.preliminary = 'temBAD_REGKEY'
    const outcome = await submitSetRegularKey('testnet', handle, { regularKey: master.address })
    expect(outcome).toEqual({ status: 'failed', hash: expect.any(String), resultCode: 'temBAD_REGKEY' })
    expect(ledger.submitted).toHaveLength(1)
    expect(decode(ledger.submitted[0])).toMatchObject({ TransactionType: 'SetRegularKey', Account: master.address, RegularKey: master.address })
    expect(describeResultCode('temBAD_REGKEY')).toBe(LEDGER_REFUSAL.temBAD_REGKEY)
  })

  it('temResultOf reads only the xrpl.js tem error, never another', () => {
    expect(temResultOf(Object.assign(new Error('Transaction failed, temMALFORMED: x'), { name: 'XrplError' }))).toBe('temMALFORMED')
    expect(temResultOf(new Error('Transaction failed, temMALFORMED: x'))).toBeNull()
    expect(temResultOf(Object.assign(new Error('The latest ledger sequence 9 is greater'), { name: 'XrplError' }))).toBeNull()
    expect(temResultOf('Transaction failed, temX:')).toBeNull()
  })
})

describe('the ledger key refusals as claimed outcomes (P-31), on a real blob', () => {
  it.each([
    ['tecNO_ALTERNATIVE_KEY', LEDGER_REFUSAL.tecNO_ALTERNATIVE_KEY],
    ['tecNEED_MASTER_KEY', LEDGER_REFUSAL.tecNEED_MASTER_KEY],
  ])('%s: claimed, and its reason is the P-31 sentence, never the code alone', async (code, words) => {
    ledger.result = code
    const outcome = await submitMasterKeyFlag('testnet', handle, { enable: false })
    expect(outcome).toMatchObject({ status: 'claimed', resultCode: code })
    expect(decode(ledger.submitted[0])).toMatchObject({ TransactionType: 'AccountSet', SetFlag: 4 })
    expect(describeResultCode(code)).toBe(words)
  })
})

describe('the new key writes, as signed', () => {
  it('a removal carries no RegularKey field', async () => {
    await submitSetRegularKey('testnet', handle, { regularKey: null })
    const tx = decode(ledger.submitted[0])
    expect(tx.TransactionType).toBe('SetRegularKey')
    expect('RegularKey' in tx).toBe(false)
  })

  it('a set carries the address as typed, whatever it is (no app refusal)', async () => {
    await submitSetRegularKey('testnet', handle, { regularKey: 'rrrrrrrrrrrrrrrrrrrrBZbvji' })
    expect(decode(ledger.submitted[0]).RegularKey).toBe('rrrrrrrrrrrrrrrrrrrrBZbvji')
  })

  it('the Regular Key test is an AccountSet with no changes', async () => {
    await submitNoChangeAccountSet('testnet', { ...handle }, undefined)
    const tx = decode(ledger.submitted[0])
    expect(tx.TransactionType).toBe('AccountSet')
    for (const f of ['SetFlag', 'ClearFlag', 'Domain', 'EmailHash', 'TransferRate', 'TickSize']) expect(f in tx).toBe(false)
    expect(tx.Flags ?? 0).toBe(0)
  })
})
