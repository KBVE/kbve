# UE 5.8 Upgrade — Pending Plugin Checks

Tracks `packages/unreal` plugins **not yet verified on UE 5.8**.

The 5.7 → 5.8 upgrade was driven through `apps/rentearth/unreal-rentearth`
(see commit `feat(rentearth): upgrade unreal-rentearth to UE 5.8.0`). Only the
plugins **enabled in `rentearth.uproject`** (plus their transitive deps) were
actually compiled and link-verified during that `chuckEditor` build. Every
plugin below was **never compiled** in that pass — they may build clean, but
that is unconfirmed.

Each entry was statically scanned for the known 5.8 break patterns (see
checklist at the bottom). "Scan clean" means none of those _specific_ patterns
were found — it does **not** mean the plugin compiles, since 5.8 also tightened
`-Werror` and deprecated many editor/runtime APIs not in the pattern list.
Confirming a plugin requires enabling it in a 5.8 project and building it.

## Verified on 5.8 (reference)

Compiled + linked in the rentearth `chuckEditor` Mac/Development build:
`KBVEYYJson`, `KBVEXXHash`, `KBVESQLite`, `KBVEULID`, `KBVEUI`, `KBVEEvents`,
`KBVEROWS`, `KBVESupabase`, `KBVEWorld`, `KBVEGameplay`, `KBVEItemDB`,
`KBVENPCDB` (+`KBVENPCSprite`), `KBVEWebSurface`, `KBVEPostShader`, `KBVENet`,
`KBVEMover`, `KBVECombat`, `KBVEPerf`, `Agones`, `KBVEAgones`.

## Pending checks

| Plugin           | Risk    | Scan                                     | Notes / action                                                                                                                                                                                                                 |
| ---------------- | ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **KBVEWASM**     | MED     | clean                                    | Wraps WAMR 2.2.0 (bundled C). Large third-party compile unit — watch `-Werror` on vendored code + platform build flags.                                                                                                        |
| **KBVELibGit**   | MED     | clean                                    | Editor-only libgit2 installer; uses editor plugin-management APIs (deprecation risk). `Enabled: false` in rentearth so never built even there. Build editor target.                                                            |
| **KBVEHexWorld** | LOW–MED | clean                                    | Hex topology + noise + **PCG streaming**. PCG API churns across UE versions — verify PCG includes/types. Has a ThirdParty dir (noise).                                                                                         |
| **KBVETinyBVH**  | LOW     | clean                                    | Wraps TinyBVH 1.6.7 (single-header). Vendored C++ may trip `-Werror`; otherwise self-contained.                                                                                                                                |
| **KBVEZstd**     | LOW     | clean                                    | Wraps zstd 1.5.7 (stable C). Low risk; compile to confirm.                                                                                                                                                                     |
| **KBVEMapDB**    | LOW     | Mass-derived, **MassCore already added** | `FKBVEWorldObjectFragment`/`Tag` derive Mass bases; `MassCore` dep was added pre-emptively during the rentearth pass (5.8 moved `FMassTag`/`FMassFragment` ctors to `MassCore`). Not compiled — just needs a build to confirm. |
| **KBVEQuestDB**  | LOW     | clean                                    | Pure data loader (questdb artifact). No Mass/render/json-Values patterns. Compile to confirm.                                                                                                                                  |

## Removed

- **KBVEUnrealMCP** — deleted (UE 5.8 ships a native MCP). Was never compiled
  on 5.8; large editor-API surface made it not worth porting. Recoverable from
  git history if ever needed.

## How to verify a plugin

Enable it in a 5.8 `.uproject` (rentearth is the natural host) and build, or
spin a throwaway project. The full break-set surfaces at compile/link time.

## Known 5.8 break patterns (from the rentearth upgrade)

- **Targets:** `BuildSettingsVersion.V6 → V7`, `IncludeOrderVersion.Unreal5_7 → Unreal5_8`.
- **Mass module split:** `#include "MassEntityHandle.h"` → `"Mass/EntityHandle.h"`; any module deriving `FMassTag`/`FMassFragment`/`FMassSharedFragment` now needs a `MassCore` dependency (base UScriptStruct ctors moved there → undefined-symbol link errors otherwise, even without including the header).
- **FJsonObject keys:** `FJsonObject::Values` is keyed by `UE::FSharedString`; `Pair.Key` in an `FString` context → `FString(*Pair.Key)`.
- **Material usage flags:** deprecated `Material->bUsedWith*` fields → `Get/SetUsageByFlag(MATUSAGE_*)`.
- **Removed global:** `GGPUFrameTime` (now RHI-private) → `RHIGetGPUFrameCycles()` (DynamicRHI.h).
- **Moved header:** `Engine/UserDefinedStruct.h` → `StructUtils/UserDefinedStruct.h`.
- **Stricter clang `-Werror`:** `-Wunreachable-code-loop-increment` rejects single-iteration loops whose body always `break`/`return` (the `++It` is unreachable) — rewrite as `It; if (It) {...}` or `(bool)It`.
- **Deprecations (warnings, fix before next release):** e.g. `FCoreDelegates::OnPostEngineInit` → `GetOnPostEngineInit()`.
- **Bundled SQLite (KBVESQLite-style):** symbol-prefix `sqlite3_* → kbve_sqlite3_*` to avoid `LNK2005` vs engine `SQLiteCore` in monolithic builds; enable `SQLITE_ENABLE_COLUMN_METADATA` so the prefixed names aren't clobbered by sqlite3.c's feature-off `#define sqlite3_column_*_name 0` stubs.
- **UBT strictness:** case-sensitive `.uproject` arg; no quote-stripping on `-Project=`.
