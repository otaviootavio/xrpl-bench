import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decode, encode, PaymentFlags, Wallet } from 'xrpl'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import {
  expectedAccountFor,
  FeeAboveCapError,
  resetTxInFlightReporter,
  setTxInFlightReporter,
  submitAndClassify,
  submitXrpPayment,
  TransmitDeclinedError,
  TransmitRefusedError,
  transmitSignedTransaction,
  type SignedForReview,
} from '../writes'

/**
 * The Transmit step (route-checks.md "Transmit step", OS-FR-9, OS-FR-10, OS-FR-20).
 * Every blob here is really signed by xrpl.js, and every assertion about what
 * left the process reads `client.submitted` (anti-patterns.md §11): a refusal
 * is pinned by an empty `submitted`, a send by the decoded blob.
 */

let log: string[] = []

function installFakeClient(behaviour: { validated?: number[]; readFails?: boolean } = {}) {
  const reads = [...(behaviour.validated ?? [80])]
  const client = {
    submitted: [] as string[],
    isConnected: () => true,
    connect: async () => {},
    autofill: async (tx: any) => {
      log.push('autofill')
      return { Sequence: 1, Fee: '12', ...tx }
    },
    request: async () => {
      log.push('request')
      if (behaviour.readFails) throw new Error('socket closed')
      // The last value repeats once the list is used up.
      const index = reads.length > 1 ? reads.shift() : reads[0]
      return { result: { ledger_index: index } }
    },
    submitAndWait: async (blob: string) => {
      log.push('submitAndWait')
      client.submitted.push(blob)
      return { result: { meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 90 } }
    },
  }
  setXrplClientFactory(() => client as any)
  return client
}

const master = Wallet.fromSeed('sEdTM1uX8pu2do5XvTnutH6HsouMaM2')
const other = Wallet.fromSeed('sEd7rBGm5kxzauRTAV2hbsNz7N45X91')
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

function handle(wallet: Wallet, extra: Partial<{ address: string; reviewBeforeSending: (s: SignedForReview) => Promise<boolean> }> = {}) {
  return {
    address: wallet.classicAddress,
    open: async () => ({ sign: (tx: any) => wallet.sign(tx), dispose: () => {} }),
    ...extra,
  }
}

function payment(over: Record<string, unknown> = {}): any {
  return { TransactionType: 'Payment', Account: master.address, Destination: DEST, Amount: '1000000', Fee: '12', Sequence: 3, LastLedgerSequence: 100, ...over }
}

beforeEach(() => {
  log = []
  resetXrplClients()
  setTxInFlightReporter((on) => log.push(`in-flight:${on}`))
})

afterEach(() => {
  resetTxInFlightReporter()
  resetXrplClients()
  resetXrplClientFactory()
})

/** The depth was raised once and lowered once: nothing is left in flight. */
function expectDepthReleased() {
  expect(log.filter((e) => e.startsWith('in-flight'))).toEqual(['in-flight:true', 'in-flight:false'])
}

describe('a scanned Signed Transaction enters the same Transmit step (OS-FR-9)', () => {
  it('sends a good blob once, with a fresh window read, and classifies it as today', async () => {
    const client = installFakeClient({ validated: [90] })
    const blob = master.sign(payment()).tx_blob
    const outcome = await transmitSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, master.address)
    expect(outcome).toMatchObject({ status: 'validated', resultCode: 'tesSUCCESS', ledgerIndex: 90 })
    expect(client.submitted).toEqual([blob])
    expect(log.filter((e) => e === 'request' || e === 'submitAndWait')).toEqual(['request', 'submitAndWait'])
    expectDepthReleased()
  })

  it('refuses a signature that does not verify, and sends nothing', async () => {
    const client = installFakeClient()
    const tx = decode(master.sign(payment()).tx_blob) as any
    // One changed hex digit of the signature, everything else as signed.
    tx.TxnSignature = (tx.TxnSignature[0] === 'A' ? 'B' : 'A') + tx.TxnSignature.slice(1)
    const err = await transmitSignedTransaction('testnet', { txBlob: encode(tx), network: 'testnet' }, master.address).catch((e) => e)
    expect(err).toBeInstanceOf(TransmitRefusedError)
    expect(err).toMatchObject({ reason: 'signature', message: 'The app did not send the transaction. The signature is not correct.' })
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('refuses a blob that does not decode as a signature fault', async () => {
    const client = installFakeClient()
    await expect(transmitSignedTransaction('testnet', { txBlob: '00', network: 'testnet' }, master.address)).rejects.toMatchObject({ reason: 'signature' })
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('refuses a blob signed for another Account, naming both', async () => {
    const client = installFakeClient()
    const blob = other.sign(payment({ Account: other.address })).tx_blob
    const err = await transmitSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, master.address).catch((e) => e)
    expect(err).toMatchObject({
      reason: 'account',
      message: `The app did not send the transaction. The account ${other.address} signed this transaction. The correct account is ${master.address}.`,
    })
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('refuses a Signed Transaction for another Network, naming both', async () => {
    const client = installFakeClient()
    const blob = master.sign(payment()).tx_blob
    const err = await transmitSignedTransaction('testnet', { txBlob: blob, network: 'mainnet' }, master.address).catch((e) => e)
    expect(err).toMatchObject({
      reason: 'network',
      message: 'The app did not send the transaction. This transaction is for Mainnet. This wallet sends on Testnet.',
    })
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('refuses a partial payment', async () => {
    const client = installFakeClient()
    const blob = master.sign(payment({ Flags: PaymentFlags.tfPartialPayment, SendMax: '2000000' })).tx_blob
    expect((decode(blob).Flags as number) & PaymentFlags.tfPartialPayment).not.toBe(0)
    await expect(transmitSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, master.address)).rejects.toMatchObject({
      reason: 'partial-payment',
      message: 'The app did not send the transaction. This is a partial payment. The app does not send partial payments.',
    })
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('refuses a blob past its LastLedgerSequence with the fixed words', async () => {
    const client = installFakeClient({ validated: [101] })
    const blob = master.sign(payment({ LastLedgerSequence: 100 })).tx_blob
    await expect(transmitSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, master.address)).rejects.toMatchObject({
      reason: 'expired',
      message: 'Expired. Nothing was sent.',
    })
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('refuses at exactly its LastLedgerSequence: that ledger is already validated, so it can no longer apply', async () => {
    const client = installFakeClient({ validated: [100] })
    const blob = master.sign(payment({ LastLedgerSequence: 100 })).tx_blob
    await expect(transmitSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, master.address)).rejects.toMatchObject({ reason: 'expired' })
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('sends one ledger before its LastLedgerSequence', async () => {
    const client = installFakeClient({ validated: [99] })
    const blob = master.sign(payment({ LastLedgerSequence: 100 })).tx_blob
    await transmitSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, master.address)
    expect(client.submitted).toEqual([blob])
  })

  it('refuses a blob with no LastLedgerSequence: it could stay valid for ever', async () => {
    const client = installFakeClient()
    const tx = payment()
    delete tx.LastLedgerSequence
    const blob = master.sign(tx).tx_blob
    await expect(transmitSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, master.address)).rejects.toMatchObject({
      reason: 'no-window',
      message: 'The app did not send the transaction.',
    })
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('refuses an envelope naming a Network this build does not know, before reading the blob', async () => {
    const client = installFakeClient()
    await expect(transmitSignedTransaction('testnet', { txBlob: 'not a blob', network: 'xahau' }, master.address)).rejects.toMatchObject({
      reason: 'network',
      message: 'The app did not send the transaction. This transaction is for xahau. This wallet sends on Testnet.',
    })
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('checks the Network before the signature on a scanned blob', async () => {
    installFakeClient()
    await expect(transmitSignedTransaction('testnet', { txBlob: '00', network: 'mainnet' }, master.address)).rejects.toMatchObject({ reason: 'network' })
  })

  it('applies a reviewer when one is given: a "no" sends nothing, a rejection is a "no"', async () => {
    const client = installFakeClient({ validated: [80] })
    const blob = master.sign(payment()).tx_blob
    await expect(
      transmitSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, master.address, undefined, async () => false),
    ).rejects.toBeInstanceOf(TransmitDeclinedError)
    await expect(
      transmitSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, master.address, undefined, async () => {
        throw new Error('screen gone')
      }),
    ).rejects.toBeInstanceOf(TransmitDeclinedError)
    expect(client.submitted).toEqual([])
    await transmitSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, master.address, undefined, async () => true)
    expect(client.submitted).toEqual([blob])
  })

  it('refuses when the window cannot be read: a failed read never relaxes the check', async () => {
    const client = installFakeClient({ readFails: true })
    const blob = master.sign(payment()).tx_blob
    await expect(transmitSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, master.address)).rejects.toMatchObject({
      reason: 'ledger-unread',
      message: 'The app did not send the transaction. The app cannot read the ledger.',
    })
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('still refuses a fee above the cap, read off the blob', async () => {
    const client = installFakeClient()
    const blob = master.sign(payment({ Fee: '10001' })).tx_blob
    await expect(transmitSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, master.address)).rejects.toBeInstanceOf(FeeAboveCapError)
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })
})

describe('a Regular Key signature is accepted for its Account (OS-FR-20)', () => {
  it('sends a blob whose signing key is not the Account’s own address', async () => {
    const client = installFakeClient()
    // `other` is the Regular Key of `master`'s Account: the signing key's address differs from Account.
    const regular = Wallet.fromSeed('sEd7rBGm5kxzauRTAV2hbsNz7N45X91', { masterAddress: master.address })
    const outcome = await submitXrpPayment('testnet', handle(regular, { address: master.address }), { destination: DEST, amountDrops: '1' })
    expect(outcome.status).toBe('validated')
    const sent = decode(client.submitted[0])
    expect(sent.Account).toBe(master.address)
    expect(sent.SigningPubKey).toBe(other.publicKey)
  })
})

describe('the online write path enters the Transmit step with no extra round trip (setting off)', () => {
  it('reads the ledger once, for the window, and sends what it signed', async () => {
    const client = installFakeClient({ validated: [80] })
    await submitXrpPayment('testnet', handle(master), { destination: DEST, amountDrops: '1' })
    expect(log.filter((e) => ['autofill', 'request', 'submitAndWait'].includes(e))).toEqual(['autofill', 'request', 'submitAndWait'])
    expect(decode(client.submitted[0]).LastLedgerSequence).toBe(100)
  })

  it('refuses a partial payment handed to the choke point, after signing and before sending', async () => {
    const client = installFakeClient()
    await expect(
      submitAndClassify('testnet', handle(master), {
        TransactionType: 'Payment',
        Account: master.address,
        Destination: DEST,
        Amount: '1000000',
        SendMax: '2000000',
        Flags: PaymentFlags.tfPartialPayment,
      }),
    ).rejects.toMatchObject({ reason: 'partial-payment' })
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('refuses a transaction for an Account the handle does not sign for', async () => {
    const client = installFakeClient()
    await expect(
      submitAndClassify('testnet', handle(master), { TransactionType: 'Payment', Account: other.address, Destination: DEST, Amount: '1' }),
    ).rejects.toMatchObject({ reason: 'account' })
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })
})

describe('"Show the signed transaction before sending" (OS-FR-10)', () => {
  it('shows the blob that is then sent, and sends it after a yes on a fresh window read', async () => {
    const client = installFakeClient({ validated: [80, 95] })
    const seen: SignedForReview[] = []
    const outcome = await submitXrpPayment(
      'testnet',
      handle(master, {
        reviewBeforeSending: async (s) => {
          log.push('review')
          seen.push(s)
          return true
        },
      }),
      { destination: DEST, amountDrops: '1' },
    )
    expect(outcome.status).toBe('validated')
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ network: 'testnet', lastLedgerSequence: 100 })
    expect(client.submitted).toEqual([seen[0].txBlob])
    // The window read, the review, then a second read for the window check, then the send.
    expect(log.filter((e) => ['request', 'review', 'submitAndWait'].includes(e))).toEqual(['request', 'review', 'request', 'submitAndWait'])
    expectDepthReleased()
  })

  it('sends nothing on a decline, and says the blob stays valid until its last ledger', async () => {
    const client = installFakeClient()
    const err = await submitXrpPayment('testnet', handle(master, { reviewBeforeSending: async () => false }), { destination: DEST, amountDrops: '1' }).catch((e) => e)
    expect(err).toBeInstanceOf(TransmitDeclinedError)
    expect(err.message).toBe(
      'WARNING: This signed transaction is valid until ledger 100. Until then, a person who has it can send it. The app did not send the transaction.',
    )
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('keeps the depth raised while the review is open, and lowers it when it settles', async () => {
    installFakeClient()
    let answer!: (send: boolean) => void
    const pending = submitXrpPayment(
      'testnet',
      handle(master, { reviewBeforeSending: () => new Promise<boolean>((r) => (answer = r)) }),
      { destination: DEST, amountDrops: '1' },
    ).catch((e) => e)
    await new Promise((r) => setTimeout(r, 0))
    expect(log.filter((e) => e.startsWith('in-flight'))).toEqual(['in-flight:true'])
    answer(false)
    expect(await pending).toBeInstanceOf(TransmitDeclinedError)
    expectDepthReleased()
  })

  it('reports today\'s expired outcome, sending nothing, when the window passed during the review', async () => {
    const client = installFakeClient({ validated: [80, 100] })
    const outcome = await submitXrpPayment('testnet', handle(master, { reviewBeforeSending: async () => true }), { destination: DEST, amountDrops: '1' })
    expect(outcome.status).toBe('expired')
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('refuses after a yes when the fresh read fails, and sends nothing', async () => {
    const client = installFakeClient({ validated: [80] })
    let reads = 0
    ;(client as any).request = async () => {
      log.push('request')
      if (reads++ === 0) return { result: { ledger_index: 80 } }
      throw new Error('socket closed')
    }
    await expect(
      submitXrpPayment('testnet', handle(master, { reviewBeforeSending: async () => true }), { destination: DEST, amountDrops: '1' }),
    ).rejects.toMatchObject({ reason: 'ledger-unread', message: 'The app did not send the transaction. The app cannot read the ledger.' })
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('treats a rejected review as a decline, and sends nothing', async () => {
    const client = installFakeClient()
    await expect(
      submitXrpPayment('testnet', handle(master, { reviewBeforeSending: async () => { throw new Error('unmounted') } }), { destination: DEST, amountDrops: '1' }),
    ).rejects.toBeInstanceOf(TransmitDeclinedError)
    expect(client.submitted).toEqual([])
    expectDepthReleased()
  })

  it('shows the review the LastLedgerSequence read off the signed blob', async () => {
    const client = installFakeClient({ validated: [80, 81] })
    const seen: SignedForReview[] = []
    await submitXrpPayment('testnet', handle(master, { reviewBeforeSending: async (s) => (seen.push(s), true) }), { destination: DEST, amountDrops: '1' })
    expect(seen[0].lastLedgerSequence).toBe(decode(client.submitted[0]).LastLedgerSequence)
  })
})

describe('the expected Account at the Transmit step (OS-FR-9)', () => {
  it('takes the Synced address, else the answered request, else the on-screen confirm, else none', () => {
    expect(expectedAccountFor({ syncedAddress: 'rS', requestAccount: 'rR', confirmedAccount: 'rC' })).toBe('rS')
    expect(expectedAccountFor({ requestAccount: 'rR', confirmedAccount: 'rC' })).toBe('rR')
    expect(expectedAccountFor({ confirmedAccount: 'rC' })).toBe('rC')
    expect(expectedAccountFor({})).toBeNull()
  })
})
