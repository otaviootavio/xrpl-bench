import { describe, expect, it } from 'vitest'
import { describeOptions, type PasskeyCapability } from '@/lib/crypto/policy'
import { defaultSigning, preselection } from '@/components/wallet/network-reset'
import type { NetworkId } from '@/lib/xrpl/networks'

const NETWORKS: NetworkId[] = ['mainnet', 'testnet', 'devnet']
const CAPABILITIES: PasskeyCapability[] = ['yes', 'no', 'unknown']
const ORIGINS = ['localhost', 'sites-xrpl-bench-prod-pdbywc.b-cdn.net', undefined]

describe('defaultSigning', () => {
  it('is Standard off Mainnet, and on Mainnet the passkey when the device can use one, else the App PIN', () => {
    expect(defaultSigning('testnet', 'yes')).toBe('standard')
    expect(defaultSigning('devnet', 'no')).toBe('standard')
    expect(defaultSigning('mainnet', 'yes')).toBe('passkey')
    expect(defaultSigning('mainnet', 'no')).toBe('pin')
    expect(defaultSigning('mainnet', 'unknown')).toBe('pin')
  })
})

describe('preselection', () => {
  it('is Stored, 5 minutes, the passkey Open Check only when the device can use one, and the Network signing default', () => {
    expect(preselection('testnet', 'yes')).toEqual({ seedMethod: 'stored', openCheck: 'passkey', autoLockMinutes: 5, signing: 'standard' })
    expect(preselection('mainnet', 'no')).toEqual({ seedMethod: 'stored', openCheck: 'pin', autoLockMinutes: 5, signing: 'pin' })
  })

  it('is always legal for its own Network, for every capability and origin', () => {
    for (const network of NETWORKS)
      for (const capability of CAPABILITIES)
        for (const origin of ORIGINS) {
          const pre = preselection(network, capability)
          const o = describeOptions({ network, ...pre, passkey: capability, origin, canConfirmWrittenSeed: true })
          expect(o.seedMethod[pre.seedMethod].available).toBe(true)
          expect(o.openCheck[pre.openCheck].available).toBe(true)
          expect(o.autoLock.find((c) => c.minutes === pre.autoLockMinutes)?.available).toBe(true)
          expect(o.signing[pre.signing].available).toBe(true)
        }
  })
})
