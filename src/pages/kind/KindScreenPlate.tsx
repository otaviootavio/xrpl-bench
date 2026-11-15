import type { ReactNode } from 'react'

/**
 * One screen of an Offline or Transmitter Wallet (OS-FR-1): a plate whose placard
 * title is the screen's h1. Unlike the Online tabs, the title is visible: a screen
 * not built yet shows its approved title and nothing else, and a hidden one would
 * leave the panel blank.
 */
export function KindScreenPlate({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="panel-plate mx-auto flex w-full min-w-0 max-w-lg flex-col gap-3 rounded-md px-4 pb-4 pt-3 [overflow-wrap:anywhere]">
      <h1 className="panel-legend">{title}</h1>
      {children}
    </section>
  )
}
