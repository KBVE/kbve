<div align="center">

<a href="https://kbve.com/" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/KBVE/kbve/main/services/cdn/assets/readme/logo.svg" width="180" alt="KBVE"></a>

# KBVE Monorepo

Games, libraries, services and memes — one repo, one build graph.

[![Discord](https://img.shields.io/discord/342732838598082562?logo=discord&label=discord)](https://kbve.com/discord/)
[![moon](https://img.shields.io/badge/built%20with-moon-6F53F3?logo=moonrepo)](https://moonrepo.dev/)

<img src="https://raw.githubusercontent.com/KBVE/kbve/main/services/cdn/assets/readme/hero.webp" width="820" alt="KBVE">

</div>

---

## What is KBVE?

KBVE is a collective that builds programs, libraries, games and memes. This monorepo is where all of it lives: a
dozen web apps, a Kubernetes fleet, Rust crates, Unreal and Unity plugins, Godot and Bevy games, and the CI that
ships them.

The build graph is [moon](https://moonrepo.dev/). Every project declares its own tasks, and `moon` works out what a
change affects — you rarely need to know more than `moon run <project>:<task>`.

---

## Quick start

Requires Linux, macOS or WSL. Direct Windows is not supported.

Toolchain versions are pinned in [`.prototools`](./.prototools) — Node 24, pnpm 11, moon 2.5, Rust 1.98, uv 0.11.
[proto](https://moonrepo.dev/proto) installs all of them for you.

```bash
git clone https://github.com/KBVE/kbve.git
cd kbve
pnpm install

moon run astro-kbve:dev        # kbve.com dev server
moon run astro-herbmail:dev    # herbmail.com dev server
```

Useful workspace tasks:

```bash
moon check --all               # lint + test everything the graph knows about
moon run root:stats            # line counts across the tree
moon query projects            # what is in the graph
```

> CI runs `moon ci ':lint' ':test'` — never a bare `moon ci`. See [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

---

## Repository layout

| Path               | What lives there                                                            |
| ------------------ | --------------------------------------------------------------------------- |
| `apps/`            | Deployable products, grouped by product: `web`, `api`, `gameserver`, `e2e`  |
| `crates/`          | Rust crates — engine pillars, Bevy plugins, shared libraries                |
| `packages/npm/`    | Published `@kbve/*` TypeScript packages                                     |
| `packages/unreal/` | Unreal Engine plugins (`KBVE*`)                                             |
| `packages/unity/`  | Unity packages — `kilonet`, `mmextensions`, `ssdb`                          |
| `packages/python/` | Python packages — `kbve`, `fudster`, `graphify-wrapper`                     |
| `packages/proto/`  | Protobuf schemas shared across languages                                    |
| `apps/kube/`       | ArgoCD app-of-apps — the whole cluster, declaratively                       |
| `services/`        | Edge functions and Windmill scripts                                         |
| `tools/`           | Repo tooling: CI guards, release resolution, commit validation, LFS, deploy |
| `.moon/`           | Workspace config and shared toolchain task presets                          |

---

## Apps

| App              | Site                                         | Stack                                |
| ---------------- | -------------------------------------------- | ------------------------------------ |
| **kbve**         | [kbve.com](https://kbve.com)                 | Astro + Axum + Supabase (`kilobase`) |
| **herbmail**     | [herbmail.com](https://herbmail.com)         | Astro + Axum, PSX-style R3F game     |
| **discordsh**    | [discord.sh](https://discord.sh)             | Astro + Axum + Discord bot           |
| **rareicon**     | [rareicon.com](https://rareicon.com)         | Astro + Unreal + Unity DOTS          |
| **cryptothrone** | [cryptothrone.com](https://cryptothrone.com) | Bevy isometric ARPG, WASM + Agones   |
| **chuckrpg**     | [chuckrpg.com](https://chuckrpg.com)         | Unreal MMO + Tauri launcher          |
| **irc**          | [chat.kbve.com](https://chat.kbve.com)       | Astro + Rust gateway over NATS       |
| **memes**        | [meme.sh](https://meme.sh)                   | Astro + Axum                         |
| **friendslop**   | —                                            | Godot + Rust (`q` engine via gdext)  |
| **rentearth**    | —                                            | Unreal + Axum                        |
| **jobboard**     | —                                            | Rust service + web                   |
| **mc**           | —                                            | Minecraft server ops, mods, Velocity |
| **rows**         | —                                            | Multi-tenant Rust API                |
| **agones**       | —                                            | Agones runtime for the game fleets   |

<table>
<tr>
<td width="33%" align="center"><a href="https://rareicon.com"><img src="https://raw.githubusercontent.com/KBVE/kbve/main/services/cdn/assets/readme/app-rareicon.webp" alt="Rareicon"><br><b>Rareicon</b></a><br>Unreal + Unity DOTS</td>
<td width="33%" align="center"><img src="https://raw.githubusercontent.com/KBVE/kbve/main/services/cdn/assets/readme/app-rentearth.webp" alt="Rent Earth"><br><b>Rent Earth</b><br>Unreal + Axum</td>
<td width="33%" align="center"><a href="https://discord.sh"><img src="https://raw.githubusercontent.com/KBVE/kbve/main/services/cdn/assets/readme/app-discordsh.webp" alt="Discord.sh"><br><b>Discord.sh</b></a><br>Astro + Axum + bot</td>
</tr>
</table>

---

## Published packages

<img src="https://raw.githubusercontent.com/KBVE/kbve/main/services/cdn/assets/readme/pkg-crates.webp" width="110" align="right" alt="">

**Rust** — [`kbve`](https://crates.io/crates/kbve) · [`jedi`](https://crates.io/crates/jedi) ·
[`holy`](https://crates.io/crates/holy) · [`erust`](https://crates.io/crates/erust) plus the `bevy_*` plugin family,
`q`, `simgrid`, `simbody3d`, `embeddb` and `unr`.

[![Crates.io KBVE](https://img.shields.io/crates/v/kbve?label=kbve&logo=rust)](https://crates.io/crates/kbve)
[![Crates.io Jedi](https://img.shields.io/crates/v/jedi?label=jedi&logo=rust)](https://crates.io/crates/jedi)
[![Crates.io Holy](https://img.shields.io/crates/v/holy?label=holy&logo=rust)](https://crates.io/crates/holy)
[![Crates.io ERust](https://img.shields.io/crates/v/erust?label=erust&logo=rust)](https://crates.io/crates/erust)

<img src="https://raw.githubusercontent.com/KBVE/kbve/main/services/cdn/assets/readme/pkg-npm.webp" width="110" align="right" alt="">

**npm** — `@kbve/laser`, `@kbve/devops`, `@kbve/astro`, `@kbve/core`, `@kbve/chat`, `@kbve/droid`, `@kbve/fx`,
`@kbve/rn`, `@kbve/tauri`, `@kbve/observ`, `@kbve/khashvault`.

[![NPM Laser](https://img.shields.io/npm/v/%40kbve%2Flaser?label=@kbve/laser&logo=nodedotjs)](https://www.npmjs.com/package/@kbve/laser)
[![NPM Devops](https://img.shields.io/npm/v/%40kbve%2Fdevops?label=@kbve/devops&logo=nodedotjs)](https://www.npmjs.com/package/@kbve/devops)

**PyPI** — [`kbve`](https://pypi.org/project/kbve/) · [`fudster`](https://pypi.org/project/fudster/)

[![PyPI KBVE](https://img.shields.io/pypi/v/kbve?label=kbve&logo=python)](https://pypi.org/project/kbve/)
[![PyPI Fudster](https://img.shields.io/pypi/v/fudster?label=fudster&logo=python)](https://pypi.org/project/fudster/)

---

## Contributing

All work happens in an isolated git worktree branched from `dev`. Nothing is committed directly to `dev` or `main`.

```bash
./kbve.sh -worktree <task-name>    # creates worktree, copies .env, installs deps
```

Then commit with [conventional commits](https://www.conventionalcommits.org/) and open a PR against `dev`.
Versions are never bumped by hand — releases are cut from git tags shaped `<moon-project-id>@<semver>`.

Full workflow, commit scopes and release rules: [`AGENTS.md`](./AGENTS.md).
WSL setup instructions: [`CONTRIBUTE.md`](./CONTRIBUTE.md).
Getting-started docs: [kbve.com/guides](https://kbve.com/guides/getting-started/).

---

## Why a monorepo?

- **One environment.** Every project shares the same pinned toolchain, lint rules and CI lane.
- **Atomic changes.** A protobuf change, its Rust server and its TypeScript client land in one commit.
- **One source of truth.** Configs, schemas and deployment manifests sit next to the code they describe.
- **It scales.** The moon graph only builds and tests what a change actually touches.

Prior art we borrow from: [Cal.com](https://github.com/calcom/cal.com) · [E2B](https://github.com/e2b-dev/e2b/).
