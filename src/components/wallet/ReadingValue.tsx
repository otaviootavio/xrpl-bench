import type { ReadState } from '@/lib/read-state'

/**
 * One reading in a readout row (`<dt>` beside it), rendered from its read
 * state. Three renderings for the four states:
 *
 * - `ok` — the figure, in the data face with tabular numerals.
 * - `pending` — an ellipsis in the same face. The PENDING treatment only: it
 *   may not stand in for a failure, which is exactly how a failed read used to
 *   hide.
 * - `failed` / `not-activated` — the word "Unavailable". Words, not a numeral,
 *   so the data face and tabular numerals step aside; `text-readout-muted` is
 *   the pair `check:contrast` measures on the well.
 *
 * `format` turns the read value into the string shown. Money arrives as a
 * string and is formatted only here, at the render boundary.
 */
export function ReadingValue({ state, format }: { state: ReadState<string>; format: (value: string) => string }) {
  if (state.status === 'ok') return <dd className="font-data text-base tracking-tight">{format(state.value)}</dd>
  if (state.status === 'pending') return <dd className="font-data text-base tracking-tight">…</dd>
  return <dd className="font-legend text-sm text-readout-muted">Unavailable</dd>
}
