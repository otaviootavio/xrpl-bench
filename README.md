# XRPL Bench

A self-custody wallet for the [XRP Ledger](https://xrpl.org), delivered as an
installable PWA. Keys are generated and stored on your device, encrypted at rest,
and unlocked with a passkey or a PIN. There is no backend — the ledger is the
only server.

> **Source-available, not open source.** This project is licensed under
> [FSL-1.1-ALv2](./LICENSE.md): you may read, run, modify and share it, but not
> use it to compete commercially with it. Each released version converts to
> Apache 2.0 two years after its release. FSL is **not** an OSI-approved
> open-source licence, and this project does not describe itself as open source.

---

## What it does

- Create or import a wallet; mandatory seed backup before you can continue
- Send and receive XRP and issued currencies (tokens)
- XRP balance with **spendable and reserved shown separately**, read live from
  `server_state` rather than hardcoded
- Trust lines: open, edit the limit, close
- Transaction history with per-transaction detail
- Mainnet and Testnet, with faucet funding on Testnet
- Multiple wallets on one device, one active at a time
- Every address and transaction hash links to the network's official block
  explorer, so nothing has to be taken on trust

**Deliberately not included** — this is a wallet, not an exchange: no swaps or
DEX UI, no fiat on/off-ramp, no staking or yield, no KYC, no custodial recovery.

## Updates are never automatic

The code that signs your transactions is re-fetched over the web rather than
installed once, which means whoever controls the origin could change it between
two visits. So this wallet **never updates itself**. A new version installs and
waits; nothing changes until you explicitly accept it, and never while a
transaction is in flight.

Each release publishes its source tag and the hashes of its built assets, so a
build can be independently rebuilt and compared. Note that Subresource Integrity
does *not* defend against a compromised origin — the attacker would control the
integrity hashes too — which is why verifiability, not SRI, is the mechanism here.

See [`docs/user-stories/app-versioning-and-updates.md`](./docs/user-stories/app-versioning-and-updates.md).

## Running it

```bash
bun install
bun run dev
```

### Quality gates

All four must pass. They are enforced in CI on every pull request.

```bash
bun run lint            # oxlint, warnings are errors
bun run build           # tsc -b && vite build
bun run test            # vitest
bun run check:contrast  # measures every colour pair, both themes
```

`check:contrast` is unusual and load-bearing: it parses the design tokens out of
`src/index.css` and measures every pair the app actually renders — including
alpha composites — in both light and dark, exiting non-zero on any failure. It is
what makes the project's WCAG 2.2 AA commitment enforceable rather than aspirational.

## Contributing

**Pull requests target `dev`, not the default branch.**

Branches promote in one direction: `dev` → `stage` → `prod`. `prod` is the default
branch because it is the code actually deployed — so a visitor, or anyone
verifying a release against what the CDN serves, lands on the real thing. There is
deliberately no `main`.

Before changing anything, read [`CLAUDE.md`](./CLAUDE.md). It indexes four
documents that are each authoritative for their own layer: how to behave
(`docs/agents/`), what the wallet does (`docs/user-stories/`), what was decided
and why (`docs/decisions.md`), and the visual system (`DESIGN.md`). Several rules
in there are non-negotiable because breaking them loses money or keys.

## Security

Do not open a public issue for a security problem. The threat model, including
the parts that are **not** mitigated, is documented in `docs/decisions.md` §8.

This software has not been audited. It is built to hold real funds and used that
way by its author, which is a statement about intent, not a guarantee.

### Verifying a build

The wallet does not — and cannot — attest to its own integrity: an origin that
has been compromised also controls the code that would report "everything is
fine". Verification has to be performed by someone else, against the tagged
source, and is meaningful precisely because a third party can do it.

1. Check out the tag named in the running build's `Version` (Settings shows it,
   and the commit links here) and run `bun install --frozen-lockfile && bun run
   build`. `docs/decisions.md` §8.6 records that this build is reproducible —
   two clean builds of the same tag produce byte-identical output.
2. Hash every file under `dist/` (`sha256sum $(find dist -type f)` or
   equivalent) and diff the result against the `assets` map in that release's
   `releases.json` — `scripts/gen-release-manifest.mjs` produces both from the
   same build.
3. Fetch `releases.json` from the live origin (`/releases.json`, `cache:
   'no-store'`) and confirm its `assets` map is byte-identical to the one you
   just rebuilt. Optionally re-download each served asset and hash it directly,
   rather than trusting the manifest the same origin also serves.
4. A mismatch means the tag you checked out is not what the origin is serving.
   Do not use that build to sign anything, and see `docs/decisions.md` §8 for
   what this threat model does and does not cover.

Subresource Integrity is not a substitute for this: an attacker controlling the
origin controls `index.html` and therefore the integrity attributes themselves.
