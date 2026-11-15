import { useEffect, useState } from 'react'
import { signedListOf, subscribeSignedList } from '@/lib/crypto/keystore'
import type { SignedRecord } from '@/lib/signed-list'

export type SignedListState = { status: 'loading' } | { status: 'ok'; list: SignedRecord[] } | { status: 'failed' }

/**
 * An Offline Wallet's signed list, read from its local record (no ledger read)
 * and read again after each signing. A failed read is `failed`, never an empty
 * list (OS-FR-16: the list is the guard against paying twice). For display only:
 * the signing path reads the list fresh itself.
 */
export function useSignedList(walletId: string): SignedListState {
  const [state, setState] = useState<SignedListState>({ status: 'loading' })
  useEffect(() => {
    let live = true
    const read = () => {
      signedListOf(walletId).then(
        (list) => live && setState({ status: 'ok', list }),
        () => live && setState({ status: 'failed' }),
      )
    }
    read()
    const off = subscribeSignedList((id) => id === walletId && read())
    return () => {
      live = false
      off()
    }
  }, [walletId])
  return state
}
