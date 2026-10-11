import { describe, expect, it } from 'vitest'
import {
  AUTO_LOCK_CHOICES,
  checkSigningCheck,
  checkWalletRequest,
  describeOptions,
  NO_PRF_REASON,
  MAINNET_DERIVED_ORIGIN_REASON,
  MAINNET_DERIVED_UNKNOWN_ORIGIN_REASON,
  PRF_CHECKED_LATER_NOTE,
  requiresWrittenSeed,
  WRITTEN_SEED_REASON,
  type OptionsContext,
  type WalletRequest,
} from '../policy'

const request: WalletRequest = {
  network: 'testnet',
  seedMethod: 'stored',
  openCheck: 'pin',
  autoLockMinutes: 5,
  signing: 'standard',
  passkey: 'yes',
}
const context: OptionsContext = { ...request }
const TEMPORARY = 'sites-xrpl-bench-prod-pdbywc.b-cdn.net'

describe('Signing Check by Seed Method (FR-67)', () => {
  it.each(['standard', 'passkey', 'pin'] as const)('Stored Seed allows %s', (signing) => {
    expect(checkSigningCheck('stored', signing)).toEqual({ ok: true })
  })
  it('Passkey-Derived allows a passkey only', () => {
    expect(checkSigningCheck('passkey-derived', 'passkey')).toEqual({ ok: true })
    expect(checkSigningCheck('passkey-derived', 'standard').ok).toBe(false)
    expect(checkSigningCheck('passkey-derived', 'pin').ok).toBe(false)
  })
})

describe('the written-Seed rule (FR-72)', () => {
  it('applies to Mainnet with a passkey Open Check and a passkey or Standard Signing Check', () => {
    expect(requiresWrittenSeed('mainnet', 'passkey', 'passkey')).toBe(true)
    expect(requiresWrittenSeed('mainnet', 'passkey', 'standard')).toBe(true)
    expect(requiresWrittenSeed('mainnet', 'passkey', 'pin')).toBe(false)
    expect(requiresWrittenSeed('mainnet', 'pin', 'passkey')).toBe(false)
    expect(requiresWrittenSeed('testnet', 'passkey', 'passkey')).toBe(false)
  })
  it('is refused until the confirmation exists, and allowed once story 7 supplies it', () => {
    const passkeyOnly = { ...request, network: 'mainnet' as const, openCheck: 'passkey' as const, signing: 'passkey' as const }
    expect(checkWalletRequest(passkeyOnly)).toEqual({ ok: false, reason: WRITTEN_SEED_REASON })
    expect(checkWalletRequest({ ...passkeyOnly, writtenSeedConfirmed: true })).toEqual({ ok: true })
  })
})

describe('checkWalletRequest', () => {
  it('accepts the Testnet defaults', () => {
    expect(checkWalletRequest(request)).toEqual({ ok: true })
  })
  it('refuses the floors: Mainnet needs an Open Check and a minute', () => {
    expect(checkWalletRequest({ ...request, network: 'mainnet', openCheck: 'none' }).ok).toBe(false)
    expect(checkWalletRequest({ ...request, network: 'mainnet', autoLockMinutes: 0.5 }).ok).toBe(false)
    expect(checkWalletRequest({ ...request, network: 'mainnet', autoLockMinutes: 1 })).toEqual({ ok: true })
    expect(checkWalletRequest({ ...request, network: 'devnet', openCheck: 'none', autoLockMinutes: 0.5 })).toEqual({ ok: true })
  })
  it('refuses a passkey where the device has no PRF, and allows it when unknown', () => {
    expect(checkWalletRequest({ ...request, openCheck: 'passkey', passkey: 'no' })).toEqual({ ok: false, reason: NO_PRF_REASON })
    expect(checkWalletRequest({ ...request, signing: 'passkey', passkey: 'no' })).toEqual({ ok: false, reason: NO_PRF_REASON })
    expect(checkWalletRequest({ ...request, signing: 'passkey', passkey: 'unknown' })).toEqual({ ok: true })
    expect(checkWalletRequest({ ...request, passkey: 'no' })).toEqual({ ok: true })
  })
  it('allows Passkey-Derived with its passkey Signing Check, and only that', () => {
    expect(checkWalletRequest({ ...request, seedMethod: 'passkey-derived', signing: 'passkey' })).toEqual({ ok: true })
    expect(checkWalletRequest({ ...request, seedMethod: 'passkey-derived', signing: 'standard' }).ok).toBe(false)
  })
  it('refuses Passkey-Derived where the device has no PRF', () => {
    expect(checkWalletRequest({ ...request, seedMethod: 'passkey-derived', signing: 'passkey', passkey: 'no' })).toEqual({ ok: false, reason: NO_PRF_REASON })
  })
  it('refuses Passkey-Derived on Mainnet while the origin is *.b-cdn.net, and only there', () => {
    const mainnet = { ...request, network: 'mainnet' as const, seedMethod: 'passkey-derived' as const, openCheck: 'pin' as const, signing: 'passkey' as const }
    expect(checkWalletRequest({ ...mainnet, origin: TEMPORARY })).toEqual({ ok: false, reason: MAINNET_DERIVED_ORIGIN_REASON })
    expect(checkWalletRequest({ ...mainnet, origin: 'wallet.example.com' })).toEqual({ ok: true })
    // An unknown origin fails closed on Mainnet.
    expect(checkWalletRequest(mainnet)).toEqual({ ok: false, reason: MAINNET_DERIVED_UNKNOWN_ORIGIN_REASON })
    expect(describeOptions({ ...context, network: 'mainnet' }).seedMethod['passkey-derived']).toEqual({ available: false, reason: MAINNET_DERIVED_UNKNOWN_ORIGIN_REASON })
    // Testnet and Devnet are unaffected.
    expect(checkWalletRequest({ ...request, seedMethod: 'passkey-derived', signing: 'passkey' })).toEqual({ ok: true })
    expect(checkWalletRequest({ ...request, seedMethod: 'passkey-derived', signing: 'passkey', origin: TEMPORARY })).toEqual({ ok: true })
    expect(checkWalletRequest({ ...request, network: 'devnet', seedMethod: 'passkey-derived', signing: 'passkey', origin: TEMPORARY })).toEqual({ ok: true })
  })
})

describe('describeOptions', () => {
  it('Passkey-Derived follows the capability: yes, unknown with the note, no with the reason', () => {
    expect(describeOptions(context).seedMethod['passkey-derived']).toEqual({ available: true })
    expect(describeOptions({ ...context, passkey: 'unknown' }).seedMethod['passkey-derived']).toEqual({ available: true, note: PRF_CHECKED_LATER_NOTE })
    expect(describeOptions({ ...context, passkey: 'no' }).seedMethod['passkey-derived']).toEqual({ available: false, reason: NO_PRF_REASON })
    expect(describeOptions(context).seedMethod.stored).toEqual({ available: true })
  })
  it('Passkey-Derived is unavailable with a reason on Mainnet at a b-cdn.net origin only', () => {
    expect(describeOptions({ ...context, network: 'mainnet', origin: TEMPORARY }).seedMethod['passkey-derived']).toEqual({
      available: false,
      reason: MAINNET_DERIVED_ORIGIN_REASON,
    })
    expect(describeOptions({ ...context, network: 'mainnet', origin: 'wallet.example.com' }).seedMethod['passkey-derived']).toEqual({ available: true })
    expect(describeOptions({ ...context, network: 'testnet', origin: TEMPORARY }).seedMethod['passkey-derived']).toEqual({ available: true })
    expect(describeOptions({ ...context, network: 'devnet', origin: TEMPORARY }).seedMethod['passkey-derived']).toEqual({ available: true })
  })
  it('gives each unavailable answer a reason from the policy', () => {
    const mainnet = describeOptions({ ...context, network: 'mainnet' })
    expect(mainnet.openCheck.none).toMatchObject({ available: false, reason: expect.stringContaining('Open Check') })
    const half = mainnet.autoLock.find((c) => c.minutes === 0.5)
    expect(half).toMatchObject({ available: false, reason: expect.stringContaining('at least 1 minute') })
    expect(mainnet.autoLock.filter((c) => c.available).map((c) => c.minutes)).toEqual(AUTO_LOCK_CHOICES.filter((m) => m >= 1))
    const testnet = describeOptions(context)
    expect(testnet.openCheck.none.available).toBe(true)
    expect(testnet.autoLock.every((c) => c.available)).toBe(true)
  })
  it('passkey answers follow the capability: no, yes, unknown', () => {
    const no = describeOptions({ ...context, passkey: 'no' })
    expect(no.openCheck.passkey).toEqual({ available: false, reason: NO_PRF_REASON })
    expect(no.signing.passkey).toEqual({ available: false, reason: NO_PRF_REASON })
    expect(no.openCheck.pin.available && no.signing.pin.available && no.signing.standard.available).toBe(true)
    const unknown = describeOptions({ ...context, passkey: 'unknown' })
    expect(unknown.openCheck.passkey).toEqual({ available: true, note: PRF_CHECKED_LATER_NOTE })
    expect(describeOptions(context).openCheck.passkey).toEqual({ available: true })
  })
  it('Passkey-Derived allows only the passkey Signing Check', () => {
    const d = describeOptions({ ...context, seedMethod: 'passkey-derived' })
    expect(d.signing.standard.available).toBe(false)
    expect(d.signing.pin.available).toBe(false)
    expect(d.signing.passkey.available).toBe(true)
  })
  it('reports the combination verdict, the written-Seed refusal included', () => {
    expect(describeOptions(context).combination).toEqual({ ok: true })
    const d = describeOptions({ ...context, network: 'mainnet', openCheck: 'passkey', signing: 'passkey' })
    expect(d.combination).toEqual({ ok: false, reason: WRITTEN_SEED_REASON })
    // Each answer alone is fine: the refusal belongs to the pair.
    expect(d.openCheck.passkey.available && d.signing.passkey.available).toBe(true)
  })
})
