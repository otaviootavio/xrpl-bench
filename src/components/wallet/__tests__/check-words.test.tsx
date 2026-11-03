/** @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as words from '@/components/wallet/check-words'
import { OpenCheckQuestion, SigningCheckQuestion, type WalletQuestionsProps } from '@/components/wallet/WalletQuestions'
import { describeOptions } from '@/lib/crypto/policy'
import { NETWORK_RESET_NOTE } from '@/components/wallet/network-reset'
import { answerRows } from '@/components/wallet/walk-questions'

afterEach(cleanup)

const wordCount = (sentence: string) => sentence.split(/\s+/).filter(Boolean).length
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)

function props(network: 'testnet' | 'mainnet'): WalletQuestionsProps {
  const noop = () => {}
  return {
    group: 'q',
    options: describeOptions({
      network,
      seedMethod: 'stored',
      openCheck: 'pin',
      autoLockMinutes: 5,
      signing: 'standard',
      passkey: 'yes',
      origin: 'localhost',
      canConfirmWrittenSeed: true,
    }),
    busy: false,
    origin: 'localhost',
    label: '',
    onLabelChange: noop,
    labelError: null,
    network,
    onNetworkChange: noop,
    nodeMode: 'builtin',
    onNodeMode: noop,
    nodeDraft: '',
    onNodeDraft: noop,
    verifiedNode: null,
    nodeReason: null,
    nodeBusy: false,
    onTestNode: noop,
    seedMethod: 'stored',
    onSelectStored: noop,
    onSelectDerived: noop,
    passkeyChoice: 'new',
    onPasskeyChoice: noop,
    algorithm: 'ed25519',
    onAlgorithm: noop,
    openCheck: 'pin',
    onOpenCheck: noop,
    autoLockMinutes: 5,
    onAutoLockMinutes: noop,
    signing: 'standard',
    onSigning: noop,
  }
}

const legends = (c: HTMLElement) => [...c.querySelectorAll('legend')].map((l) => l.textContent)
const radioLabels = (c: HTMLElement) => [...c.querySelectorAll('input[type="radio"]')].map((r) => r.closest('label')?.textContent ?? '')

describe('plain wording for the checks', () => {
  it('every string check-words.ts exports is short and says nothing about signing data', () => {
    const strings = (Object.values(words) as unknown[]).filter((v): v is string => typeof v === 'string')
    expect(strings.length).toBeGreaterThanOrEqual(5)
    for (const text of [
      ...strings,
      ...(['pin', 'passkey', 'none'] as const).map((k) => words.openCheckWords(k)),
      ...(['standard', 'passkey', 'pin'] as const).map((k) => words.signingWords(k)),
    ]) {
      for (const s of sentences(text)) expect(wordCount(s), s).toBeLessThan(21)
      expect(text).not.toMatch(/sign(s|ing)? (data|message)/i)
    }
  })

  it('the Open Check step shows the question and answers from the list, each sentence under 21 words', () => {
    const { container } = render(<OpenCheckQuestion {...props('testnet')} />)
    expect(legends(container)[0]).toBe(words.OPEN_CHECK_QUESTION)
    expect(radioLabels(container).some((l) => l.startsWith(words.NO_OPEN_CHECK_ANSWER))).toBe(true)
    expect(container.textContent).toContain(words.NO_OPEN_CHECK_DETAIL)
    for (const el of container.querySelectorAll('p, legend, label, span')) {
      if (el.children.length > 0) continue
      for (const s of sentences(el.textContent ?? '')) expect(wordCount(s), s).toBeLessThan(21)
    }
    expect(container.textContent).not.toMatch(/sign(s|ing)? (data|message)/i)
  })

  it('the Mainnet sentence on the Open Check step is under 21 words', () => {
    const { getByText } = render(<OpenCheckQuestion {...props('mainnet')} />)
    for (const s of sentences(getByText(/^On Mainnet/).textContent ?? '')) expect(wordCount(s), s).toBeLessThan(21)
  })

  it('the Signing Check step shows the question and the Standard answer from the list', () => {
    const { container } = render(<SigningCheckQuestion {...props('testnet')} />)
    expect(legends(container)).toEqual([words.SIGNING_CHECK_QUESTION])
    const labels = radioLabels(container)
    expect(labels.some((l) => l.startsWith(words.STANDARD_SIGNING_ANSWER))).toBe(true)
    expect(labels.some((l) => l.startsWith(words.signingWords('passkey')))).toBe(true)
    expect(labels.some((l) => l.startsWith(words.signingWords('pin')))).toBe(true)
    expect(container.textContent).not.toMatch(/sign(s|ing)? (data|message)/i)
    for (const el of container.querySelectorAll('p, legend, label, span')) {
      if (el.children.length > 0) continue
      for (const s of sentences(el.textContent ?? '')) expect(wordCount(s), s).toBeLessThan(21)
    }
  })
})

describe('the Review and the Network reset line use short sentences', () => {
  it('every Review value, note and the Network reset line is under 21 words, and none says a check signs data', () => {
    const texts = [
      ...answerRows({ ...props('testnet'), seedMethod: 'passkey-derived' }).flatMap((r) => [r.term, r.value]),
      ...(['pin', 'passkey', 'none'] as const).map((openCheck) => answerRows({ ...props('testnet'), openCheck }).find((r) => r.term === words.OPEN_CHECK_QUESTION)!.value),
      NETWORK_RESET_NOTE,
      words.NETWORK_LOCKED_NOTE,
      words.IMPORT_MAINNET_FACT,
      ...(['mainnet', 'testnet', 'devnet'] as const).flatMap((n) => [words.createConsequence(n, false), words.createConsequence(n, true)]),
      ...answerRows({ ...props('testnet') }).map((r) => r.note ?? ''),
    ]
    for (const text of texts) {
      for (const s of sentences(text)) expect(wordCount(s), s).toBeLessThan(21)
      expect(text).not.toMatch(/sign(s|ing)? (data|message)/i)
    }
  })
})

describe('the Mainnet Import fact', () => {
  it('is the one agreed sentence', () => {
    expect(words.IMPORT_MAINNET_FACT).toBe('A Seed you used on another Network is the same key on Mainnet.')
  })

  it('shows for an Import on Mainnet only', () => {
    for (const network of ['mainnet', 'testnet', 'devnet']) {
      for (const imported of [true, false]) {
        const expected = network === 'mainnet' && imported ? words.IMPORT_MAINNET_FACT : null
        expect(words.importMainnetFact(network, imported), `${network} ${imported}`).toBe(expected)
      }
    }
  })
})
