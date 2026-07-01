# kbve

API layer and complexity handler for async HTTP, WebSocket, gRPC, and broadcasting.

## Installation

```bash
pip install kbve
```

## Development

This package is part of the [KBVE](https://github.com/kbve/kbve) monorepo, managed with Nx and Poetry.

```bash
pnpm nx test python-kbve
pnpm nx lint python-kbve
pnpm nx build python-kbve
```

## OSRS item corpus (`kbve.osrs`, `--extra osrs`)

Survey/audit/family tooling for the OSRS item pages under
`apps/kbve/astro-kbve/src/content/docs/osrs/`. Scripts: `kbve-osrs-survey`,
`kbve-osrs-audit`, `kbve-osrs-families`.

`kbve-osrs-families` collapses near-identical items (poison, potion doses,
(un)charged, Barrows degrade tiers) onto one canonical page and emits the
axum-kbve 301 table. **Pruning member pages is one-way — the redirect JSON must
only ever be regenerated with `--merge`.** Full runbook: the module docstring in
[`kbve/osrs/families.py`](kbve/osrs/families.py) and
[`docs/plans/osrs/README.md`](../../../docs/plans/osrs/README.md).
