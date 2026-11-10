/**
 * Every key inside wraps its label and grows, as a dialog footer's keys do
 * (`dialog.tsx` FOOTER_KEYS): at 320px with 200% text a one-line "Make the code
 * larger" ran past the plate. Descendant form, for the round screens' key rows.
 */
export const WRAPPING_KEYS =
  '[&_[data-slot=button]]:h-auto [&_[data-slot=button]]:min-h-9 pointer-coarse:[&_[data-slot=button]]:min-h-11 ' +
  '[&_[data-slot=button]]:max-w-full [&_[data-slot=button]]:whitespace-normal [&_[data-slot=button]]:py-1.5'
