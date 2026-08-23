# mod-old-world-flying

Lets flying mounts work in Eastern Kingdoms and Kalimdor, and optionally drops
the Cold Weather Flying requirement in Northrend.

## What actually blocks old-world flying

Not the client. `SpellInfo::CheckLocation` refuses the cast:

```cpp
if (HasAttribute(SPELL_ATTR4_ONLY_FLYING_AREAS) && (area_id || zone_id))
{
    if (!areaEntry || !areaEntry->IsFlyable() || ... )
        return SPELL_FAILED_INCORRECT_AREA;
}
```

and `IsFlyable()` is one flag:

```cpp
[[nodiscard]] bool IsFlyable() const { return flags & AREA_FLAG_OUTLAND; }
```

Old-world zones do not carry `AREA_FLAG_OUTLAND`, so every spell marked
`SPELL_ATTR4_ONLY_FLYING_AREAS` is rejected there. The check runs again on area
update, so casting it triggered only delays the removal.

Editing `AreaTable.dbc` would work but it is client data as much as server data,
which means shipping a patch archive to every player. Clearing the attribute
server-side needs nothing from the client.

## How it works

`GlobalScript::OnLoadSpellCustomAttr` receives a mutable `SpellInfo*` after the
core finishes its own DBC corrections. This module clears
`SPELL_ATTR4_ONLY_FLYING_AREAS`, so the whole area block in `CheckLocation` is
skipped for those spells.

With `OldWorldFlying.IgnoreColdWeatherFlying`, it also sets
`SPELL_ATTR7_IGNORES_COLD_WEATHER_FLYING_REQUIREMENT`, which Blizzard describes
as "set for loaner mounts" — the exact case a rental is.

Attributes are read once at spell load, so a config change needs a restart.

## The client does allow it

Worth recording, because it is the assumption everything here rests on: the
3.3.5 client will fly in the old world when the server says so. A flying
_vehicle_ spawned in Stormwind flies fine, and vehicle flight sets the same
`MOVEMENTFLAG_CAN_FLY` on the mover that a mount does. The restriction is the
spell's area check, not the client refusing to leave the ground.

## Scope

An allowlist, not a blanket change. A spell is only touched if it clears three
tests: it carries `SPELL_ATTR4_ONLY_FLYING_AREAS`, it actually grants flight
(`SPELL_AURA_MOUNTED` or `SPELL_AURA_FLY`), and its id is named in
`OldWorldFlying.Spells`.

The default list is `64681,64761` — **Loaned Gryphon** and **Loaned Wind Rider**.
They are the only two mount spells in `Spell.dbc` already flagged
`SPELL_ATTR7_IGNORES_COLD_WEATHER_FLYING_REQUIREMENT`, which `SharedDefines.h`
describes as "set for loaner mounts". Blizzard built them to be handed out
temporarily, they are faction-paired, and no player owns one, so unrestricting
them changes nothing about anyone's own mounts.

For reference, the wider sets in `Spell.dbc` (49,839 records):

| Set                                   | Count |
| ------------------------------------- | ----- |
| carry `SPELL_ATTR4_ONLY_FLYING_AREAS` | 118   |
| of those, grant flight                | 110   |
| unrestricted by default here          | 2     |

`OldWorldFlying.AllFlightSpells = 1` widens it to all 110, which frees every
player's own flying mounts in the old world. That is a server-wide gameplay
change and is off by default.

## Config

| Option                                   | Default       | Effect                                      |
| ---------------------------------------- | ------------- | ------------------------------------------- |
| `OldWorldFlying.Enable`                  | `1`           | master switch                               |
| `OldWorldFlying.Spells`                  | `64681,64761` | spell ids to unrestrict                     |
| `OldWorldFlying.AllFlightSpells`         | `0`           | ignore the list, free all 110 flight spells |
| `OldWorldFlying.IgnoreColdWeatherFlying` | `1`           | Northrend flight without spell 54197        |

## Verified

`-fsyntax-only` over both translation units against
`3kynox/azerothcore-wotlk@35a34b6` plus `3kynox/mod-playerbots@d9c80b3`:
`SYNTAX_CHECK_EXIT 0`, no errors or warnings.

Not tested at runtime. No player has taken off in Elwynn yet.

## License

GPL-2.0-or-later, matching AzerothCore.
