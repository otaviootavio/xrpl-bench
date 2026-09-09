import { create } from 'zustand'
import type { NoticeTone } from '@/components/ui/alert'

/**
 * One outstanding notice on the annunciator.
 *
 * `persistent` notices (errors, warnings) never auto-dismiss
 * (docs/decisions.md §6.5); everything else clears itself on a timer set by
 * the caller in `lib/notify.tsx`. Deliberately in-memory only — a notice is a
 * transient report about *this session*, not app state, so it is never
 * persisted to IndexedDB and never survives a reload.
 */
export interface Notice {
  id: string
  tone: NoticeTone
  legend: string
  message: string
  description?: string
  persistent: boolean
  createdAt: number
}

interface NoticeState {
  notices: Notice[]
  push: (notice: Omit<Notice, 'id' | 'createdAt'>) => string
  dismiss: (id: string) => void
}

let sequence = 0

export const useNoticeStore = create<NoticeState>((set) => ({
  notices: [],
  push: (notice) => {
    const id = `notice-${Date.now()}-${sequence++}`
    set((state) => ({ notices: [...state.notices, { ...notice, id, createdAt: Date.now() }] }))
    return id
  },
  dismiss: (id) => set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),
}))
