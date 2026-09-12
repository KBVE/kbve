//! What a fight teaches.
//!
//! `bevy_skills` owns the XP totals, the curves and the level-up messages; the
//! decisions it leaves to a game are which skills exist and what trains them.
//! Both live here.
//!
//! Two skills, because they reward opposite things. Swordsmanship pays per
//! point of damage landed, so a long fight against something tough trains it
//! even if the kill never comes; slaying pays per corpse, so finishing a fight
//! is worth more than chipping at one. Training only one of them would make
//! either the drawn-out fight or the quick kill dead time.

use bevy::prelude::*;
use bevy_skills::{
    BevySkillsPlugin, GrantXpMsg, LevelUpMsg, SkillDef, SkillId, SkillProfile, SkillRegistry,
    SkillSystems, XpCurve,
};
use combat::{AbilityLanded, Died, Outcome};

/// Damage dealt.
pub const SWORDSMANSHIP: &str = "swordsmanship";

/// Kills landed.
pub const SLAYING: &str = "slaying";

/// XP per point of damage that actually reached a target.
const XP_PER_DAMAGE: u64 = 2;

/// XP for the blow that finishes something.
const XP_PER_KILL: u64 = 60;

pub struct GameSkillsPlugin;

impl Plugin for GameSkillsPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(BevySkillsPlugin)
            .add_systems(Startup, register_combat_skills)
            .add_systems(
                Update,
                (train_on_damage, train_on_kill)
                    .before(SkillSystems::Grants)
                    .chain(),
            )
            .add_systems(Update, announce_levels.after(SkillSystems::Grants));
    }
}

/// The id the rest of the game uses to talk about a skill.
///
/// A hash of the ref, so it needs no lookup and no ordering guarantee against
/// whatever registered the definition.
pub fn skill(name: &str) -> SkillId {
    SkillId::from_ref(name)
}

/// Curve chosen so the first level arrives inside the first fight and the
/// tenth takes a session, rather than the crate default's flatter climb.
fn combat_curve() -> XpCurve {
    XpCurve::Quadratic {
        base: 120,
        scaling: 60,
        max_level: 99,
    }
}

fn register_combat_skills(mut registry: ResMut<SkillRegistry>) {
    for (r#ref, name) in [(SWORDSMANSHIP, "Swordsmanship"), (SLAYING, "Slaying")] {
        registry.register(SkillDef {
            r#ref: r#ref.to_string(),
            name: name.to_string(),
            xp_curve: Some(combat_curve()),
            category: "combat".to_string(),
            icon: None,
        });
    }
}

/// Pays the caster for damage that landed.
///
/// Absorbed damage is excluded: a shield swallowing the blow means the target
/// never felt it, and paying for it would make hitting a shielded enemy the
/// cheapest way to train.
fn train_on_damage(mut landings: MessageReader<AbilityLanded>, mut xp: MessageWriter<GrantXpMsg>) {
    for landing in landings.read() {
        let Outcome::Hit {
            damage, absorbed, ..
        } = landing.outcome
        else {
            continue;
        };

        let felt = (damage - absorbed).max(0) as u64;
        if felt == 0 {
            continue;
        }

        xp.write(GrantXpMsg {
            entity: landing.caster,
            skill: skill(SWORDSMANSHIP),
            amount: felt * XP_PER_DAMAGE,
        });
    }
}

/// Pays whoever landed the finishing blow.
///
/// `combat` leaves `killer` empty when a damage-over-time effect or a fall
/// finished the job, and nothing is trained in that case -- there is no one to
/// pay.
fn train_on_kill(mut deaths: MessageReader<Died>, mut xp: MessageWriter<GrantXpMsg>) {
    for death in deaths.read() {
        let Some(killer) = death.killer else {
            continue;
        };

        xp.write(GrantXpMsg {
            entity: killer,
            skill: skill(SLAYING),
            amount: XP_PER_KILL,
        });
    }
}

fn announce_levels(mut levels: MessageReader<LevelUpMsg>, registry: Res<SkillRegistry>) {
    for level in levels.read() {
        let name = registry
            .get(level.skill)
            .map(|def| def.name.as_str())
            .unwrap_or("a skill");
        info!("{name} is now {}", level.new_level);
    }
}

/// The two combat skills and where the entity stands in each.
pub fn combat_levels(profile: &SkillProfile) -> [(&'static str, u32); 2] {
    [
        ("Swordsmanship", profile.level(skill(SWORDSMANSHIP))),
        ("Slaying", profile.level(skill(SLAYING))),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::ecs::schedule::{LogLevel, ScheduleBuildSettings};
    use combat::Outcome;

    fn harness() -> (App, Entity, Entity) {
        let mut app = App::new();
        app.add_plugins(MinimalPlugins)
            .add_message::<AbilityLanded>()
            .add_message::<Died>()
            .add_plugins(GameSkillsPlugin);

        app.edit_schedule(Update, |schedule| {
            schedule.set_build_settings(ScheduleBuildSettings {
                ambiguity_detection: LogLevel::Error,
                ..default()
            });
        });

        let student = app.world_mut().spawn(SkillProfile::default()).id();
        let victim = app.world_mut().spawn_empty().id();
        app.update();
        (app, student, victim)
    }

    fn xp_in(app: &App, entity: Entity, name: &str) -> u64 {
        app.world()
            .entity(entity)
            .get::<SkillProfile>()
            .expect("student lost its profile")
            .total_xp(skill(name))
    }

    #[test]
    fn damage_that_landed_trains_swordsmanship() {
        let (mut app, student, victim) = harness();

        app.world_mut().write_message(AbilityLanded {
            caster: student,
            target: victim,
            outcome: Outcome::Hit {
                damage: 30,
                crit: false,
                absorbed: 0,
            },
        });
        app.update();

        assert_eq!(
            xp_in(&app, student, SWORDSMANSHIP),
            30 * XP_PER_DAMAGE,
            "a clean hit did not train swordsmanship"
        );
    }

    #[test]
    fn a_fully_absorbed_blow_trains_nothing() {
        let (mut app, student, victim) = harness();

        app.world_mut().write_message(AbilityLanded {
            caster: student,
            target: victim,
            outcome: Outcome::Hit {
                damage: 40,
                crit: false,
                absorbed: 40,
            },
        });
        app.update();

        assert_eq!(
            xp_in(&app, student, SWORDSMANSHIP),
            0,
            "a blow the shield swallowed still paid out"
        );
    }

    #[test]
    fn a_miss_trains_nothing() {
        let (mut app, student, victim) = harness();

        app.world_mut().write_message(AbilityLanded {
            caster: student,
            target: victim,
            outcome: Outcome::Miss,
        });
        app.update();

        assert_eq!(xp_in(&app, student, SWORDSMANSHIP), 0, "a miss paid out");
    }

    #[test]
    fn the_killer_is_the_one_who_gets_paid() {
        let (mut app, student, victim) = harness();

        app.world_mut().write_message(Died {
            entity: victim,
            killer: Some(student),
        });
        app.update();

        assert_eq!(
            xp_in(&app, student, SLAYING),
            XP_PER_KILL,
            "the kill did not train slaying"
        );
        assert_eq!(
            xp_in(&app, student, SWORDSMANSHIP),
            0,
            "the kill leaked into the wrong skill"
        );
    }

    #[test]
    fn a_death_with_no_killer_pays_no_one() {
        let (mut app, student, victim) = harness();

        app.world_mut().write_message(Died {
            entity: victim,
            killer: None,
        });
        app.update();

        assert_eq!(
            xp_in(&app, student, SLAYING),
            0,
            "a fall or a poison tick paid out slaying xp"
        );
    }

    #[test]
    fn enough_damage_raises_a_level() {
        let (mut app, student, victim) = harness();

        app.world_mut().write_message(AbilityLanded {
            caster: student,
            target: victim,
            outcome: Outcome::Hit {
                damage: 400,
                crit: false,
                absorbed: 0,
            },
        });
        app.update();

        let profile = app
            .world()
            .entity(student)
            .get::<SkillProfile>()
            .expect("student lost its profile");
        assert!(
            profile.level(skill(SWORDSMANSHIP)) > 0,
            "800 xp in one blow left the skill at level 0"
        );
    }

    #[test]
    fn training_one_skill_leaves_the_other_alone() {
        let (mut app, student, victim) = harness();

        app.world_mut().write_message(AbilityLanded {
            caster: student,
            target: victim,
            outcome: Outcome::Hit {
                damage: 25,
                crit: false,
                absorbed: 0,
            },
        });
        app.update();

        assert_eq!(
            xp_in(&app, student, SLAYING),
            0,
            "damage trained slaying as well"
        );
    }
}
