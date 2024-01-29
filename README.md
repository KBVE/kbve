# KBVE

![Discord](https://img.shields.io/discord/342732838598082562?logo=discord)
[![PyPI - Version](https://img.shields.io/pypi/v/kbve)](https://pypi.org/project/kbve/)
[![Crates.io Version](https://img.shields.io/crates/v/erust?label=erust%20crates.io)](https://crates.io/crates/erust)


<a alt="KBVE Logo" href="https://kbve.com/" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/KBVE/kbve.com/main/public/assets/img/kbve.png" width="200"></a>

---

## What is KBVE?

KBVE is a collective that builds different programs, libraries, games and memes!
This monorepo is the heart of all our applications, making it easier to manage and provides an experimental playground for pipelines.
The core of this Monorepo is based upon [Nx Smart Monorepos](https://nx.dev/)


* * *

## CARP STACK

> cRap , pronounced, Ceee-Rap. 💩 ... uhh wait I meant to say carp. 🐟

- C
  - [saber](https://github.com/KBVE/kbve/tree/main/apps/saber)
    - Unity | v2022.3.12f1
      - `dev` has a playable build on [Itch.io - Saber Dev](https://kbve.itch.io/dev-saber)
        - The monorepo builds and ships the `dev`-branch build to Itch.io
      - TODO: Interoptopus for rust bindings.
    - Blazor
      - WIP: Waiting on Net 8.0 integration.
    - Steam Pipeline:
      - TODO: Building Pipeline after adding a new `beta` branch to the CI/CD pipeline.

  - [pandaplayground](https://github.com/KBVE/kbve/tree/main/apps/kbve.com/public/data/c/graveyard/panda)
    - Generic `C` playground
    - Extremely WIP with submodules removed by default.


- R for Rust
  - `kbve`
    - Axum
      - Prebuilt Axum routes for the KBVE backend.
    - Diesel
      - Database ORM for managing the types.
    - TODO: Crates.io Release

  - [erust](https://crates.io/crates/erust) | v0.1 dev.
    - Egui
      - A components library that extends out `egui` & `eframe`.
    - Rust [Crates.io Package Source](https://github.com/KBVE/kbve/tree/main/packages/erust)

- A for Astro
  - [AstroVE](https://github.com/KBVE/kbve/tree/main/packages/astro-ve/)
    - Astro Components Library
    - TODO: NPM Release
    - React
      - TODO: Migrate out additional React Components.
    - Svelte
      - TODO: Refactor the Svelte Components.

  - [KhashVault](https://github.com/KBVE/kbve/tree/main/packages/khashvault/)
    - Typescript JS Library
    - TODO: `engine.ts` - Integrating Axum (`kbve`) backend with frontend libraries.
    - TODO: NPM Release

  - React - SKIP
  - Svelte - SKIP
  - NAPI 
    - Rust Bindings

- P for Python
  - This part of the stack is under massive development, so we advise to skip this until we get the bindings sorted.
  - `Atlas` under [kbve pip package](https://pypi.org/project/kbve/)
    - TODO: Full `atlas` refactor with `autogen` and `taskweaver`.

  - Pyo3
    - Rust Bindings
  
  - Interoptopus 
    - Rust Bindings

* * *

## DEVOPS STACK

The Richard Stack is known as `Dockerized Integrated Container Kubes`.

- D for [Docker](https://kbve.com/application/docker/)
  - Swarm
    - Docker Swarm for Stateful Applications.
  - Portainer
    - We use [Portainer](https://kbve.com/application/portainer/) for Docker/K8s management.
  - KBVE Docker Images via [Hub](https://hub.docker.com/u/kbve)
    - [kbve:rustprofile](https://hub.docker.com/r/kbve/rustprofile)
  
- I for Integrations
  - Github Actions
    - We use GHA to help build the docker images for x86 and ARM.
  - GitLab
    - We use a private GitLab for `private` codebase projects.

- C for Containers
  - [Proxmox](https://kbve.com/application/proxmox/)
    - qEMU
      - The QEMU handles running our docker swarm and k8s.
    - LXD

- K for Kubes
  - [Kubernetes](https://kbve.com/application/kubernetes/)
    - `k` for Stateless Applications.

* * *

Examples of monorepos:

- [Cal.com](https://github.com/calcom/cal.com)
- [E2B](https://github.com/e2b-dev/e2b/)

Perks of a monorepo include:

- Consistent Developer Environment and Experience.

  - A monorepo can provide a consistent environment and set of tools for all developers, which can be especially beneficial in large organizations with many projects.
  - Easier AI Training, as the codebase is all within a controlled repo.

- Less clutter, keeping a single source of truth.

  - The monorepo acts as a centralized source of truth for all projects, configurations, and dependencies.

- Atomic Changes.

  - Developers can make cross-cutting changes across multiple projects within a single atomic commit.

- Scalable.
  - Modern monorepo build tools and practices are designed to scale, even as the number of projects and developers grows.

* * *

### Install

Before getting started, we recommend that you use WSL, Linux or MacOS! Direct Windows is not supported.
Make sure you have Node 18+ with PNPM! Python 3.10+ / Poetry are optional if you wish to work with python.

#### Git

- `git clone https://github.com/KBVE/kbve.git` then enter the directory. `cd kbve`
- Then run -> `pnpm install`
- Launch `pnpm nx dev herbmail.com` - Should start a development server with Astro for HerbMail.com

---

### Library & Apps

The breakdown of libraries, packages and applications in this repo contains!

#### SABER

This is an open source Unity game that is currently located under `/apps/saber/` within this monorepo.

#### Atlas

Atlas is a [Python pip package](https://pypi.org/p/kbve) for generic baseline ml applications.
Atlas currently only has `pyautogen` but a couple other packages are planned but as of right now, we are waiting on the stablization of the OpenAI v1 API.
The Atlas Library is currently broken needs to be wait on a couple packages to be updated, including LiteLLM.

#### AstroVe

Astro VE is an Astro-based UX/UI library that empowers developers to seamlessly create elegant and adaptable UX/UI components, fostering an interactive and intuitive user experience across diverse website applications.

#### React Appwrite

React-based Appwrite library for fast frontend deployment.
This package will be deprecated and replace with a `react-api` style package.

#### API

The API is current being updated! Its split into a NestJS core under `/apps/api/` and micro controllers written in Rust, under `/apps/rust_api_*` with `*` representing a glob wild card.

##### API Rust

Make sure that `Cargo` is installed!

Running the micro controllers for the Rust API is easy!

`pnpm nx run rust_api_profile:run`

### Apps

- HerbMail.com
- KBVE.com
- RareIcon.com
- Discord.sh