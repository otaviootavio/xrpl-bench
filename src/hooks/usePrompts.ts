import { createContext, useContext } from 'react'
import type { Prompts } from '@/lib/crypto/keystore'

/** Dismisses every prompt: the answer when no dialog is mounted. */
const dismissedPrompts: Prompts = { pin: async () => null }

/** Where the PIN dialog's `Prompts` live (see `PinPromptProvider`). */
export const PromptsContext = createContext<Prompts | null>(null)

/**
 * The prompts a screen hands to the keystore when it signs or reveals a Seed
 * (parent AD-1: `lib/crypto` asks through a callback and never imports UI).
 * Outside a provider the fallback dismisses every prompt, so a Wallet with a PIN
 * Signing Check fails closed as a cancellation instead of signing.
 */
export function usePrompts(): Prompts {
  return useContext(PromptsContext) ?? dismissedPrompts
}
