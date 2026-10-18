import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn('fixed inset-0 z-50 bg-black/55', className)} {...props} />
}

/**
 * A panel module that swings out over the chassis.
 *
 * Two variants. `dialog` (the default) is the centred module: right for a
 * confirm of a few lines. `sheet` is the same module anchored to the bottom
 * edge below `sm`, with the footer stuck to the sheet's bottom so the commit
 * action stays reachable while the body scrolls; from `sm` up it is the same
 * centred module as `dialog`. A sheet is for one short task (a PIN, one field, a
 * review), never a multi-section form or a multi-step flow.
 *
 * The viewport constraints here are load-bearing, not cosmetic
 * (docs/decisions.md §6.9): without `max-h`/`overflow-y`/`w-[calc(...)]` this
 * dialog put its own title and submit off-screen at 200% zoom with nothing
 * scrollable. Do not remove them; diff against upstream shadcn before editing
 * and record anything intentionally dropped (guardrail #8 corollary). The sheet
 * measures in `dvh` and clears the safe-area insets, so a mobile browser's
 * collapsing toolbars and the home indicator never cover the footer.
 *
 * Only the inner body scrolls; the close button sits outside it, so it never
 * scrolls away.
 *
 * No `animate-in`/`zoom-in` classes: no animation dependency is installed, so
 * those utilities resolved to nothing and were deleted rather than left as
 * declared-but-absent motion (§6.10).
 */
function DialogContent({
  className,
  children,
  variant = 'dialog',
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { variant?: 'dialog' | 'sheet' }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-variant={variant}
        className={cn(
          'group/dialog panel-plate fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg max-h-[calc(100%-2rem)] flex-col',
          '-translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md',
          'shadow-[0_8px_28px_-8px_rgb(0_0_0/0.45)]',
          variant === 'sheet' &&
            'max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] max-sm:rounded-b-none',
          className,
        )}
        {...props}
      >
        <div data-slot="dialog-body" className="grid min-h-0 gap-4 overflow-y-auto overscroll-contain p-4 [&_.panel-legend]:text-xs">
          {children}
        </div>
        <DialogPrimitive.Close
          className={cn(
            'absolute right-3 top-3 inline-flex size-7 pointer-coarse:right-1 pointer-coarse:top-1 pointer-coarse:size-11 items-center justify-center rounded-sm',
            'text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
          )}
        >
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 pr-8 pointer-coarse:pr-12', className)} {...props} />
}
/** In a sheet below `sm` the footer sticks to the bottom of the scrolling body,
 * with a rule and a shadow above it: the shadow is the cue that content runs on
 * beneath. Its bottom padding clears the home indicator. */
const SHEET_FOOTER =
  'group-data-[variant=sheet]/dialog:max-sm:sticky group-data-[variant=sheet]/dialog:max-sm:bottom-0 group-data-[variant=sheet]/dialog:max-sm:z-10 ' +
  'group-data-[variant=sheet]/dialog:max-sm:-mx-4 group-data-[variant=sheet]/dialog:max-sm:-mb-4 group-data-[variant=sheet]/dialog:max-sm:border-t ' +
  'group-data-[variant=sheet]/dialog:max-sm:border-border group-data-[variant=sheet]/dialog:max-sm:bg-card group-data-[variant=sheet]/dialog:max-sm:px-4 ' +
  'group-data-[variant=sheet]/dialog:max-sm:pt-3 group-data-[variant=sheet]/dialog:max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] ' +
  'group-data-[variant=sheet]/dialog:max-sm:shadow-[0_-10px_10px_-10px_rgb(0_0_0/0.4)]'

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', SHEET_FOOTER, className)} {...props} />
}
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('font-legend text-base font-semibold uppercase leading-tight tracking-[0.08em]', className)}
      {...props}
    />
  )
}
function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm leading-snug text-muted-foreground', className)} {...props} />
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
