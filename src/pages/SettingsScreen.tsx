import { ArrowLeftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppSettings } from '@/pages/AppSettings'
import { leaveScreen } from '@/lib/route'

/**
 * `/settings` (AD-36): the app-level Settings as a routed, chooser-side screen.
 * It holds `AppSettings` and nothing else, so it works with no wallet open and
 * mounts no ledger read, no `useActive*` and no `NetworkPlate`. The in-wallet
 * Settings tab is a different surface; the two are never mounted together.
 */
export function SettingsScreen() {
  return (
    <section aria-labelledby="settings-heading" className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" size="sm" className="h-auto min-h-8 w-fit max-w-full whitespace-normal py-1 pointer-coarse:min-h-11" onClick={leaveScreen}>
          <ArrowLeftIcon aria-hidden="true" />
          Wallets
        </Button>
        <h1 id="settings-heading" tabIndex={-1} className="font-legend text-base font-semibold uppercase leading-tight tracking-[0.08em]">
          Settings
        </h1>
      </div>
      <AppSettings />
    </section>
  )
}
