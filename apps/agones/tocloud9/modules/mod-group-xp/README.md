# mod-group-xp

Removes AzerothCore's grouping XP penalty and pays a bonus for grouping instead.

## What the core does

`KillRewarder::_RewardPlayer` computes, for each rewarded member:

```
rate = xp_in_group_rate(count, isRaid) * playerLevel / aliveSumLevel
```

`xp_in_group_rate` is `1.0` for one or two members, `1.166` for three, `1.3`
for four, `1.4` for five, and `1.0` for a raid. The rate is then applied to the
mob's base XP in `_RewardXP`. Five equal-level members therefore take
`1.4 / 5 = 0.28` of solo XP each — grouping is a straight loss, and it gets
worse in a raid. Playerbots in the party count toward `aliveSumLevel` the same
as humans.

## What this module does

It hooks `PlayerScript::OnPlayerRewardKillRewarder`, which hands over that
`rate` by reference immediately before the reward is applied. Working from the
core's own number means the module never has to reconstruct the member count or
the level sum:

```
rate = min(max(rate, 1.0) * (1 + Bonus), MaxRate)
```

The `max` is `GroupXP.SoloParity`. Everything downstream is untouched — the
gray-member half penalty, the level cutoff that zeroes XP, and
`SPELL_AURA_MOD_XP_PCT` all still apply, and solo kills never enter the hook
body because it returns early when the player has no group.

## Options

`conf/mod_group_xp.conf.dist`. All six are overridable at runtime by env, with
the usual `AC_` mapping (`GroupXP.SoloParity` → `AC_GROUP_XP_SOLO_PARITY`).

| option                  | default | effect                                                |
| ----------------------- | ------- | ----------------------------------------------------- |
| `GroupXP.Enable`        | `1`     | master switch; `0` is stock behaviour                 |
| `GroupXP.SoloParity`    | `1`     | floor the rate at `1.0` — this is the penalty removal |
| `GroupXP.Bonus`         | `0.0`   | extra fraction on top; `0.10` pays 10% for grouping   |
| `GroupXP.RaidGroups`    | `1`     | apply to raids as well as parties                     |
| `GroupXP.Battlegrounds` | `0`     | apply to kills inside a battleground                  |
| `GroupXP.MaxRate`       | `5.0`   | clamp, guarding against a mistyped `Bonus`            |

## Deployment

The build stage copies the module into `/repo/modules/` before cmake — the core
enumerates `modules/` at configure time, so it has to land before then. The
runtime stage copies `conf/mod_group_xp.conf.dist` to
`/repo/bin/etc/modules/mod_group_xp.conf`: cmake installs module confs into the
build stage only, and an option absent from a loaded conf is not env-overridable.

Live values ship in `apps/kube/agones/tocloud9/manifests/worldserver-fleet.yaml`.
