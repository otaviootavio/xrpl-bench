import { useNoticeStore } from '@/store/notice-store'
import { type NoticeTone } from '@/lib/notice-tone'

interface NotifyOptions {
  description?: string
  /** The user action this reports on. A new attempt of it calls `notify.resolve(action)`. */
  action?: string
}

/**
 * Which Wallet is in view, read when a notice is raised. Installed by the app at
 * module scope (`App.tsx`) rather than imported, the same inversion as the
 * in-flight reporter in `lib/xrpl/writes.ts`: `lib` reports upward, it does not
 * reach into the store (AD-1).
 */
let readActiveWalletId: () => string | null = () => null
export function setNoticeWalletReader(read: () => string | null) {
  readActiveWalletId = read
}

type NotifyType = 'success' | 'info' | 'error' | 'warning'

/**
 * A notice's four types, mapped onto the panel's four notice tones.
 *
 * `info` is the neutral notice, not a fifth colour: the panel has no blue, and
 * inventing one would put an unmeasured pair on screen.
 */
const TONE: Record<NotifyType, NoticeTone> = {
  success: 'success',
  info: 'default',
  error: 'destructive',
  warning: 'warning',
}

/**
 * The lit legend each type carries.
 *
 * An annunciator lights a LEGEND, not a sentence — see `components/Annunciator`
 * for why the caller's message stays out of the lit area. These words are real
 * DOM text, not a `::before`, so the state reaches the accessible name rather
 * than only the eye (docs/decisions.md §6.5).
 */
const LEGEND: Record<NotifyType, string> = {
  success: 'Confirmed',
  info: 'Notice',
  error: 'Error',
  warning: 'Caution',
}

/**
 * Errors and warnings persist until dismissed; everything else clears itself.
 * This preserves docs/decisions.md §6.5 exactly — the rule now lives here
 * because it is per-type, not because any provider forces it to.
 */
const AUTO_DISMISS_MS = 5000

function raise(type: NotifyType, message: string, options?: NotifyOptions) {
  const persistent = type === 'error' || type === 'warning'
  const id = useNoticeStore.getState().push({
    tone: TONE[type],
    legend: LEGEND[type],
    message,
    description: options?.description,
    persistent,
    walletId: readActiveWalletId() ?? undefined,
    action: options?.action,
  })
  if (!persistent) {
    setTimeout(() => useNoticeStore.getState().dismiss(id), AUTO_DISMISS_MS)
  }
  return id
}

/**
 * The app's single notification entry point.
 *
 * Errors and warnings NEVER auto-dismiss; successes and info do
 * (docs/decisions.md §6.5). An unlock failure, a failed faucet request and a
 * `tec*` "the fee was still charged" result have no inline equivalent
 * anywhere in the UI, so they stay until the user has actually seen and
 * dismissed them rather than expiring on a timer a screen reader may not have
 * finished reading.
 *
 * Import this as `toast` so call sites read the same as before the sonner
 * dependency was removed (docs/decisions.md §9, S16) — all twenty-five call
 * sites keep this exact shape unchanged.
 */
export const notify = {
  success: (message: string, options?: NotifyOptions) => raise('success', message, options),
  info: (message: string, options?: NotifyOptions) => raise('info', message, options),
  /** Persists until dismissed. */
  error: (message: string, options?: NotifyOptions) => raise('error', message, options),
  /** Persists until dismissed. */
  warning: (message: string, options?: NotifyOptions) => raise('warning', message, options),
  /**
   * Clear a notice this module raised, by the id `raise` returned.
   *
   * Part of the surface because AD-8 makes dismissal part of `notify`: a
   * persistent notice the app itself must take back — the update notice the
   * user declines — would otherwise force `hooks/useAppUpdate` to reach into
   * the notice store, which was the only caller outside this module doing so.
   * The store is still touched by `raise`'s own auto-dismiss above, and read by
   * `components/Annunciator.tsx`, which renders it; neither is a way around the
   * funnel.
   */
  dismiss: (id: string) => useNoticeStore.getState().dismiss(id),
  /**
   * A new attempt of `action` starts: what the last one reported is no longer
   * current. Errors still never expire on a timer (docs/decisions.md §6.5); they
   * are taken back only when the thing they said stops being true.
   */
  resolve: (action: string) => useNoticeStore.getState().dismissAction(action),
  /**
   * The active Wallet changed: a notice about another Wallet is no longer about
   * this screen. Notices about the app itself (no Wallet) stay.
   */
  scopeToWallet: (activeWalletId: string | null) => useNoticeStore.getState().dismissExceptWallet(activeWalletId),
}

/** Alias so call sites read identically to the pre-S16 sonner-backed API. */
export { notify as toast }
