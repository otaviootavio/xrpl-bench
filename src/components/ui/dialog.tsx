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
 * The viewport constraints here are load-bearing, not cosmetic
 * (docs/decisions.md §6.9): without `max-h`/`overflow-y`/`w-[calc(...)]` this
 * dialog put its own title and submit off-screen at 200% zoom with nothing
 * scrollable. Do not remove them; diff against upstream shadcn before editing
 * and record anything intentionally dropped (guardrail #8 corollary).
 *
 * No `animate-in`/`zoom-in` classes: no animation dependency is installed, so
 * those utilities resolved to nothing and were deleted rather than left as
 * declared-but-absent motion (§6.10).
 */
function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'panel-plate fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg max-h-[calc(100%-2rem)]',
          '-translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-md p-4',
          'shadow-[0_8px_28px_-8px_rgb(0_0_0/0.45)]',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            'absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-sm',
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
  return <div className={cn('flex flex-col gap-1 pr-8', className)} {...props} />
}
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
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
