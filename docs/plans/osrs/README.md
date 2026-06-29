# OSRS Item Data — Planning

| File                                     | What                                           |
| ---------------------------------------- | ---------------------------------------------- |
| [v4-thin-content.md](v4-thin-content.md) | v4 schema spec + thin-content remediation plan |
| [audit.json](audit.json)                 | Latest STUB + BASIC sparse audit snapshot      |

## Regenerating the data

The survey/audit tooling lives in the `kbve` Python package under the `osrs`
extra (`packages/python/kbve/kbve/osrs/`). From `packages/python/kbve`:

```sh
uv run --extra osrs kbve-osrs-survey --root <repo-root>
uv run --extra osrs kbve-osrs-audit  --root <repo-root> --json <repo>/docs/plans/osrs/audit.json
```

`--root` is optional; the tools walk up to find the OSRS content dir if omitted.
