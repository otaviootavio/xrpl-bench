import type { ReactNode } from 'react'
import {
  NodeQuestion,
  OpenCheckQuestion,
  SeedMethodQuestion,
  SignatureTypeQuestion,
  SigningCheckQuestion,
  type WalletQuestionsProps,
} from '@/components/wallet/WalletQuestions'
import type { describeOptions } from '@/lib/crypto/policy'

/** What `describeOptions` returns that is a verdict on the whole combination, not a question. */
export const VERDICT_KEYS = ['combination', 'writtenSeedRequired'] as const

/** One question of the walk, one step. `covers` names the `describeOptions` keys
 * the step asks; Node and Signature type are not policy keys and cover none. A
 * test fails when the policy lists a question no entry covers. */
export interface WalkQuestion {
  id: 'node' | 'seed-method' | 'signature-type' | 'open-check' | 'signing-check'
  title: string
  covers: readonly (keyof ReturnType<typeof describeOptions>)[]
  importApplies: boolean
  render: (p: WalletQuestionsProps) => ReactNode
}

/** The walk, in `quiz-steps.md` order. One step per entry. */
export const WALK_QUESTIONS: readonly WalkQuestion[] = [
  { id: 'node', title: 'Node', covers: [], importApplies: true, render: NodeQuestion },
  { id: 'seed-method', title: 'Seed Method', covers: ['seedMethod'], importApplies: false, render: SeedMethodQuestion },
  { id: 'signature-type', title: 'Signature type', covers: [], importApplies: false, render: SignatureTypeQuestion },
  { id: 'open-check', title: 'Open Check and auto-lock', covers: ['openCheck', 'autoLock'], importApplies: true, render: OpenCheckQuestion },
  { id: 'signing-check', title: 'Signing Check', covers: ['signing'], importApplies: true, render: SigningCheckQuestion },
]

/** The walk steps this person will see: Import omits Seed Method and Signature type. */
export function walkQuestions(imported: boolean): WalkQuestion[] {
  return WALK_QUESTIONS.filter((q) => !imported || q.importApplies)
}
