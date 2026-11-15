import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConsequenceLines } from '@/components/wallet/KindChoice'
import { NodeQuestion } from '@/components/wallet/WalletQuestions'
import { ScreenFooter, TaskScreen } from '@/components/wallet/TaskScreen'
import { WarningAlert, WarningSentence } from '@/components/wallet/WarningSentence'
import { useLeaveBlocker } from '@/hooks/useRoute'
import { usePrompts } from '@/hooks/usePrompts'
import { changeToOfflineWallet, changeToOnlineWallet, describeCheckFailure, KindChangeRefusedError, listWallets, type KeyWalletMeta } from '@/lib/crypto/keystore'
import { markKindChanged } from '@/lib/kind-change-result'
import {
  CHANGE_TO_OFFLINE,
  CHANGE_TO_ONLINE,
  ONLINE_PHRASE,
  ONLINE_PHRASE_LABEL,
  PASSKEY_SEED_NOT_OFFLINE,
  TEXT_C,
  TEXT_D,
} from '@/lib/kind-change-words'
import { resetToWalletShell } from '@/lib/route'
import { transmitterSyncedTo } from '@/lib/same-address'
import { forgetLedgerOf } from '@/lib/teardown'
import { SAME_ADDRESS_TRANSMITTER_HERE } from '@/lib/transmitter-words'
import { verifyNode } from '@/lib/xrpl/client'
import { useAppStore, useWalletOpenKey } from '@/store/app-store'

/** Shipped words: a write that failed changed nothing (the Sync plate's). */
const NOTHING_CHANGED = 'Nothing was changed.'
/** Shipped words: the quiz's refusal of a custom Node that was not tested. */
const TEST_THE_NODE_FIRST = 'Test the custom Node first, or use the built-in Nodes.'

const normalise = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase()

/** Text C's never-online steps under their lead line: on the change screen, and again on the result. */
export function NeverOnlineSteps() {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <p className="break-words">{TEXT_C.stepsLead}</p>
      <ol className="flex list-decimal flex-col gap-1 pl-5">
        {TEXT_C.steps.map((step) => (
          <li key={step} className="break-words">
            {step}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Puts the new meta in the store (the tree swaps to the new kind's shell here), then
 * replaces the screen's location with that Wallet's shell, so a screen entered by its
 * URL lands there too. */
function publish(meta: KeyWalletMeta) {
  const { wallets, setWallets } = useAppStore.getState()
  flushSync(() => setWallets(wallets.map((w) => (w.id === meta.id ? meta : w))))
  resetToWalletShell(meta.id)
}

/** The Wallet's lock is still open: a change is never written for a closed one. */
const lockOpen = (wallet: KeyWalletMeta) => wallet.lockId in useAppStore.getState().openLocks

/**
 * A write threw. A typed refusal (before any write) changed nothing. Anything else may
 * have been thrown after the write, so the vault is read again and what it stores is
 * shown: the stored meta when the change is there, else `null`.
 */
async function landedAnyway(err: unknown, walletId: string, kind: 'online' | 'offline'): Promise<KeyWalletMeta | null> {
  if (err instanceof KindChangeRefusedError) return null
  try {
    const stored = (await listWallets()).find((w) => w.id === walletId)
    return stored && stored.kind === kind ? stored : null
  } catch {
    return null
  }
}

/**
 * "Change to an offline wallet" (OS-FR-5): Text C in full, then a plain confirm.
 * The keystore decides; this screen shows the words. A Passkey-Derived Seed Wallet
 * gets P-63 and no working confirm (OS-FR-8). A Transmitter synced to this address
 * here gets P-8's second form, a warning, never a refusal.
 *
 * After the write: the result marker is set, the screen leaves, the store takes the
 * Offline meta (the Online shell and its live hooks unmount), and the Wallet's
 * cached reads and socket go (`forgetLedgerOf`). Local settings shows the result.
 */
export function ChangeToOfflineScreen({ wallet, onClose, backLabel }: { wallet: KeyWalletMeta; onClose: () => void; backLabel: string }) {
  const queryClient = useQueryClient()
  const wallets = useAppStore((s) => s.wallets)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const id = useId()
  useLeaveBlocker(busy)
  const derived = wallet.seedMethod === 'passkey-derived'
  const sameAsTransmitter = transmitterSyncedTo(wallets, wallet.address)

  async function confirm() {
    if (busy || derived) return
    setProblem(null)
    setBusy(true)
    let meta: KeyWalletMeta | null
    try {
      meta = lockOpen(wallet) ? await changeToOfflineWallet(wallet.id) : null
    } catch (err) {
      meta = await landedAnyway(err, wallet.id, 'offline')
    }
    if (!meta) {
      setProblem(NOTHING_CHANGED)
      setBusy(false)
      return
    }
    markKindChanged({ walletId: wallet.id, to: 'offline' })
    publish(meta)
    forgetLedgerOf(queryClient, wallet)
  }

  return (
    <TaskScreen title={CHANGE_TO_OFFLINE} backLabel={backLabel} onBack={onClose} locked={busy}>
      <ConsequenceLines lines={TEXT_C.lines} />
      <WarningAlert warning={TEXT_C.keyWarning} />
      <NeverOnlineSteps />
      <WarningAlert warning={TEXT_C.offlineWarning} />
      {sameAsTransmitter && <WarningSentence words={SAME_ADDRESS_TRANSMITTER_HERE} />}
      {derived && (
        <p id={`${id}-reason`} className="text-sm">
          {PASSKEY_SEED_NOT_OFFLINE}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-text-destructive">
          {problem}
        </p>
      )}
      <ScreenFooter>
        {/* Shipped words: Edit checks' footer. */}
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          aria-disabled={busy || derived ? true : undefined}
          aria-describedby={derived ? `${id}-reason` : undefined}
          onClick={() => void confirm()}
        >
          {CHANGE_TO_OFFLINE}
        </Button>
      </ScreenFooter>
    </TaskScreen>
  )
}

/**
 * "Change to an online wallet" (OS-FR-6), irreversible-class: Text D, a Node, and
 * today's master-key confirm. On Mainnet the confirm key is held until P-39's
 * phrase is typed; then the keystore runs the Wallet's Signing Check and only then
 * writes. The same address on the same Network as another Wallet is refused with
 * P-35, by the keystore. Nothing here reads the ledger until Test this Node.
 */
export function ChangeToOnlineScreen({ wallet, onClose, backLabel }: { wallet: KeyWalletMeta; onClose: () => void; backLabel: string }) {
  const prompts = usePrompts()
  const openKey = useWalletOpenKey(wallet.id)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [phrase, setPhrase] = useState('')
  const [nodeMode, setNodeMode] = useState<'builtin' | 'custom'>('builtin')
  const [nodeDraft, setNodeDraft] = useState('')
  const [verifiedNode, setVerifiedNode] = useState<string | null>(null)
  const [nodeReason, setNodeReason] = useState<string | null>(null)
  const [nodeBusy, setNodeBusy] = useState(false)
  const draftRef = useRef('')
  const id = useId()
  useLeaveBlocker(busy)
  const mainnet = wallet.network === 'mainnet'
  const phraseId = `${id}-phrase`
  const held = mainnet && normalise(phrase) !== ONLINE_PHRASE

  async function testNode() {
    const tested = nodeDraft.trim()
    setNodeBusy(true)
    setNodeReason(null)
    setVerifiedNode(null)
    try {
      await verifyNode(wallet.network, tested)
      if (draftRef.current.trim() === tested) setVerifiedNode(tested)
    } catch (err: unknown) {
      setNodeMode('builtin')
      setNodeReason(err instanceof Error ? err.message : 'This Node could not be checked.')
    } finally {
      setNodeBusy(false)
    }
  }

  async function confirm() {
    if (busy || held) return
    setProblem(null)
    if (nodeMode === 'custom' && !verifiedNode) {
      setProblem(TEST_THE_NODE_FIRST)
      return
    }
    setBusy(true)
    try {
      const node = nodeMode === 'custom' && verifiedNode ? { node: verifiedNode } : {}
      const result = await changeToOnlineWallet(wallet.id, { ...node, stillOpen: () => lockOpen(wallet) }, { openKey, prompts })
      if (result.status === 'refused') {
        setProblem(result.reason)
        setBusy(false)
        return
      }
      if (result.status !== 'ok') {
        setProblem(describeCheckFailure(result))
        setBusy(false)
        return
      }
      markKindChanged({ walletId: wallet.id, to: 'online' })
      publish(result.value)
    } catch (err) {
      const stored = await landedAnyway(err, wallet.id, 'online')
      if (stored) {
        markKindChanged({ walletId: wallet.id, to: 'online' })
        publish(stored)
        return
      }
      setProblem(NOTHING_CHANGED)
      setBusy(false)
    }
  }

  return (
    <TaskScreen title={CHANGE_TO_ONLINE} backLabel={backLabel} onBack={onClose} locked={busy}>
      <ConsequenceLines lines={TEXT_D.lines} />
      {TEXT_D.warnings.map((w) => (
        <WarningAlert key={w.title} warning={w} />
      ))}
      <section aria-labelledby={`${id}-node`} className="flex min-w-0 flex-col gap-2">
        <h2 id={`${id}-node`} className="panel-legend">
          Node
        </h2>
        <NodeQuestion
          group={`${id}-q`}
          busy={busy}
          network={wallet.network}
          nodeMode={nodeMode}
          onNodeMode={setNodeMode}
          nodeDraft={nodeDraft}
          onNodeDraft={(d) => {
            draftRef.current = d
            setNodeDraft(d)
            setVerifiedNode(null)
          }}
          verifiedNode={verifiedNode}
          nodeReason={nodeReason}
          nodeBusy={nodeBusy}
          onTestNode={() => void testNode()}
        />
      </section>
      {mainnet && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={phraseId}>{ONLINE_PHRASE_LABEL}</Label>
          <Input
            id={phraseId}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
          />
        </div>
      )}
      {problem && (
        <p role="alert" className="break-words text-sm text-text-destructive">
          {problem}
        </p>
      )}
      <ScreenFooter>
        {/* Shipped words: Edit checks' footer. */}
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          aria-disabled={busy || held ? true : undefined}
          aria-describedby={held ? phraseId : undefined}
          onClick={() => void confirm()}
        >
          {CHANGE_TO_ONLINE}
        </Button>
      </ScreenFooter>
    </TaskScreen>
  )
}
