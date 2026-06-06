# Unreal Plugin Pipeline

How KBVE Unreal plugins version, build, publish, and (future) get consumed by game builds.

## Source of truth

MDX `version:` is the single lever. Bump it and nothing else — every other
version field is derived. The page lives at
`apps/kbve/astro-kbve/src/content/docs/project/<plugin>.mdx` and carries the
CI registry frontmatter (`key`, `pipeline: unreal`, `plugin_name`,
`plugin_path`, `version`, `supported_platforms`).

| File                             | Role                                               | Who writes it                                                  |
| -------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| MDX `version:`                   | lever — the only thing a human bumps               | human (release PR)                                             |
| manifest `version`               | what the dispatcher + publish gate compare against | `astro-kbve:build` from MDX                                    |
| `<plugin>.uplugin` `VersionName` | embedded in the packaged plugin                    | stamped at build time; synced into source by the post-build PR |
| `version.toml` `version`         | published marker — last version shipped            | post-build PR                                                  |

The dispatcher gates on the **manifest `version`** (from MDX), not the
`.uplugin`. So the `.uplugin` VersionName is allowed to lag MDX between a bump
and its publish — that drift is normal, not an error. `version.toml` is the
published marker and is never pre-synced; the build fires only while MDX >
`version.toml`.

## Release flow

1. Bump MDX `version:` (e.g. `1.5.7` → `1.5.8`). That is the entire human edit.
2. Merge to dev → release PR dev→main.
3. On push to main, `ci-main.yml` reads `.github/ci-dispatch-manifest.json`,
   sees manifest `version` > `version.toml`, and dispatches `ci-publish.yml`
   once per platform in `supported_platforms`:
    - `unreal` → Linux (`arc-runner-ue`, docker)
    - `unreal-win64` → Win64 (`UE5-Win` KubeVirt VM)
      The MDX version rides along as `manifest_version`.
4. The build stamps the `.uplugin` `VersionName` with `manifest_version` before
   `BuildPlugin`, then packages and uploads a GitHub Release asset named with
   platform + engine + version:
   `KBVEZstd-Linux-UE5.7.4-v1.5.8.zip`, `KBVEZstd-Win64-UE5.7.4-v1.5.8.zip`.
5. Post-build: `ci-publish.yml` opens ONE auto-PR via
   `utils-update-version-toml.yml` that bumps **both** `version.toml` and the
   source `.uplugin` `VersionName` to the published version. For multi-platform
   plugins the Linux publish owns this PR and Win64 skips it
   (`skip_version_update`, set by the dispatcher). A Win64-only plugin owns it.

`npx nx run astro-kbve:sync:unreal` exists as a manual tool to bulk-resync every
`.uplugin` VersionName from MDX (e.g. after backfilling versions); it is not part
of the release path.

## Win64 prerequisites

`UE5-Win` is a single self-hosted KubeVirt VM (`windows-builder`, `angelscript`
namespace, runner group `KBVE`), started by KEDA when a job queues for that
label. It needs three provisioning layers, in order, before a plugin builds:

1. **VM online** — KEDA boots it on a queued `UE5-Win` job (or start manually).
2. **Toolchain** — the `win-setup` task (`ci-unreal.yml`) installs VS BuildTools,
   Python, .NET, DirectX, CMake, and Git LFS from `file-server` (which must be
   scaled to `replicas=1`). Idempotent — every step skips if already present.
   `win-setup` does NOT install the engine.
3. **Engine** — the `engine` task with `platforms: windows` builds the
   AngelScript engine (`KBVE/UnrealEngine-Angelscript`) in place at
   `C:\UnrealEngine` on the VM (`engine_build_windows`, runs on `UE5-Win`). It is
   a source build, persisted on the VM disk (not released as an artifact), and is
   idempotent: it skips the multi-hour rebuild when `C:\UnrealEngine` already
   holds the requested `engine_ref` (tracked by a `.kbve-engine-ref` marker).
   Force a rebuild with `skip_version_gate: true`. First provision:
   dispatch the `engine` task, `platforms: windows`, `skip_version_gate: true`.

Plugins are stock-UE compatible, but building them against the same AngelScript
engine the game ships on keeps the toolchain identical. The plugin-win build's
"Locate Unreal Engine" finds `C:\UnrealEngine` automatically.

## Future: prebuilt binary distribution to game builds

Game builds currently do not consume these plugins. When wired, the goal is for
a game build to pull prebuilt plugin binaries (`.so` / `.dll` / `.dylib`) instead
of compiling each plugin from source — faster builds.

Mechanism (scaffolded, not yet active):

- Each game pins the plugins it consumes in `unreal-plugins.lock.json` beside its
  `.uproject`:

    ```json
    {
    	"engine": "5.7.4",
    	"plugins": [
    		{ "name": "KBVEZstd", "version": "1.5.8" },
    		{ "name": "UEDevOps", "version": "0.1.0" }
    	]
    }
    ```

- `.github/actions/fetch-ue-plugins` reads the lockfile, resolves the build
  platform + engine, downloads the matching release asset
  (`<name>-<platform>-UE<engine>-v<version>.zip`) into `<project>/Plugins/`, and
  falls back to a source build if the asset is missing.
- UE skips compiling a plugin whose `Binaries/` already match the engine +
  platform, so prebuilt assets cut game build time.

### Open items before activation

- Mac (`.dylib`) plugin builds — no `macos-builder` VM provisioned; engine
  provision + plugin-mac jobs are stubs.
- Win64 asset engine version: `plugin_check` derives engine from `ue_image_tag`,
  but the VM builds against `C:\UnrealEngine` (the AngelScript engine). The asset
  name engine field should be sourced from the VM's actual engine, not the image
  tag passed for naming.
- Engine-version matrix: `ci-publish.yml` passes `ue_image_tags` as a JSON
  array but plugin builds consume a single tag; multi-engine fan-out is not wired.
- Lockfile resolver + source-build fallback need integration into the game build
  jobs in `ci-unreal-build.yml`.
- A consumer registry / checksum so game builds verify the asset they pulled.
