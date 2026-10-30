import { useEffect, useRef, type ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Axis, Choice } from '@/components/wallet/check-controls'
import {
  NO_OPEN_CHECK_ANSWER,
  NO_OPEN_CHECK_DETAIL,
  OPEN_CHECK_QUESTION,
  SIGNING_CHECK_QUESTION,
  STANDARD_SIGNING_ANSWER,
} from '@/components/wallet/check-words'
import { NetworkChoice } from '@/components/wallet/NetworkChoice'
import { minutesLabel } from '@/lib/minutes-label'
import type { describeOptions, NewOpenCheck, SeedMethod, SigningKind } from '@/lib/crypto/policy'
import { builtInNodes, type NetworkId } from '@/lib/xrpl/networks'

/**
 * The per-wallet questions (AD-40), split by quiz step: `NameAndNetworkStep`
 * (Label, Network) and the walk, one step per question (`WALK_QUESTIONS`: Node, Seed
 * Method, signature type, Open Check with auto-lock, Signing Check).
 * Presentational only: every answer lives in the caller's state, and
 * which answers are legal, and why one is not, arrive as `options`, the result of
 * `describeOptions` (AD-28). An unavailable answer is `aria-disabled` with its
 * reason as visible text, never hidden, never colour alone.
 */
export interface WalletQuestionsProps {
  /** A unique id prefix for the controls. */
  group: string
  options: ReturnType<typeof describeOptions>
  busy: boolean
  /** The origin the build's rpId is bound to, named in the Passkey-Derived warning. */
  origin: string | undefined

  label: string
  onLabelChange: (label: string) => void
  /** Visible text for an invalid typed name; the field points at it. */
  labelError: string | null

  network: NetworkId
  onNetworkChange: (network: NetworkId) => void

  nodeMode: 'builtin' | 'custom'
  onNodeMode: (mode: 'builtin' | 'custom') => void
  nodeDraft: string
  onNodeDraft: (draft: string) => void
  verifiedNode: string | null
  nodeReason: string | null
  nodeBusy: boolean
  onTestNode: () => void

  seedMethod: SeedMethod
  onSelectStored: () => void
  onSelectDerived: () => void
  passkeyChoice: 'new' | 'existing'
  onPasskeyChoice: (choice: 'new' | 'existing') => void

  algorithm: 'ed25519' | 'secp256k1'
  onAlgorithm: (algorithm: 'ed25519' | 'secp256k1') => void

  openCheck: NewOpenCheck
  onOpenCheck: (check: NewOpenCheck) => void
  autoLockMinutes: number
  onAutoLockMinutes: (minutes: number) => void
  signing: SigningKind
  onSigning: (kind: SigningKind) => void

  /** An import: the Seed fixes the Seed Method and the signature type, so neither is asked or summarised. */
  imported?: boolean
}

/** Step 1: Label and Network. Nothing that depends on Network is shown. */
export function NameAndNetworkStep(p: WalletQuestionsProps) {
  const { group, busy } = p
  const labelErrorId = `${group}-label-error`
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor={`${group}-label`}>Label</Label>
        <Input
          id={`${group}-label`}
          value={p.label}
          onChange={(e) => p.onLabelChange(e.target.value)}
          placeholder="Savings"
          disabled={busy}
          aria-invalid={p.labelError ? true : undefined}
          aria-describedby={p.labelError ? labelErrorId : undefined}
        />
        {p.labelError && (
          <p id={labelErrorId} className="text-sm text-text-destructive">
            {p.labelError}
          </p>
        )}
      </div>

      <NetworkChoice value={p.network} onChange={p.onNetworkChange} disabled={busy || p.nodeBusy} />
    </>
  )
}

export type WalletPath = 'create' | 'import'

/** Host-supplied control for the first question of the Add wallet screen. */
export interface PathChoiceProps {
  value: WalletPath
  onChange: (value: WalletPath) => void
  disabled?: boolean
  /** The choice just changed and the flow remounted: the picked radio takes focus. */
  focusOnMount?: boolean
  /** Called once focus has been taken, so a later remount does not take it again. */
  onFocusTaken?: () => void
}

/** Create or Import: the first question, asked on step 1 only. Not part of the walk. */
export function PathChoice({ group, path }: { group: string; path: PathChoiceProps }) {
  const box = useRef<HTMLDivElement>(null)
  const { focusOnMount, onFocusTaken } = path
  useEffect(() => {
    if (!focusOnMount) return
    box.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus()
    onFocusTaken?.()
    // Mount only: a change of the flag later must not move focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div ref={box}>
      <Axis legend="Create or import">
        <Choice name={`${group}-path`} checked={path.value === 'create'} label="Create a new wallet" state={{ available: true }} disabled={path.disabled} onSelect={() => path.onChange('create')} />
        <Choice name={`${group}-path`} checked={path.value === 'import'} label="Import a wallet" state={{ available: true }} disabled={path.disabled} onSelect={() => path.onChange('import')} />
      </Axis>
    </div>
  )
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

export function NodeQuestion(p: WalletQuestionsProps) {
  const { group, busy } = p
  const nodes = builtInNodes(p.network)
  return (
    <>
      <Lead>The Node is the server this wallet reads the ledger from and sends its transactions to.</Lead>
      <Axis legend="Node">
        <Choice
          name={`${group}-node`}
          checked={p.nodeMode === 'builtin'}
          label="Built-in Nodes"
          state={{ available: true }}
          detail={nodes.join(', ')}
          onSelect={() => p.onNodeMode('builtin')}
        />
        <Choice
          name={`${group}-node`}
          checked={p.nodeMode === 'custom'}
          label="A Node you choose"
          state={{ available: true }}
          onSelect={() => p.onNodeMode('custom')}
        />
        {p.nodeMode === 'custom' && (
          <div className="grid gap-1.5 text-xs">
            <Label htmlFor={`${group}-node-url`}>Node address (wss://)</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id={`${group}-node-url`}
                value={p.nodeDraft}
                onChange={(e) => p.onNodeDraft(e.target.value)}
                placeholder="wss://node.example.com"
                autoComplete="off"
                spellCheck={false}
                disabled={p.nodeBusy || busy}
                className="min-w-0 flex-1"
              />
              <Button type="button" size="sm" variant="outline" onClick={p.onTestNode} disabled={p.nodeBusy || busy || p.nodeDraft.trim() === ''}>
                {p.nodeBusy ? 'Checking…' : 'Test this Node'}
              </Button>
            </div>
            {p.verifiedNode && <p className="text-muted-foreground">This Node answers for this network and will be used.</p>}
          </div>
        )}
      </Axis>

      {p.nodeReason && (
        <p role="alert" className="text-xs text-text-destructive">
          Not used. {p.nodeReason} The built-in Nodes stay selected.
        </p>
      )}
    </>
  )
}

export function SeedMethodQuestion(p: WalletQuestionsProps) {
  const { group, options } = p
  return (
    <>
      <Axis legend="Seed Method">
        <Choice
          name={`${group}-seed`}
          checked={p.seedMethod === 'stored'}
          label="Stored Seed"
          detail="A Seed is generated here and kept on this device, encrypted."
          state={options.seedMethod.stored}
          onSelect={p.onSelectStored}
        />
        <Choice
          name={`${group}-seed`}
          checked={p.seedMethod === 'passkey-derived'}
          label="Passkey-Derived Seed"
          detail="No Seed is stored: it is computed from your passkey each time it is needed."
          state={options.seedMethod['passkey-derived']}
          onSelect={p.onSelectDerived}
        />
      </Axis>

      {p.seedMethod === 'passkey-derived' && (
        <>
          <Axis legend="Passkey">
            <Choice
              name={`${group}-passkey`}
              checked={p.passkeyChoice === 'new'}
              label="Create a new passkey"
              detail="The passkey is named after this wallet."
              state={{ available: true }}
              onSelect={() => p.onPasskeyChoice('new')}
            />
            <Choice
              name={`${group}-passkey`}
              checked={p.passkeyChoice === 'existing'}
              label="Use an existing passkey"
              detail="Your browser lists the passkeys on this device for this app."
              state={{ available: true }}
              onSelect={() => p.onPasskeyChoice('existing')}
            />
          </Axis>
          <Alert variant="warning">
            <AlertTitle>This Seed depends on the app's domain</AlertTitle>
            <AlertDescription>
              {p.origin ? `Your passkey is tied to ${p.origin}. ` : 'Your passkey is tied to the address this app is served from. '}
              If the app's domain ever changes, this wallet cannot be opened from the passkey. It could then be recovered only with a written Seed or a Controlling Wallet.
            </AlertDescription>
          </Alert>
        </>
      )}
    </>
  )
}

export function SignatureTypeQuestion(p: WalletQuestionsProps) {
  const { group } = p
  return (
    <>
      <Lead>The signature type is fixed once the wallet exists. Most wallets and services accept either.</Lead>
      <Axis legend="Signature type">
        <Choice name={`${group}-algo`} checked={p.algorithm === 'ed25519'} label="Ed25519" state={{ available: true }} onSelect={() => p.onAlgorithm('ed25519')} />
        <Choice name={`${group}-algo`} checked={p.algorithm === 'secp256k1'} label="secp256k1" state={{ available: true }} onSelect={() => p.onAlgorithm('secp256k1')} />
      </Axis>
    </>
  )
}

export function OpenCheckQuestion(p: WalletQuestionsProps) {
  const { group, options } = p
  return (
    <>
      <Lead>The Open Check is what is asked to open this wallet. Auto-lock closes it again after a while without use.</Lead>
      {p.network === 'mainnet' && <p className="text-sm">On Mainnet an Open Check is required, and auto-lock is at least 1 minute.</p>}
      <Axis legend={OPEN_CHECK_QUESTION}>
        <Choice name={`${group}-open`} checked={p.openCheck === 'pin'} label="App PIN" detail="Asks for your App PIN to open the wallet." state={options.openCheck.pin} onSelect={() => p.onOpenCheck('pin')} />
        <Choice name={`${group}-open`} checked={p.openCheck === 'passkey'} label="Passkey" detail="Asks for your passkey to open the wallet." state={options.openCheck.passkey} onSelect={() => p.onOpenCheck('passkey')} />
        <Choice
          name={`${group}-open`}
          checked={p.openCheck === 'none'}
          label={NO_OPEN_CHECK_ANSWER}
          detail={options.openCheck.none.available ? NO_OPEN_CHECK_DETAIL : undefined}
          state={options.openCheck.none}
          onSelect={() => p.onOpenCheck('none')}
        />
      </Axis>

      <Axis legend="Auto-lock after inactivity">
        {options.autoLock.map((choice) => (
          <Choice
            key={choice.minutes}
            name={`${group}-lock`}
            checked={p.autoLockMinutes === choice.minutes}
            label={minutesLabel(choice.minutes)}
            state={choice}
            onSelect={() => p.onAutoLockMinutes(choice.minutes)}
          />
        ))}
      </Axis>
    </>
  )
}

export function SigningCheckQuestion(p: WalletQuestionsProps) {
  const { group, options } = p
  return (
    <Axis legend={SIGNING_CHECK_QUESTION}>
      <Choice
        name={`${group}-sign`}
        checked={p.signing === 'standard'}
        label={STANDARD_SIGNING_ANSWER}
        state={options.signing.standard}
        onSelect={() => p.onSigning('standard')}
      />
      <Choice
        name={`${group}-sign`}
        checked={p.signing === 'passkey'}
        label="Passkey only"
        detail="Asks for your passkey on every signature."
        state={options.signing.passkey}
        onSelect={() => p.onSigning('passkey')}
      />
      <Choice
        name={`${group}-sign`}
        checked={p.signing === 'pin'}
        label="App PIN only"
        detail="Asks for your App PIN on every signature."
        state={options.signing.pin}
        onSelect={() => p.onSigning('pin')}
      />
    </Axis>
  )
}
