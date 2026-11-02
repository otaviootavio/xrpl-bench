import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfigPlate } from '@/components/wallet/ConfigPlate'
import { AddressLink } from '@/components/wallet/AddressLink'
import { useAddressBook } from '@/store/app-store'
import { counterpartyKey, tagNotRecorded } from '@/store/address-book'
import { NETWORKS } from '@/lib/xrpl/networks'

/** The most rows shown before "Show all". */
export const ADDRESS_BOOK_CAP = 10

/**
 * This wallet's own Address Book (AD-50): the addresses it has paid, newest last in send order.
 * It reads one list, keyed by the wallet entered, and no other wallet's. Read-only: no add, edit
 * or delete controls. Shows the first 10 in stored order; "Show all N" expands in place.
 */
export function AddressBookPlate({ walletId }: { walletId: string }) {
  const book = useAddressBook(walletId)
  const [showAll, setShowAll] = useState(false)
  const listId = useId()
  const capped = book.length > ADDRESS_BOOK_CAP
  const rows = capped && !showAll ? book.slice(0, ADDRESS_BOOK_CAP) : book

  return (
    <ConfigPlate title="Address Book">
      {book.length === 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">No saved addresses yet</p>
          <p className="text-sm text-muted-foreground">
            Addresses you send to are saved here automatically, so the wallet can warn you the first time you send
            somewhere new.
          </p>
        </div>
      )}
      {/* One row per counterparty: the (network, address, tag) triple, keyed by the same identity
          that decides it (AD-6). Each row names its network in words, and its explorer link goes to
          that network. The tag carries its own text legend, so it is told apart from the address by
          words, not colour (NFR-6). An entry saved before networks were recorded says so in words
          for both its network and its tag: it may stand for a payment made with a tag never stored. */}
      <div id={listId} className="flex min-w-0 flex-col gap-2">
        {rows.map((e) => (
          <dl key={counterpartyKey(e)} className="panel-plate flex min-w-0 flex-col gap-1.5 rounded-md p-2">
            {e.label !== undefined && (
              <div className="min-w-0">
                <dt className="panel-legend">Label</dt>
                <dd className="mt-0.5 text-sm break-words">{e.label}</dd>
              </div>
            )}
            <div className="min-w-0">
              <dt className="panel-legend">Network</dt>
              <dd className="mt-0.5 text-sm">{e.network !== undefined ? NETWORKS[e.network].label : 'Not recorded'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="panel-legend">Address</dt>
              <dd className="mt-0.5 min-w-0">
                <AddressLink address={e.address} network={e.network} truncate={false} />
              </dd>
            </div>
            {e.destinationTag !== undefined && (
              <div className="min-w-0">
                <dt className="panel-legend">Destination tag</dt>
                <dd className="mt-0.5 font-data text-sm tracking-tight break-all">{e.destinationTag}</dd>
              </div>
            )}
            {tagNotRecorded(e) && (
              <div className="min-w-0">
                <dt className="panel-legend">Destination tag</dt>
                <dd className="mt-0.5 text-sm">Not recorded</dd>
              </div>
            )}
          </dl>
        ))}
      </div>
      {capped && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-8 w-fit max-w-full whitespace-normal py-1 pointer-coarse:min-h-11"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? `Show first ${ADDRESS_BOOK_CAP}` : `Show all ${book.length}`}
        </Button>
      )}
    </ConfigPlate>
  )
}
