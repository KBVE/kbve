# KBVE

![Discord](https://img.shields.io/discord/342732838598082562?logo=discord)
![PyPI - Version](https://img.shields.io/pypi/v/kbve)

<a alt="KBVE Logo" href="https://kbve.com/" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/KBVE/kbve.com/main/public/assets/img/kbve.png" width="200"></a>

* * *

## What is KBVE?

KBVE is a collective that builds different programs, libraries and games!
This monorepo is the heart of all our applications, making it easier to manage.

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

### Install

Before getting started, we recommend that you use WSL, Linux or MacOS! Direct Windows is not supported.
Make sure you have Node 18+ with PNPM! Python 3.10+ / Poetry are optional if you wish to work with python.

#### Git

- `git clone https://github.com/KBVE/kbve.git` then enter the directory. `cd kbve`
- Then run -> `pnpm install`
- Launch `pnpm nx dev herbmail.com` - Should start a development server with Astro for HerbMail.com

* * *

## Library & Apps

The breakdown of libraries, packages and applications in this repo contains!

#### Atlas

Atlas is a [Python pip package](https://pypi.org/p/kbve) for generic baseline ml applications. 
Atlas currently only has `pyautogen` but a couple other packages are planned to be added within this month of October.

#### AstroVe

Astro VE is an Astro-based UX/UI library that empowers developers to seamlessly create elegant and adaptable UX/UI components, fostering an interactive and intuitive user experience across diverse website applications. 

#### React Appwrite

React-based Appwrite library for fast frontend deployment.

#### API

The API is current

### Apps

HerbMail.com
KBVE.com
RareIcon.com
Discord.sh