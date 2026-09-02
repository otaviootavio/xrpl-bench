import { toast as sonner } from 'sonner'

interface NotifyOptions {
  description?: string
}

/**
 * The app's single notification entry point.
 *
 * Errors and warnings NEVER auto-dismiss; successes and info do. sonner's
 * `<Toaster toastOptions>` applies one duration to every type, so the rule has
 * to live here rather than in the provider — see docs/decisions.md §6.5.
 *
 * Why it matters here specifically: an unlock failure, a failed faucet request
 * and a `tec*` "the fee was still charged" result have no inline equivalent
 * anywhere in the UI. On sonner's 4s default they were the user's only notice
 * that something went wrong, and it expired before a screen reader was likely
 * to have finished announcing it.
 *
 * Import this as `toast` so call sites read the same as the sonner API.
 */
export const notify = {
  success: (message: string, options?: NotifyOptions) => sonner.success(message, options),
  info: (message: string, options?: NotifyOptions) => sonner.info(message, options),
  /** Persists until dismissed. */
  error: (message: string, options?: NotifyOptions) => sonner.error(message, { ...options, duration: Infinity }),
  /** Persists until dismissed. */
  warning: (message: string, options?: NotifyOptions) => sonner.warning(message, { ...options, duration: Infinity }),
}

/** Alias so call sites read identically to the sonner API. */
export { notify as toast }
