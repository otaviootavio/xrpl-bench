import type { ReactNode } from 'react'
import {
  NodeQuestion,
  OpenCheckQuestion,
  SeedMethodQuestion,
  SignatureTypeQuestion,
  SigningCheckQuestion,
  type AnswerRow,
  type WalletQuestionsProps,
} from '@/components/wallet/WalletQuestions'
import { NETWORK_LOCKED_NOTE, OPEN_CHECK_QUESTION, openCheckWords, SIGNING_CHECK_QUESTION, signingWords } from '@/components/wallet/check-words'
import { minutesLabel } from '@/lib/minutes-label'
import { normalizeWalletName } from '@/lib/wallet-name'
import type { describeOptions, NewOpenCheck, SeedMethod, SigningKind } from '@/lib/crypto/policy'
import { NETWORKS, type NetworkId } from '@/lib/xrpl/networks'

/** The term each answer goes by, on the Review. The two checks read their
 * wording from `check-words.ts`, so one answer is never worded two ways. */
export const QUESTION_TERMS = {
  Label: 'Label',
  Network: 'Network',
  Node: 'Node',
  'Seed Method': 'Seed Method',
  Passkey: 'Passkey',
  'Signature type': 'Signature type',
  'Open Check': OPEN_CHECK_QUESTION,
  'Auto-lock': 'Auto-lock',
  'Signing Check': SIGNING_CHECK_QUESTION,
} as const

const noStop = (text: string) => text.replace(/\.$/, '')

/** One formatter per answer: the Review reads them. */
export const formatLabel = (label: string) => (normalizeWalletName(label) === '' ? 'Named automatically' : normalizeWalletName(label))
export const formatNetwork = (network: NetworkId) => NETWORKS[network].label
export const formatNode = (nodeMode: 'builtin' | 'custom', verifiedNode: string | null) =>
  nodeMode === 'builtin' ? 'Built-in Nodes' : verifiedNode ? `${verifiedNode} (tested)` : 'Your own Node (not tested yet)'
export const formatSeedMethod = (m: SeedMethod) => (m === 'stored' ? 'Stored Seed' : 'Passkey-Derived Seed')
export const formatPasskeyChoice = (c: 'new' | 'existing') => (c === 'new' ? 'New passkey' : 'Existing passkey')
export const formatAlgorithm = (a: 'ed25519' | 'secp256k1') => (a === 'ed25519' ? 'Ed25519' : 'secp256k1')
export const formatOpenCheck = (c: NewOpenCheck) => noStop(openCheckWords(c))
export const formatAutoLock = minutesLabel
export const formatSigning = (s: SigningKind) => noStop(signingWords(s))

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
  /** The rows this question adds to the Review, each tagged with this step. */
  summary: (p: WalletQuestionsProps) => AnswerRow[]
  render: (p: WalletQuestionsProps) => ReactNode
}

/** The walk, in `quiz-steps.md` order. One step per entry. */
export const WALK_QUESTIONS: readonly WalkQuestion[] = [
  {
    id: 'node',
    title: 'Node',
    covers: [],
    importApplies: true,
    summary: (p) => [{ step: 'node', term: QUESTION_TERMS.Node, value: formatNode(p.nodeMode, p.verifiedNode), data: p.nodeMode === 'custom' && !!p.verifiedNode }],
    render: NodeQuestion,
  },
  {
    id: 'seed-method',
    title: 'Seed Method',
    covers: ['seedMethod'],
    importApplies: false,
    summary: (p) => [
      { step: 'seed-method', term: QUESTION_TERMS['Seed Method'], value: formatSeedMethod(p.seedMethod) },
      ...(p.seedMethod === 'passkey-derived' ? [{ step: 'seed-method', term: QUESTION_TERMS.Passkey, value: formatPasskeyChoice(p.passkeyChoice) }] : []),
    ],
    render: SeedMethodQuestion,
  },
  {
    id: 'signature-type',
    title: 'Signature type',
    covers: [],
    importApplies: false,
    summary: (p) => [{ step: 'signature-type', term: QUESTION_TERMS['Signature type'], value: formatAlgorithm(p.algorithm) }],
    render: SignatureTypeQuestion,
  },
  {
    id: 'open-check',
    title: 'Authentication to open the wallet, and auto-lock',
    covers: ['openCheck', 'autoLock'],
    importApplies: true,
    summary: (p) => [
      { step: 'open-check', term: QUESTION_TERMS['Open Check'], value: formatOpenCheck(p.openCheck) },
      { step: 'open-check', term: QUESTION_TERMS['Auto-lock'], value: formatAutoLock(p.autoLockMinutes), data: true },
    ],
    render: OpenCheckQuestion,
  },
  {
    id: 'signing-check',
    title: 'Authentication to sign a transaction',
    covers: ['signing'],
    importApplies: true,
    summary: (p) => [{ step: 'signing-check', term: QUESTION_TERMS['Signing Check'], value: formatSigning(p.signing) }],
    render: SigningCheckQuestion,
  },
]

/** The walk steps this person will see: Import omits Seed Method and Signature type. */
export function walkQuestions(imported: boolean): WalkQuestion[] {
  return WALK_QUESTIONS.filter((q) => !imported || q.importApplies)
}

/** Every applicable answer once, in the order they were asked: Label and Network
 * from the first step, then each walk question's own rows. The Review renders this list. */
export function answerRows(p: WalletQuestionsProps): AnswerRow[] {
  return [
    { step: 'name-network', term: QUESTION_TERMS.Label, value: formatLabel(p.label) },
    { term: QUESTION_TERMS.Network, value: formatNetwork(p.network), note: NETWORK_LOCKED_NOTE },
    ...walkQuestions(!!p.imported).flatMap((q) => q.summary(p)),
  ]
}
