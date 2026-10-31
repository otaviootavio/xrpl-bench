import type { NewOpenCheck, PasskeyCapability, SeedMethod, SigningKind } from '@/lib/crypto/policy'
import type { NetworkId } from '@/lib/xrpl/networks'

/**
 * The answers the create-wallet quiz starts from, and goes back to when Network
 * changes on step 1 (FR-91). Pure: it holds no state and decides no rule.
 */

/** The line shown under Network on step 1 after Network changed. */
export const NETWORK_RESET_NOTE = 'The later questions start again.'

/** The Signing Check a Network pre-selects: Standard off Mainnet, otherwise the
 * passkey when this device can use one, else the App PIN. */
export function defaultSigning(network: NetworkId, capability: PasskeyCapability): SigningKind {
  if (network !== 'mainnet') return 'standard'
  return capability === 'yes' ? 'passkey' : 'pin'
}

export interface Preselection {
  seedMethod: SeedMethod
  openCheck: NewOpenCheck
  autoLockMinutes: number
  signing: SigningKind
}

/** FR-60's pre-selected answers. The initial state and the reset share this. */
export function preselection(network: NetworkId, capability: PasskeyCapability): Preselection {
  return {
    seedMethod: 'stored',
    openCheck: capability === 'yes' ? 'passkey' : 'pin',
    autoLockMinutes: 5,
    signing: defaultSigning(network, capability),
  }
}
