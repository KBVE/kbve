# mod-bootlegger

**Fizzik Underbarrel** `<Bootleg Services>` — a goblin fixer for AzerothCore
3.3.5a who sells three gold-sink convenience services through gossip. No
vending, no chat commands, no client addon required.

> *"Psst — over here, friend. You didn't hear it from me, but ol' Fizzik can
> sort out just about any little... inconvenience. For the right price,
> 'course. Whaddya need?"*

## Features

### Character utilities
Pay Fizzik to flag your character for a **name**, **appearance**, **race**, or
**faction** change — the same at-login flags a GM would set. The change kicks
in on your next login. Only one pending change at a time; Fizzik hides the menu
until it's done.

### Profession advancement
Raise any profession you already know by **one tier per purchase** —
Journeyman, Expert, Artisan, Master, Grand Master — each at its own configurable
price. No skipping tiers, no discounts near a cap, and the server decides which
tier you're buying (crafted packets can't cheat past the ladder). Individual
tiers can be disabled to force the top ranks back to real trainers.

### Instance lock reset
Clear **all** your saved heroic dungeon locks or raid locks in one purchase.
Solo players confirm and go; grouped players choose "Just me" or "My whole
group" (one charge to the buyer, resets applied only to members who actually
hold matching locks).

### Pricing UX
Menu entries show live prices as coin icons, colored by affordability (gold =
you can pay, red = you can't). Affordable purchases get a confirm popup before
any money moves; unaffordable clicks get the standard "You don't have enough
money." error and charge nothing.

## Compatibility

- Stock [azerothcore/azerothcore-wotlk](https://github.com/azerothcore/azerothcore-wotlk) master
- [mod-playerbots/azerothcore-wotlk](https://github.com/mod-playerbots/azerothcore-wotlk)
  (group resets skip bots safely; no playerbot symbols in the source)
- Builds at `-std=c++14` (and forward-compatible with C++17)

## Install

1. Clone or link this repository into your AzerothCore `modules/` directory as
   `mod-bootlegger`.
2. Re-run CMake and rebuild the worldserver.
3. Copy `conf/mod_bootlegger.conf.dist` next to your `worldserver.conf` as
   `mod_bootlegger.conf` and tune the costs.
4. Start the worldserver — the SQL under `data/sql/db-world/` is applied
   automatically (it is idempotent and safe to re-run).

The NPC spawns in all ten capitals. **Spawn coordinates ship as placeholders**
near each city — reposition with `.gps` and update
`data/sql/db-world/mod_bootlegger.sql` for your server.

## Configuration

All costs are set in **gold** and converted internally at load.
`.reload config` applies changes without a restart.

| Key | Default | Purpose |
|---|---|---|
| `Bootleg.Enable` | `1` | Master switch. `0` = NPC gives the greeting only |
| `Bootleg.Utilities.Enable` | `1` | Utilities service |
| `Bootleg.Utilities.NameChange.Cost` | `10` | Name change |
| `Bootleg.Utilities.Customize.Cost` | `50` | Appearance change |
| `Bootleg.Utilities.RaceChange.Cost` | `500` | Race change |
| `Bootleg.Utilities.FactionChange.Cost` | `1000` | Faction change |
| `Bootleg.Professions.Enable` | `1` | Professions service |
| `Bootleg.Professions.<Tier>.Enable` | J/E/A `1`, M/GM `0` | Per-tier switch; a disabled tier blocks progression past it |
| `Bootleg.Professions.<Tier>.Cost` | `100`–`2500` | Per-tier price |
| `Bootleg.Professions.<Tier>.RequiredLevel` | `0` | Optional character-level gate (`0` = none) |
| `Bootleg.Instances.Enable` | `1` | Instance reset service |
| `Bootleg.Instances.Heroic.Enable` / `.Cost` | `1` / `10` | Heroic dungeon lock reset |
| `Bootleg.Instances.Raid.Enable` / `.Cost` | `1` / `100` | Raid lock reset |

`<Tier>` ∈ `Journeyman`, `Expert`, `Artisan`, `Master`, `GrandMaster`.
Full commented list: [conf/mod_bootlegger.conf.dist](conf/mod_bootlegger.conf.dist).

## Database footprint

Reserved **7M band** — see [AGENTS.md](AGENTS.md) cross-module table.

| Item | Value |
|---|---|
| `creature_template` entry | `7000000` |
| Display | `7179` (borrowed from creature 2685 — that row is never modified) |
| Spawn GUIDs | `7000100`–`7000109` (Stormwind, Ironforge, Undercity, Silvermoon, Exodar, Orgrimmar, Thunder Bluff, Darnassus, Dalaran, Shattrath) |
| `npc_text` | `7000200` (greeting) |
| Script | `npc_bootlegger`, `npcflag = 1` (gossip only) |

If these IDs collide with other custom content on your server, adjust the
variables at the top of the install and uninstall SQL before applying.

**Migrating from the old 3460k band:** if you previously applied install SQL with
entry `3460604`, run uninstall with those old `@ENTRY`/`@GUID`/`@TEXT_ID` values
(or delete those rows manually), then re-apply the current install SQL.

## Uninstall

Run `data/sql/uninstall/mod_bootlegger_uninstall.sql` against the world
database manually, then remove the module and rebuild. It deletes the spawns,
template, model row, and greeting text — nothing else.

## FAQ

**Why doesn't the NPC sell items?** By design — Fizzik is services-only.
There is no vendor surface, no `item_template` changes, and no chat commands.

**A purchase menu entry disappeared.** Entries hide when they don't apply: a
pending character change hides utilities, a maxed/blocked profession hides its
line, and the instance menu only lists lock types you actually hold.

**Is it safe with playerbots?** Yes. Group resets iterate with stock checks
only; bots without real sessions are skipped.

## License

GPLv2 (see [LICENSE](LICENSE)). Combined with AzerothCore, distribution of the
combined work inherits GPLv2 copyleft.

---

*Developer/agent documentation: [AGENTS.md](AGENTS.md) ·
Behavior contract: [docs/mod-bootlegger-spec.md](docs/mod-bootlegger-spec.md)*
