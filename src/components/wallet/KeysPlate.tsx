import { useEffect, useId, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isValidClassicAddress } from 'xrpl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AddressScan } from '@/components/wallet/AddressScan'
import { ConfigPlate } from '@/components/wallet/ConfigPlate'
import { KeyStateRows, KeyWarning } from '@/components/wallet/KeyStateRows'
import { RegularKeyNotes } from '@/components/wallet/KeyWarnings'
import { ResultView } from '@/components/wallet/TransmitStep'
import { useLiveKeyState } from '@/hooks/useLiveKeyState'
import { usePrompts } from '@/hooks/usePrompts'
import type { KeyWalletMeta } from '@/lib/crypto/keystore'
import { runKeyAction, testRegularKey, type KeyAction, type KeyActionResult } from '@/lib/key-actions'
import { endsSetRegularKey, masterOffToBlackHole, regularKeyTester } from '@/lib/key-warnings'
import * as W from '@/lib/offline-round-words'
import { useAppStore, useWalletOpenKey } from '@/store/app-store'

type Section = 'set' | 'remove' | 'off' | 'on'

const OPENERS: { section: Section; words: string }[] = [
  { section: 'set', words: W.SET_A_REGULAR_KEY },
  { section: 'remove', words: W.REMOVE_THE_REGULAR_KEY },
  { section: 'off', words: W.TURN_OFF_THE_MASTER_KEY },
  { section: 'on', words: W.TURN_ON_THE_MASTER_KEY },
]

const normalise = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The Online Wallet's key plate (offline signing story 11, OS-FR-21; EXPERIENCE "Local
 * settings plates, per kind", the Keys row). Its title is the approved "Key state" (the
 * spine's plate name "Keys" is not an approved string). It shows the Account's key state
 * from live reads (P-29 on a failed read, nothing while reading) and the four P-47 keys.
 * Each key opens its part in place; the part's own key of the same words signs. Every
 * warning shows before the Signing Check and none blocks: W1/P-30 and W2 under a new
 * address, W5 when a set key ends, and before master key off "Test the Regular Key", W2
 * when the Regular Key is a black hole, W4's sentence and, on Mainnet, the typed phrase
 * (irreversible-class). Nothing is refused by the app: the ledger answers, in P-31's words.
 * A validated set offers P-54. Mount only for an open Online Wallet.
 */
export function KeysPlate({ wallet }: { wallet: KeyWalletMeta }) {
  const queryClient = useQueryClient()
  const prompts = usePrompts()
  const openKey = useWalletOpenKey(wallet.id)
  const wallets = useAppStore((s) => s.wallets)
  const openLocks = useAppStore((s) => s.openLocks)
  const keyState = useLiveKeyState(wallet.network, wallet.address, wallet.node)
  const known = keyState !== null && keyState !== 'unknown' ? keyState : null
  const [section, setSection] = useState<Section | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<KeyActionResult | null>(null)
  const [address, setAddress] = useState('')
  const [phrase, setPhrase] = useState('')
  const [test, setTest] = useState<KeyActionResult | 'elsewhere' | null>(null)
  const resultRef = useRef<HTMLHeadingElement | null>(null)
  const testRef = useRef<HTMLHeadingElement | null>(null)
  const id = useId()
  const valid = isValidClassicAddress(address)
  const mainnet = wallet.network === 'mainnet'
  const held = section === 'off' && mainnet && normalise(phrase) !== W.SHIPPED_KEYS.offPhrase

  useEffect(() => {
    if (result && result.kind !== 'refused') resultRef.current?.focus()
  }, [result])
  useEffect(() => {
    if (test && test !== 'elsewhere' && test.kind !== 'refused') testRef.current?.focus()
  }, [test])

  function choose(next: Section) {
    if (busy) return
    setSection((s) => (s === next ? null : next))
    setResult(null)
    setTest(null)
    setPhrase('')
  }

  async function run(action: KeyAction) {
    if (busy || held) return
    setBusy(true)
    setResult(null)
    try {
      const r = await runKeyAction(wallet, action, { queryClient, openKey, prompts })
      setResult(r)
      if (r.kind !== 'refused') {
        setSection(null)
        setAddress('')
        setPhrase('')
      }
    } finally {
      setBusy(false)
    }
  }

  async function runTest() {
    if (busy) return
    const tester = regularKeyTester(wallets, wallet, known?.regular_key, openLocks)
    if (!tester) {
      setTest('elsewhere')
      return
    }
    setBusy(true)
    setTest(null)
    try {
      setTest(await testRegularKey(wallet, tester, { queryClient, openKey: openLocks[tester.lockId]?.key ?? null, prompts }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfigPlate title={W.KEY_STATE}>
      {keyState !== null && <KeyStateRows keyState={keyState} headingLevel={null} />}
      <div className="flex flex-wrap gap-2">
        {OPENERS.map(({ section: s, words }) => (
          <Button
            key={s}
            type="button"
            variant={s === 'off' ? 'danger' : 'outline'}
            size="sm"
            aria-expanded={section === s}
            aria-controls={section === s ? `${id}-part` : undefined}
            disabled={busy}
            onClick={() => choose(s)}
          >
            {words}
          </Button>
        ))}
      </div>

      {section === 'set' && (
        <div id={`${id}-part`} className="flex min-w-0 flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-key`}>{W.SHIPPED_KEYS.regularKeyAddress}</Label>
            <Input
              id={`${id}-key`}
              value={address}
              onChange={(e) => setAddress(e.target.value.trim())}
              placeholder="r..."
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={address.length > 0 && !valid}
              aria-describedby={address.length > 0 && !valid ? `${id}-key-error` : undefined}
            />
            {address.length > 0 && !valid && (
              <p id={`${id}-key-error`} className="text-sm text-text-destructive">
                {W.SHIPPED.invalidAddress}
              </p>
            )}
            <AddressScan onAddress={setAddress} />
          </div>
          {valid && <RegularKeyNotes address={address} />}
          {valid && endsSetRegularKey(address, keyState) && <KeyWarning words={W.W5_SENTENCE} />}
          <Button
            type="button"
            className="w-fit"
            disabled={busy}
            aria-disabled={!valid ? true : undefined}
            aria-describedby={address.length > 0 && !valid ? `${id}-key-error` : undefined}
            onClick={() => valid && void run({ type: 'set', regularKey: address })}
          >
            {W.SET_A_REGULAR_KEY}
          </Button>
        </div>
      )}

      {section === 'remove' && (
        <div id={`${id}-part`} className="flex min-w-0 flex-col gap-3">
          {endsSetRegularKey(null, keyState) && <KeyWarning words={W.W5_SENTENCE} />}
          <Button type="button" className="w-fit" disabled={busy} onClick={() => void run({ type: 'remove' })}>
            {W.REMOVE_THE_REGULAR_KEY}
          </Button>
        </div>
      )}

      {section === 'off' && (
        <div id={`${id}-part`} className="flex min-w-0 flex-col gap-3">
          {/* W4: the test first, offered and never required; then W2 and W4's sentence. */}
          <div className="flex min-w-0 flex-col items-start gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void runTest()}>
              {W.TEST_THE_REGULAR_KEY}
            </Button>
            <div role="status" className="min-w-0 self-stretch text-sm">
              {test === 'elsewhere' && W.TEST_ELSEWHERE}
            </div>
            {test && test !== 'elsewhere' && test.kind === 'refused' && (
              <p role="alert" className="text-sm text-text-destructive">
                {test.text}
              </p>
            )}
            {test && test !== 'elsewhere' && test.kind !== 'refused' && (
              <div className="min-w-0 self-stretch">
                <ResultView result={test} headingRef={testRef} breakableCode />
              </div>
            )}
          </div>
          {masterOffToBlackHole(keyState) && <KeyWarning words={W.W2_SENTENCE} />}
          <KeyWarning words={W.W4_SENTENCE} />
          {mainnet && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-phrase`}>{W.SHIPPED_KEYS.offPhraseLabel}</Label>
              <Input
                id={`${id}-phrase`}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          )}
          <Button
            type="button"
            variant="destructive"
            className="w-fit"
            disabled={busy}
            aria-disabled={held ? true : undefined}
            aria-describedby={held ? `${id}-phrase` : undefined}
            onClick={() => void run({ type: 'master', enable: false })}
          >
            {W.TURN_OFF_THE_MASTER_KEY}
          </Button>
        </div>
      )}

      {section === 'on' && (
        <div id={`${id}-part`} className="flex min-w-0 flex-col gap-3">
          <Button type="button" className="w-fit" disabled={busy} onClick={() => void run({ type: 'master', enable: true })}>
            {W.TURN_ON_THE_MASTER_KEY}
          </Button>
        </div>
      )}

      {result?.kind === 'refused' && (
        <p role="alert" className="text-sm text-text-destructive">
          {result.text}
        </p>
      )}
      {result && result.kind !== 'refused' && (
        <div className="min-w-0">
          <ResultView result={result} headingRef={resultRef} breakableCode />
        </div>
      )}
    </ConfigPlate>
  )
}
