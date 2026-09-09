import { useState } from 'react'
import { X } from 'lucide-react'
import { useNoticeStore, type Notice } from '@/store/notice-store'
import { ANNUNCIATOR, ANNUNCIATOR_LEGEND, NOTICE_TONE, type NoticeTone } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

/**
 * The panel's fifth device: a docked annunciator, always present at the base
 * of the chassis (docs/decisions.md §9.2, N4).
 *
 * Every other device in `DESIGN.md` sits IN the panel's plane — this used to
 * be the one exception, floating above the chassis as a sonner toast. It now
 * uses the ordinary in-plane `.panel-plate` shadow like everything else,
 * because it no longer covers anything to separate itself from.
 */

const SEVERITY: Record<NoticeTone, number> = {
  destructive: 0,
  warning: 1,
  success: 2,
  default: 3,
}

function bySeverity(a: Notice, b: Notice) {
  return SEVERITY[a.tone] - SEVERITY[b.tone] || a.createdAt - b.createdAt
}

function NoticeRow({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  return (
    <div
      className={cn(
        'panel-plate relative flex items-start gap-2.5 rounded-md px-3 pb-2.5 pt-2 font-legend text-sm',
        'bg-card',
        NOTICE_TONE[notice.tone],
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className={cn(ANNUNCIATOR_LEGEND, ANNUNCIATOR[notice.tone], 'w-fit')}>
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current opacity-70" />
          {notice.legend}
        </span>
        {/* `break-words`, not just the parent's `min-w-0`: a message with no
            natural break opportunity (e.g. an unbroken base58 alphabet in a
            validation error) overflows the plate's right edge instead of
            wrapping without it — found live, not hypothetical. */}
        <div className="flex flex-col gap-0.5 text-sm leading-snug break-words">
          <span>{notice.message}</span>
          {notice.description && <span className="text-[0.8125rem]">{notice.description}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Dismiss ${notice.legend.toLowerCase()} notice: ${notice.message}`}
        className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </div>
  )
}

export function Annunciator() {
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)
  const [expanded, setExpanded] = useState(false)

  const sorted = [...notices].sort(bySeverity)
  const [primary, ...rest] = sorted

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-2.5">
      {/* N3: several notices show the most severe one plus a count, so an
          outstanding error is never buried under successes and the region
          stays bounded regardless of how many notices exist. N2: quiet is a
          genuinely unlit plate, never a dimmed echo of a dismissed notice —
          docs/decisions.md §9.3 states why that departs from the epic's own
          suggested default. */}
      {/* The whole notice area is ONE live region, expanded list included —
          a notice arriving while already expanded must still be announced
          (US-6). Splitting this into an always-live wrapper plus a plain
          sibling for the expanded rows was tried and rejected: a screen
          reader never learns about anything added to the sibling. */}
      <div aria-live="polite" aria-atomic="false" className="flex flex-col gap-2">
        {!primary ? (
          <div
            aria-hidden="true"
            className="h-[2.375rem] rounded-md border border-dashed border-border/70"
          />
        ) : (
          <NoticeRow notice={primary} onDismiss={() => dismiss(primary.id)} />
        )}
        {rest.length > 0 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="self-start font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
          >
            +{rest.length} more
          </button>
        )}
        {expanded && rest.length > 0 && (
          <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
            {rest.map((notice) => (
              <NoticeRow key={notice.id} notice={notice} onDismiss={() => dismiss(notice.id)} />
            ))}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="self-start font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
            >
              Show less
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
