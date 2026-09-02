import { cn } from '@/lib/utils'

/**
 * A reading not yet taken.
 *
 * The pulse is honoured only when the user accepts motion: this app has no
 * `prefers-reduced-motion` guard anywhere else by policy (docs/decisions.md
 * §6.10), so anything that animates carries its own.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-pulse rounded-sm bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  )
}

export { Skeleton }
