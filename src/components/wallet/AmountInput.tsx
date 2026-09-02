import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface AmountValidation {
  valid: boolean
  error?: string
}

/**
 * Validates an amount string WITHOUT ever converting it to a JS number —
 * regex + string comparisons only, per docs/decisions.md guardrail #4.
 * XRP allows up to 6 decimal places (1 drop = 0.000001 XRP); issued
 * currencies allow up to 15 significant digits (XRPL protocol limit).
 */
// The validator is unit-tested (__tests__/amount-input.test.ts) and must stay
// beside the input whose rules it encodes; moving it would split guardrail #4's
// enforcement from its call site.
// oxlint-disable-next-line react/only-export-components
export function validateAmountString(value: string, kind: 'xrp' | 'issued'): AmountValidation {
  if (value.trim() === '') return { valid: false, error: 'Enter an amount.' }
  if (!/^\d*\.?\d*$/.test(value) || value === '.') return { valid: false, error: 'Enter a valid number.' }
  if (/^0*\.?0*$/.test(value)) return { valid: false, error: 'Amount must be greater than zero.' }

  const [intPart, fracPart = ''] = value.split('.')
  if (kind === 'xrp' && fracPart.length > 6) {
    return { valid: false, error: 'XRP supports at most 6 decimal places.' }
  }
  const significantDigits = (intPart.replace(/^0+/, '') + fracPart).length
  if (kind === 'issued' && significantDigits > 15) {
    return { valid: false, error: 'This currency supports at most 15 significant digits.' }
  }
  return { valid: true }
}

export function AmountInput({
  label,
  value,
  onChange,
  kind,
  suffix,
  error,
  id,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  kind: 'xrp' | 'issued'
  suffix?: string
  error?: string
  id: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex max-w-xs items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            const next = e.target.value
            if (/^\d*\.?\d*$/.test(next)) onChange(next)
          }}
        />
        {suffix && <span className="panel-legend shrink-0">{suffix}</span>}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-text-destructive">
          {error}
        </p>
      )}
      {kind === 'xrp' && !error && (
        <p className="text-xs leading-snug text-muted-foreground">Up to 6 decimal places (1 drop = 0.000001 XRP).</p>
      )}
    </div>
  )
}
