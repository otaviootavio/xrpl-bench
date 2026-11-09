import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

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
