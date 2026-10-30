import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Axis, Choice } from '@/components/wallet/check-controls'
import { NetworkChoice } from '@/components/wallet/NetworkChoice'
import { minutesLabel } from '@/lib/minutes-label'
import { normalizeWalletName } from '@/lib/wallet-name'
import type { describeOptions, NewOpenCheck, SeedMethod, SigningKind } from '@/lib/crypto/policy'
import { builtInNodes, NETWORKS, type NetworkId } from '@/lib/xrpl/networks'

/**
 * The per-wallet questions (AD-40), split by quiz step: `NameAndNetworkStep`
 * (Label, Network), `RecommendedList` (the read-only list of the pre-selected
 * answers) and `WalkStep` (Seed Method, Node, signature type, Open Check,
 * auto-lock, Signing Check). Presentational only: every answer lives in the caller's state, and
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

/** Step 2: every applicable answer once, as text, with no radio. */
export function RecommendedList(p: WalletQuestionsProps) {
  const rows: [string, string][] = [
    ['Label', normalizeWalletName(p.label) === '' ? 'Named automatically' : normalizeWalletName(p.label)],
    ['Network', NETWORKS[p.network].label],
    ['Node', p.nodeMode === 'builtin' ? 'Built-in Nodes' : p.verifiedNode ? `${p.verifiedNode} (tested)` : 'Your own Node (not tested yet)'],
    ...(p.imported
      ? []
      : ([
          ['Seed Method', p.seedMethod === 'stored' ? 'Stored Seed' : 'Passkey-Derived Seed'],
          ['Signature type', p.algorithm === 'ed25519' ? 'Ed25519' : 'secp256k1'],
        ] as [string, string][])),
    ['Open Check', p.openCheck === 'pin' ? 'App PIN' : p.openCheck === 'passkey' ? 'Passkey' : 'No Open Check'],
    ['Auto-lock', minutesLabel(p.autoLockMinutes)],
    ['Signing Check', p.signing === 'standard' ? 'Standard' : p.signing === 'passkey' ? 'Passkey only' : 'App PIN only'],
  ]
  return (
    <section aria-label="Your setup" className="panel-well grid gap-2 px-3 py-2">
      <dl className="grid gap-y-2 text-sm">
        {rows.map(([term, value]) => (
          <div key={term}>
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {p.network === 'mainnet' && <p className="text-sm">On Mainnet an Open Check is required, and auto-lock is at least 1 minute.</p>}
    </section>
  )
}

/** Step 3: the remaining controls, all visible. */
export function WalkStep(p: WalletQuestionsProps) {
  const { group, options, busy } = p
  const nodes = builtInNodes(p.network)
  return (
    <>
      {!p.imported && (
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
      )}

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

      {!p.imported && (
        <Axis legend="Signature type">
          <Choice name={`${group}-algo`} checked={p.algorithm === 'ed25519'} label="Ed25519" state={{ available: true }} onSelect={() => p.onAlgorithm('ed25519')} />
          <Choice name={`${group}-algo`} checked={p.algorithm === 'secp256k1'} label="secp256k1" state={{ available: true }} onSelect={() => p.onAlgorithm('secp256k1')} />
        </Axis>
      )}

      <Axis legend="Open Check">
        <Choice name={`${group}-open`} checked={p.openCheck === 'pin'} label="App PIN" state={options.openCheck.pin} onSelect={() => p.onOpenCheck('pin')} />
        <Choice name={`${group}-open`} checked={p.openCheck === 'passkey'} label="Passkey" state={options.openCheck.passkey} onSelect={() => p.onOpenCheck('passkey')} />
        <Choice
          name={`${group}-open`}
          checked={p.openCheck === 'none'}
          label="No Open Check"
          detail={options.openCheck.none.available ? 'Nothing is asked to open the wallet. Testnet and Devnet only.' : undefined}
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

      <Axis legend="Signing Check">
        <Choice
          name={`${group}-sign`}
          checked={p.signing === 'standard'}
          label="Standard"
          detail="Nothing is asked for signing."
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

      {p.nodeReason && (
        <p role="alert" className="text-xs text-text-destructive">
          Not used. {p.nodeReason} The built-in Nodes stay selected.
        </p>
      )}
    </>
  )
}
