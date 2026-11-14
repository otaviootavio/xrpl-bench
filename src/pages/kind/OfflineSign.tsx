import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { QrScanner } from '@/components/wallet/QrScanner'
import { HandoffPlate } from '@/components/wallet/HandoffPlate'
import { KeyWarning } from '@/components/wallet/KeyStateRows'
import { EarlierSigningRecord } from '@/components/wallet/EarlierSigningRecord'
import { WRAPPING_KEYS } from '@/components/wallet/wrapping-keys'
import { useSignedList } from '@/hooks/useSignedList'
import { usePrompts } from '@/hooks/usePrompts'
import { useWakeLock } from '@/hooks/useWakeLock'
import { ledgerSeenOf, noteLedgerSeen, noteSigned, SigningCheckError, type KeyWalletMeta } from '@/lib/crypto/keystore'
import { ledgerJumpWarning } from '@/lib/offline-round'
import { judgeUnsigned, recordOfJudged, signJudged, USUAL_WINDOW, type FieldRow, type JudgedUnsigned, type SignedUnsigned } from '@/lib/unsigned-judge'
import { latestSameBuild } from '@/lib/signed-list'
import { ASF_DISABLE_MASTER } from '@/lib/qr-codec'
import * as W from '@/lib/offline-round-words'
import { SIGN_KEY, fill } from '@/lib/transmit-words'
import { OFFLINE_SCREENS } from '@/lib/wallet-kind-words'
import { NETWORKS } from '@/lib/xrpl/networks'
import { useAppStore, useWalletOpenKey } from '@/store/app-store'
import { isKeyWallet } from '@/lib/wallet-meta'
import { KindScreenPlate } from './KindScreenPlate'

type HeadingRef = React.RefObject<HTMLHeadingElement | null>

type State =
  | { kind: 'scanning'; refusal?: string; notSigned?: boolean }
  | { kind: 'review'; judged: JudgedUnsigned; warning: 'lower' | 'too-high' | null }
  | { kind: 'signed'; signed: SignedUnsigned; window: number }

/**
 * The Offline Wallet's Sign screen (P-3; OS-FR-18, EXPERIENCE "Transmitter-builds
 * round"): it scans an Unsigned Transaction from the Synced Transmitter, refuses
 * in P-16/P-17 under the scanner what it cannot show in words or must not sign,
 * shows every field and flag with the Network in large type, the window and the
 * cautions, signs exactly what it showed, records the signing in the signed list
 * and shows the signed QR. It reads nothing from the ledger. Nothing is kept: a
 * lock, or leaving the screen, drops the review and the signed QR (the Unsigned
 * code can be scanned again; a re-signing of the same transaction is the same blob).
 */
export function OfflineSign({ wallet }: { wallet: KeyWalletMeta }) {
  const [state, setState] = useState<State>({ kind: 'scanning' })
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const scannerRef = useRef<HTMLDivElement | null>(null)
  const open = useAppStore((s) => wallet.lockId in s.openLocks)
  const generation = useRef(0)
  useWakeLock(state.kind !== 'scanning')

  // A lock drops everything on this screen (EXPERIENCE "Offline locked mid-round": nothing is
  // kept): a same-component state adjustment during render, and a new generation so a
  // signing or a read that settles after the lock shows nothing.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setState({ kind: 'scanning' })
  }
  useEffect(() => {
    if (!open) generation.current += 1
  }, [open])

  // A new state with a heading takes focus there; a refusal leaves focus on the scanner (EXPERIENCE "Focus").
  useEffect(() => {
    if (state.kind === 'scanning') {
      if (state.refusal) scannerRef.current?.querySelector<HTMLElement>('button, textarea')?.focus()
      return
    }
    headingRef.current?.focus()
  }, [state])

  async function onPayload(text: string) {
    if (state.kind !== 'scanning') return
    const judged = judgeUnsigned(text, wallet)
    if (!judged.ok) return setState({ kind: 'scanning', refusal: judged.reason })
    const mine = generation.current
    let warning: 'lower' | 'too-high' | null = null
    try {
      // The same highest-seen check as the other route, from the envelope's index (P-14).
      warning = ledgerJumpWarning(judged.ledgerIndex, await ledgerSeenOf(wallet.id), Date.now(), wallet.network)
    } catch {
      // A failed read of it skips the comparison that time, never refuses (story 6).
    }
    if (generation.current === mine) setState({ kind: 'review', judged, warning })
  }

  return (
    <KindScreenPlate title={OFFLINE_SCREENS.signFromTransmitter.title}>
      <div className={`flex min-w-0 flex-col gap-3 ${WRAPPING_KEYS}`}>
        {state.kind === 'scanning' && (
          <>
            <div ref={scannerRef}>
              <QrScanner onPayload={(t) => void onPayload(t)} label="a code" />
            </div>
            <div role="alert">
              {state.refusal && (
                <div className="flex flex-col gap-1 text-sm text-text-destructive">
                  <p>{W.NOT_SIGNED}</p>
                  <p className="[overflow-wrap:anywhere]">{state.refusal}</p>
                </div>
              )}
            </div>
            <div role="status" className="text-sm">
              {state.notSigned && W.NOT_SIGNED}
            </div>
          </>
        )}
        {state.kind === 'review' && (
          <SigningReview
            wallet={wallet}
            judged={state.judged}
            warning={state.warning}
            headingRef={headingRef}
            generation={generation}
            onDecline={() => setState({ kind: 'scanning', notSigned: true })}
            onSigned={(signed) => setState({ kind: 'signed', signed, window: state.judged.window })}
          />
        )}
        {state.kind === 'signed' && <Signed wallet={wallet} signed={state.signed} window={state.window} headingRef={headingRef} />}
      </div>
    </KindScreenPlate>
  )
}

/**
 * The signing review (EXPERIENCE "Signing review", Transmitter-builds): the well with
 * the Network in large type (focused), P-13 in ledgers and P-51; any Same Build record
 * (P-19); the field list of the transaction that will be signed, a P-53 caution under
 * each risky row, W3 directly above a new Regular Key and P-30 or W1 under it; the
 * signing key; P-15 and P-14 when they apply; W4's sentence and the Mainnet typed
 * phrase for master key off; then Sign and Do not sign.
 */
function SigningReview({
  wallet,
  judged,
  warning,
  headingRef,
  generation,
  onDecline,
  onSigned,
}: {
  wallet: KeyWalletMeta
  judged: JudgedUnsigned
  warning: 'lower' | 'too-high' | null
  headingRef: HeadingRef
  generation: React.RefObject<number>
  onDecline: () => void
  onSigned: (signed: SignedUnsigned) => void
}) {
  const prompts = usePrompts()
  const openKey = useWalletOpenKey(wallet.id)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const label = NETWORKS[wallet.network].label
  const tx = judged.tx as unknown as Record<string, unknown>
  const turningOff = tx.TransactionType === 'AccountSet' && tx.SetFlag === ASF_DISABLE_MASTER
  const [phrase, setPhrase] = useState('')
  const held = turningOff && wallet.network === 'mainnet' && phrase.trim().replace(/\s+/g, ' ').toLowerCase() !== W.SHIPPED_KEYS.offPhrase
  const phraseId = `sign-off-phrase-${wallet.id}`
  // Nothing signs without a readable signed list (story 7): P-16 stands alone, with no Sign key.
  const listUnreadable = useSignedList(wallet.id).status === 'failed'

  async function sign() {
    if (held) return
    setBusy(true)
    setFailure(null)
    const mine = generation.current
    const stillOpen = () => generation.current === mine && wallet.lockId in useAppStore.getState().openLocks
    try {
      const signed = await signJudged(wallet, judged, { openKey, prompts })
      // A lock during the Signing Check: the signed QR is not shown.
      if (!stillOpen()) return
      // The signed list first (OS-FR-16): a signing it does not hold is never shown. A failed write drops the blob.
      try {
        await noteSigned(wallet.id, recordOfJudged(judged, signed))
      } catch {
        setFailure(W.NOT_SIGNED)
        setBusy(false)
        return
      }
      if (!stillOpen()) return
      onSigned(signed)
      // Only an index actually signed with becomes the highest seen (P-14).
      await noteLedgerSeen(wallet.id, judged.ledgerIndex, signed.signedAt).catch(() => {})
    } catch (err) {
      setFailure(err instanceof SigningCheckError ? err.message : W.NOT_SIGNED)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* The signing-network well: the fixed string is the heading, one text node, and takes focus. */}
      <section className="panel-well flex min-w-0 flex-col gap-2 rounded-md px-4 pb-4 pt-3">
        <h2 ref={headingRef} tabIndex={-1} className="font-data text-[clamp(1.75rem,9vw,3rem)] font-medium leading-[1.02] tracking-[-0.035em] [overflow-wrap:anywhere]">
          {fill(W.SIGNING_FOR, label)}
        </h2>
        <div className="flex flex-col gap-0.5 border-t border-white/15 pt-2 text-xs text-readout-muted">
          <span>{fill(W.TIME_LIMIT_LEDGERS, judged.window)}</span>
          <span className="font-data">{fill(W.VALID_UNTIL_LEDGER, judged.tx.LastLedgerSequence as number)}</span>
        </div>
      </section>
      <SameBuild walletId={wallet.id} buildHash={judged.buildHash} />
      <FieldRows rows={judged.rows} txType={tx.TransactionType as string} />
      <dl className="grid min-w-0 gap-0.5">
        <dt className="panel-legend">{W.SIGNING_KEY}</dt>
        <dd className="font-data text-[0.8125rem] leading-relaxed tracking-tight [overflow-wrap:anywhere]">{wallet.keyAddress}</dd>
      </dl>
      {judged.window > USUAL_WINDOW && <KeyWarning words={fill(W.LONGER_THAN_USUAL, judged.window)} />}
      {warning && (
        <Alert variant="warning" role="none">
          <AlertDescription className="flex flex-col gap-1">
            <span>{warning === 'lower' ? W.LEDGER_LOWER : W.LEDGER_TOO_HIGH}</span>
            <span>{W.CHECK_THE_TRANSMITTER}</span>
          </AlertDescription>
        </Alert>
      )}
      {turningOff && <KeyWarning words={W.W4_SENTENCE} />}
      {turningOff && wallet.network === 'mainnet' && (
        <div className="grid gap-1.5">
          <Label htmlFor={phraseId}>{W.SHIPPED_KEYS.offPhraseLabel}</Label>
          <Input id={phraseId} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </div>
      )}
      <div role="alert">{failure && <p className="text-sm text-text-destructive">{failure}</p>}</div>
      <div className="flex flex-wrap gap-2">
        {!listUnreadable && (
          <Button type="button" disabled={busy} aria-disabled={held ? true : undefined} aria-describedby={held ? phraseId : undefined} onClick={() => void sign()}>
            {SIGN_KEY}
          </Button>
        )}
        <Button type="button" variant="outline" disabled={busy} onClick={onDecline}>
          {W.DO_NOT_SIGN}
        </Button>
      </div>
    </div>
  )
}

/**
 * One row per field and flag in the ledger's words (P-52), each risky row's P-53
 * caution directly under it. A new Regular Key has W3 directly above it ("the key
 * below"), then whether it is a Wallet on this device: P-30, or W1 (route-checks).
 */
function FieldRows({ rows, txType }: { rows: FieldRow[]; txType: string }) {
  const wallets = useAppStore((s) => s.wallets)
  return (
    <dl className="grid min-w-0 gap-2">
      {rows.map((row) => {
        const newKey = txType === 'SetRegularKey' && row.name === 'RegularKey'
        const here = newKey ? wallets.filter(isKeyWallet).find((w) => w.keyAddress === row.value) : undefined
        return (
          <div key={row.name} className="grid min-w-0 gap-1.5">
            {newKey && <KeyWarning words={W.W3_SENTENCE} />}
            <div className="grid min-w-0 gap-0.5">
              <dt className="panel-legend [overflow-wrap:anywhere]">{row.name}</dt>
              <dd className="whitespace-pre-line font-data text-[0.8125rem] leading-relaxed tracking-tight [overflow-wrap:anywhere]">{row.value}</dd>
            </div>
            {row.cautions.map((c, i) => (
              <KeyWarning key={i} words={c} />
            ))}
            {newKey &&
              (here ? (
                <Alert role="none">
                  <AlertDescription className="break-words">{fill(W.KEY_IS_WALLET_HERE, here.label)}</AlertDescription>
                </Alert>
              ) : (
                <KeyWarning words={W.W1_SENTENCE} />
              ))}
          </div>
        )
      })}
    </dl>
  )
}

/** P-19 and the earlier-signing record, when this Wallet signed the same transaction before by either route. A failed list read is P-16, never silence. */
function SameBuild({ walletId, buildHash }: { walletId: string; buildHash: string }) {
  const signed = useSignedList(walletId)
  if (signed.status === 'failed') {
    return (
      <Alert variant="destructive" role="none">
        <AlertDescription>{W.NOT_SIGNED}</AlertDescription>
      </Alert>
    )
  }
  const earlier = signed.status === 'ok' ? latestSameBuild(signed.list, buildHash) : null
  if (!earlier) return null
  return (
    <Alert role="none">
      <AlertDescription className="flex min-w-0 flex-col gap-2">
        <p>{W.SIGNED_BEFORE}</p>
        <EarlierSigningRecord record={earlier} />
      </AlertDescription>
    </Alert>
  )
}

/** The signed QR (OS-FR-11): no Send key. P-12 with the window in minutes and the local signing time. */
function Signed({ wallet, signed, window, headingRef }: { wallet: KeyWalletMeta; signed: SignedUnsigned; window: number; headingRef: HeadingRef }) {
  const time = new Date(signed.signedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <HandoffPlate heading={W.SIGNED_TRANSACTION_TITLE} headingRef={headingRef} network={wallet.network} text={signed.text}>
      <p className="text-sm">{W.SIGNED_NOT_SENT}</p>
      <p className="text-sm">{fill(W.SIGNED_VALID_UNTIL, signed.lastLedgerSequence, W.windowMinutes(window), time)}</p>
    </HandoffPlate>
  )
}
