# bevy_skills

Skill progression system for Bevy games — tracks XP, levels, and gates interactions by skill requirements.

## Usage

```rust
use bevy::prelude::*;
use bevy_skills::{BevySkillsPlugin, SkillProfile, SkillId, GrantXpMsg};

fn main() {
    App::new()
        .add_plugins(BevySkillsPlugin)
        .run();
}
```

## Key Types

- `BevySkillsPlugin` — main plugin entry point
- `SkillProfile` — ECS component tracking a player's skills
- `SkillRegistry` — resource defining available skills
- `SkillId` / `SkillDef` / `SkillEntry` — skill definitions
- `XpCurve` — level-up thresholds
- `GrantXpMsg` / `LevelUpMsg` / `SkillCheckMsg` — message events

## License

MIT
