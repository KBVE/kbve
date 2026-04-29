# bevy_skills

Skill progression system for Bevy games. Tracks per-entity XP, computes levels via a configurable [`XpCurve`], and gates interactions through skill-check messages.

## Why

Most Bevy games re-implement XP / level tracking from scratch. `bevy_skills` ships:

- Message-driven XP grants (decoupled from gameplay systems).
- Quadratic XP curve with a 99-level cap by default — RuneScape-style.
- Per-skill curve overrides (combat skills curve harder than gathering).
- Skill checks for content gating (mining iron requires mining level 15).
- Plain Rust core: works in headless / Discord-bot / dedicated-server consumers via [`SkillProfile::grant_xp_direct`] and [`SkillProfile::set_level_direct`].

## Quick start

```rust,ignore
use bevy::prelude::*;
use bevy_skills::{
    BevySkillsPlugin, SkillProfile, SkillRegistry, SkillDef, SkillId,
    GrantXpMsg, LevelUpMsg,
};

fn main() {
    App::new()
        .add_plugins(BevySkillsPlugin)
        .add_systems(Startup, register_skills)
        .add_systems(Update, on_level_up)
        .run();
}

fn register_skills(mut registry: ResMut<SkillRegistry>) {
    registry.register(SkillDef {
        r#ref: "mining".into(),
        name: "Mining".into(),
        xp_curve: None,        // use registry default
        category: "gathering".into(),
        icon: None,
    });
}

fn award_mining_xp(
    mut commands: Commands,
    mut writer: MessageWriter<GrantXpMsg>,
    player: Query<Entity, With<SkillProfile>>,
) {
    for entity in &player {
        writer.write(GrantXpMsg {
            entity,
            skill: SkillId::from_ref("mining"),
            amount: 25,
        });
    }
}

fn on_level_up(mut reader: MessageReader<LevelUpMsg>) {
    for msg in reader.read() {
        info!("entity {:?} reached level {} (from {})",
            msg.entity, msg.new_level, msg.old_level);
    }
}
```

## Surface

| Item                    | Purpose                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| [`BevySkillsPlugin`]    | Registers resources, messages, systems                                 |
| [`SkillRegistry`]       | Catalogue of registered [`SkillDef`]s, default XP curve                |
| [`SkillDef`]            | Definition of one skill (ref, name, category, optional curve override) |
| [`SkillId`]             | Stable hash-derived identifier for a skill                             |
| [`SkillProfile`]        | Component holding per-entity XP + cached levels                        |
| [`SkillEntry`]          | Single skill's `(total_xp, level)`                                     |
| [`XpCurve`]             | Quadratic XP curve `base * n + scaling * n²`                           |
| [`GrantXpMsg`]          | Request: add XP to an entity's skill                                   |
| [`LevelUpMsg`]          | Notification: an entity leveled up                                     |
| [`SkillCheckMsg`]       | Request: does the entity meet a level requirement?                     |
| [`SkillCheckResultMsg`] | Response to [`SkillCheckMsg`]                                          |

## XP curve

Default formula: `xp_for_level(n) = 50 * n + 25 * n²`, capped at level 99.

| Level | Total XP | XP from previous |
| ----- | -------: | ---------------: |
| 1     |       75 |               75 |
| 5     |      875 |              250 |
| 10    |    3 000 |              525 |
| 50    |   65 000 |            2 625 |
| 99    |  250 074 |            5 100 |

Override per skill via `SkillDef::xp_curve = Some(XpCurve { base, scaling, max_level })`. Override the registry default via `SkillRegistry::set_default_curve`.

## Headless usage

For Discord bots / dedicated servers without a full Bevy app, drive [`SkillProfile`] directly:

```rust,ignore
use bevy_skills::{SkillProfile, SkillId, XpCurve};

let mut profile = SkillProfile::default();
let mining = SkillId::from_ref("mining");
let curve = XpCurve::default();

profile.grant_xp_direct(mining, 100);
let level = curve.level_for_xp(profile.total_xp(mining));
profile.set_level_direct(mining, level);
```

## License

MIT

[`BevySkillsPlugin`]: https://docs.rs/bevy_skills/latest/bevy_skills/struct.BevySkillsPlugin.html
[`SkillRegistry`]: https://docs.rs/bevy_skills/latest/bevy_skills/struct.SkillRegistry.html
[`SkillDef`]: https://docs.rs/bevy_skills/latest/bevy_skills/struct.SkillDef.html
[`SkillId`]: https://docs.rs/bevy_skills/latest/bevy_skills/struct.SkillId.html
[`SkillProfile`]: https://docs.rs/bevy_skills/latest/bevy_skills/struct.SkillProfile.html
[`SkillEntry`]: https://docs.rs/bevy_skills/latest/bevy_skills/struct.SkillEntry.html
[`XpCurve`]: https://docs.rs/bevy_skills/latest/bevy_skills/struct.XpCurve.html
[`GrantXpMsg`]: https://docs.rs/bevy_skills/latest/bevy_skills/struct.GrantXpMsg.html
[`LevelUpMsg`]: https://docs.rs/bevy_skills/latest/bevy_skills/struct.LevelUpMsg.html
[`SkillCheckMsg`]: https://docs.rs/bevy_skills/latest/bevy_skills/struct.SkillCheckMsg.html
[`SkillCheckResultMsg`]: https://docs.rs/bevy_skills/latest/bevy_skills/struct.SkillCheckResultMsg.html
[`SkillProfile::grant_xp_direct`]: https://docs.rs/bevy_skills/latest/bevy_skills/struct.SkillProfile.html#method.grant_xp_direct
[`SkillProfile::set_level_direct`]: https://docs.rs/bevy_skills/latest/bevy_skills/struct.SkillProfile.html#method.set_level_direct
