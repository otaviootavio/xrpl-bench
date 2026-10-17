/** An auto-lock window in plain words. */
export function minutesLabel(minutes: number): string {
  return minutes < 1 ? `${minutes * 60} seconds` : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}
