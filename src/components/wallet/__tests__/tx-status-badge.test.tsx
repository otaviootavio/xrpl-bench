/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TxStatusBadge } from '../TxStatusBadge'

/** The wording a result code reads as. An unreadable result (`'unknown'`) is
 * never "Failed": that would invite a resend that pays twice. */
describe('TxStatusBadge', () => {
  afterEach(cleanup)

  it('reads a validated unknown result as "Result not read", not Failed', () => {
    render(<TxStatusBadge resultCode="unknown" validated />)
    expect(screen.getByText('Result not read')).toBeTruthy()
    expect(screen.queryByText(/Failed/)).toBeNull()
  })

  it('reads an unvalidated entry as Pending, whatever its code', () => {
    render(<TxStatusBadge resultCode="" validated={false} />)
    expect(screen.getByText('Pending')).toBeTruthy()
  })

  it.each([
    ['tesSUCCESS', 'Validated'],
    ['expired', 'Expired — not applied'],
    ['tecPATH_DRY', 'Failed — fee charged'],
    ['tefPAST_SEQ', 'Failed'],
  ])('keeps %s reading as before (%s)', (code, words) => {
    render(<TxStatusBadge resultCode={code} validated />)
    expect(screen.getByText(words, { exact: false })).toBeTruthy()
  })
})

describe('breakableCode (offline signing story 11, the Online key plate)', () => {
  it('lets the code break inside itself only when asked; by default it stays unbreakable', () => {
    const { unmount } = render(<TxStatusBadge resultCode="tecNO_ALTERNATIVE_KEY" validated />)
    expect(screen.getByText('(tecNO_ALTERNATIVE_KEY)').className).toBe('whitespace-nowrap')
    unmount()
    render(<TxStatusBadge resultCode="tecNO_ALTERNATIVE_KEY" validated breakableCode />)
    const code = screen.getByText('(tecNO_ALTERNATIVE_KEY)')
    expect(code.className).toBe('[overflow-wrap:anywhere]')
    expect(code.parentElement?.className).toBe('min-w-0')
  })
})
