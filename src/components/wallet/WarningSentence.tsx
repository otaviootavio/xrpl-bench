import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { WarningText } from '@/lib/offline-wallet-words'

/** An approved WARNING shown as a caution Alert, words unchanged: its first
 * sentence is the lit legend, the rest the body (the OS-FR-23 layout). */
export function WarningSentence({ words, id }: { words: string; id?: string }) {
  const split = words.indexOf('. ') + 1
  const title = split > 0 ? words.slice(0, split) : words
  const body = split > 0 ? words.slice(split + 1) : ''
  return (
    <Alert variant="warning" role="none" id={id}>
      <AlertTitle className="max-w-full [overflow-wrap:break-word]">
        <span className="min-w-0">{title}</span>
      </AlertTitle>
      {body && <AlertDescription className="break-words">{body}</AlertDescription>}
    </Alert>
  )
}

/** An approved WARNING already split at its bold sentence (Texts C and D), as the same caution Alert. */
export function WarningAlert({ warning, id }: { warning: WarningText; id?: string }) {
  return (
    <Alert variant="warning" role="none" id={id}>
      <AlertTitle className="max-w-full [overflow-wrap:break-word]">
        <span className="min-w-0">{warning.title}</span>
      </AlertTitle>
      <AlertDescription className="break-words">{warning.body}</AlertDescription>
    </Alert>
  )
}
