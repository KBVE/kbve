# KBVE

![Discord](https://img.shields.io/discord/342732838598082562?logo=discord)
![PyPI - Version](https://img.shields.io/pypi/v/kbve)

<a alt="KBVE Logo" href="https://kbve.com/" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/KBVE/kbve.com/main/public/assets/img/kbve.png" width="200"></a>

---

## What is KBVE?

KBVE is a collective that builds different programs, libraries and games!
This monorepo is the heart of all our applications, making it easier to manage.

* * *

## CRAP STACK

- C for C
  - C#
  - Unity , with Rust Bindings through Interoptopus

- R for Rust
  - This includes Flutter with Rust Bindings

- A for Astro
  - Javascript / Typescript
  - React
  - Svelte
  - NAPI for Rust Bindings

- P for Python
  - Polyglot of Python through Pyo3 and Interoptopus

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