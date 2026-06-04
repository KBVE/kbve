# unreal-chuck — Agent Notes

Unreal Engine 5.7 project for ChuckRPG. Lives at `apps/chuckrpg/unreal-chuck/`.
Engine module name is lowercase `chuck`; uproject is `chuck.uproject` at the
project root (no `Chuck/` subdir). Two sibling packages — `astro-chuckrpg`
(website) and `axum-chuckrpg` (API) — are separate; do not touch them from
work scoped to this project unless the change is explicitly cross-cutting.

## Layout

```
apps/chuckrpg/unreal-chuck/
├── chuck.uproject                  # tracked, text JSON
├── build.toml                      # CI metadata (uproject path, server target, image tag)
├── version.toml                    # CI/CD-managed; do not hand-edit
├── project.json                    # Nx targets (LFS routing, sync)
├── .gitignore                      # UE ignore set
├── .lfsconfig                      # documents intended Forgejo endpoint
├── AGENTS.md                       # this file
├── Source/
│   ├── chuck.Target.cs             # game client target
│   ├── chuckEditor.Target.cs       # editor target
│   ├── chuckServer.Target.cs       # dedicated server target (used by CI)
│   └── chuck/                      # primary module sources + variants
├── Config/                         # DefaultEngine.ini, DefaultGame.ini, etc.
└── Content/                        # uassets + umaps (LFS pointers in monorepo)
```

Generated/ignored: `Binaries/`, `Build/`, `Intermediate/`, `DerivedDataCache/`,
`Saved/`, `/Mac/`, `/Win64/`, `/Linux/`, `*.xcworkspace/`, `*.xcodeproj/`,
`Content/Developers/*`.

## Git LFS routing

Heavy binary assets (uasset, umap, fbx, blend, psd, raster textures, audio,
plugin natives) are tracked via Git LFS. Pointer files live in this GitHub
monorepo; real blobs live on the self-hosted Forgejo at
`git.kbve.com/KBVE/chuck.git`. Pattern coverage is defined at the repo-root
`.gitattributes` under the `apps/chuckrpg/unreal-chuck/**` section.

Stock git-lfs only honors `lfs.url` from the repository-root `.lfsconfig`.
That file points at `KBVE/rareicon` (the original game asset endpoint) and
must stay that way for rareicon devs. Chuck's `.lfsconfig` (at this
directory) documents the intended endpoint but is not consulted by
git-lfs directly.

Use the `kbve.sh -lfs` router or the Nx `unreal-chuck:*` targets to push
or pull chuck blobs. The router injects `-c lfs.url=…` for the correct
endpoint per game:

```bash
# kbve.sh router (recommended)
./kbve.sh -lfs chuck push origin <branch>
./kbve.sh -lfs chuck pull
./kbve.sh -lfs chuck fetch --all
./kbve.sh -lfs chuck ls-files

# Nx targets (delegate to kbve.sh)
npx nx run unreal-chuck:lfs-push
npx nx run unreal-chuck:lfs-pull
npx nx run unreal-chuck:lfs-fetch
npx nx run unreal-chuck:lfs-ls
npx nx run unreal-chuck:sync        # fetch --all && pull
```

Plain `git lfs push` from this tree will hit the rareicon endpoint by
default and is wrong for chuck — always use the router.

## CI

Dispatch metadata lives in `build.toml`:

```toml
[project]
repo          = "KBVE/chuck"       # GitHub artifact repo (NOT the LFS repo)
path          = "chuck.uproject"
server_target = "chuckServer"      # must match Source/chuckServer.Target.cs
ue_image_tag  = "dev-5.7.4"
server_config = "Development"
```

Server build workflow lives in `.github/workflows/ci-ue5-rows.yml` and
`ci-ue.yml`. The dedicated-server target is built from
`chuckServer.Target.cs` — if you rename the target class, update
`build.toml`'s `server_target` field in the same commit or CI will fail.

## Conventions

- Module name and target class names are lowercase (`chuck`,
  `chuckEditor`, `chuckServer`). This matches what UE generated when the
  project was scaffolded; do not casually re-case them.
- New native plugins go under `Plugins/` so the existing LFS rule
  (`apps/chuckrpg/unreal-chuck/**/Plugins/**/*.{dylib,dll,so,a,bundle}`)
  picks them up.
- Editor-only or per-developer scratch work goes under
  `Content/Developers/<your-name>/` (gitignored).
- Do not commit anything under `Saved/`, `Intermediate/`, or platform
  build folders even if the editor places useful-looking files there.
- `version.toml` is CI/CD-managed (see the `feedback_no_manual_version`
  memory); do not hand-bump it.

## Threading + Mass conventions

Stat regen and any future per-entity simulation runs on Mass workers via
`UMassProcessor` subclasses under `Source/chuck/Mass/`. The runtime rule
that protects this from race-condition pain:

- **UObject access stays out of the worker.** Processor bodies operate
  on POD fragments (USTRUCT inheriting `FMassFragment`). No
  `GetWorld()`, no `UPROPERTY` dereferences, no `UE_LOG` of FStrings
  on the workers. Pure math + fragment reads/writes only.
- **Game thread owns marshalling.** An `AchuckCoreCharacter` (server,
  authority only) creates its Mass entity in `BeginPlay` and destroys
  it in `EndPlay`. Each Tick, it pushes input flags (sprint, moving,
  combat state, …) into the fragment and pulls computed values back
  into its replicated UPROPERTY so UE's replication graph stays the
  source of truth for clients.
- **One frame of lag is acceptable.** The processor runs at
  PrePhysics; the actor's next Tick reads the freshly-computed
  fragment. Imperceptible vs. network jitter, and it keeps the
  game-thread cost flat regardless of entity count.
- **One archetype per behavior class.** Stats currently live in
  `FchuckStatsFragment` only. As features land (combat, AI,
  inventory), each gets its own fragment + processor, with characters
  carrying additional fragments by extending the archetype tuple at
  creation. Don't smush unrelated data into the same fragment.
- **EntityQuery wiring (UE 5.7):** initialize via the processor
  constructor's member-init list (`EntityQuery(*this)`) — the
  `bInitialized` flag must be set before `AddRequirement` is called,
  or you'll get the line-214 assert in `MassRequirements.h`.
- **Tracing markers everywhere:** wrap any non-trivial worker scope
  in `TRACE_CPUPROFILER_EVENT_SCOPE(chuck_<Name>)` so UE Insights
  recordings give per-system cycle counts. Pattern is in
  `chuckStatRegenProcessor::Execute` and
  `AchuckCoreCharacter::SyncStatsFragment`.

For raw worker tasks (one-shot async work that isn't entity-shaped),
use `UE::Tasks::Launch` with `Then()` continuation back to the game
thread — never `AsyncTask<TStatId, FNonAbandonableTask>` legacy APIs.

## Quick start for agents

1. Confirm git-lfs is installed (`git lfs version`); run `git lfs install`
   once per clone if not.
2. Pull binary assets via `npx nx run unreal-chuck:sync` (or
   `./kbve.sh -lfs chuck pull`) before opening the editor.
3. Open `chuck.uproject` in UE 5.7 to regenerate IDE project files; this
   recreates `Intermediate/ProjectFiles/`, `*.xcworkspace/`, etc., all of
   which are ignored.
4. For work that needs the Editor module dylib (macOS), let UBT rebuild it
   into `/Mac/` — that directory is gitignored.
