import { createContext, useContext, useMemo, useState } from 'react'
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

/**
 * `usePrompts`, plus whether a prompt is open right now. A sheet that started
 * the signing hides itself while `promptOpen`, so exactly one overlay is open at
 * a time; it comes back only if its owner still wants it open once the prompt
 * settles (a screen that withdraws the intent on failure, like Send, keeps it closed).
 */
export function useYieldingPrompts(): { prompts: Prompts; promptOpen: boolean } {
  const inner = usePrompts()
  // A count, not a flag: one prompt settling must not reveal the sheet while another is open.
  const [openPrompts, setOpenPrompts] = useState(0)
  const prompts = useMemo<Prompts>(
    () => ({
      pin: async (info) => {
        setOpenPrompts((n) => n + 1)
        try {
          return await inner.pin(info)
        } finally {
          setOpenPrompts((n) => n - 1)
        }
      },
    }),
    [inner],
  )
  return { prompts, promptOpen: openPrompts > 0 }
}
