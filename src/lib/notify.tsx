import { useNoticeStore } from '@/store/notice-store'
import { type NoticeTone } from '@/components/ui/alert'

interface NotifyOptions {
  description?: string
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
 * dependency was removed (docs/decisions.md §9, S16) — all 27 call sites keep
 * this exact shape unchanged.
 */
export const notify = {
  success: (message: string, options?: NotifyOptions) => raise('success', message, options),
  info: (message: string, options?: NotifyOptions) => raise('info', message, options),
  /** Persists until dismissed. */
  error: (message: string, options?: NotifyOptions) => raise('error', message, options),
  /** Persists until dismissed. */
  warning: (message: string, options?: NotifyOptions) => raise('warning', message, options),
}

/** Alias so call sites read identically to the pre-S16 sonner-backed API. */
export { notify as toast }
