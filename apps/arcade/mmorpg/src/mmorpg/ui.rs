//! The heads-up display: what you are, what you have selected, and what you
//! can press.
//!
//! egui rather than bevy_ui, because this is the kind of interface that changes
//! every time the design does, and an immediate-mode pass costs nothing to
//! rewrite. It also matches `erust`, which pins the same egui version, so a
//! widget written against `egui::Ui` in either place works in both.
//!
//! Nothing here decides anything. Every value shown is read from the `combat`
//! components; if a bar is wrong, the bug is upstream of this file.

use bevy::prelude::*;
use bevy_egui::{EguiContexts, EguiPlugin, EguiPrimaryContextPass, egui};
use combat::{AbilityBar, ActiveEffects, Casting, Combatant, Dead};

use super::combat::{Faction, Target};
use super::player::Player;
use super::theme::ACTIVE;

pub struct UiPlugin;

impl Plugin for UiPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(EguiPlugin::default()).add_systems(
            EguiPrimaryContextPass,
            // The theme is applied first and every frame. egui holds its style
            // in the context rather than in a resource, and a context can be
            // rebuilt -- a window change, a new primary camera -- so setting it
            // once at startup is a theme that silently reverts later.
            (apply_theme, draw_frames, draw_action_bar).chain(),
        );
    }
}

const HEALTH_COLOUR: egui::Color32 = ACTIVE.red;
const RESOURCE_COLOUR: egui::Color32 = ACTIVE.blue;
const CAST_COLOUR: egui::Color32 = ACTIVE.yellow;

fn apply_theme(mut contexts: EguiContexts) -> Result {
    ACTIVE.apply(contexts.ctx_mut()?);
    Ok(())
}

/// A labelled bar.
///
/// egui's own `ProgressBar` cannot show a value and a fraction that disagree --
/// "142 / 220" beside a bar that is 64% full -- and in a game the number is
/// what a player reads to decide whether one more hit will do it.
fn bar(ui: &mut egui::Ui, fraction: f32, text: &str, colour: egui::Color32, width: f32) {
    let (rect, _) = ui.allocate_exact_size(egui::vec2(width, 18.0), egui::Sense::hover());
    let painter = ui.painter();

    painter.rect_filled(rect, 2.0, ACTIVE.crust);

    let mut filled = rect;
    filled.set_width(rect.width() * fraction.clamp(0.0, 1.0));
    painter.rect_filled(filled, 2.0, colour);

    painter.rect_stroke(
        rect,
        2.0,
        egui::Stroke::new(1.0, ACTIVE.surface1),
        egui::StrokeKind::Inside,
    );

    // On the bar's own colour rather than white: the fill is a light pastel, and
    // white text on Catppuccin red is close to unreadable.
    painter.text(
        rect.center(),
        egui::Align2::CENTER_CENTER,
        text,
        egui::FontId::proportional(12.0),
        ACTIVE.crust,
    );
}

/// The player's own frame, and the target's beside it.
fn draw_frames(
    mut contexts: EguiContexts,
    player: Query<(&Combatant, &Target, Option<&Casting>), With<Player>>,
    others: Query<(&Combatant, &ActiveEffects, Option<&Faction>, Has<Dead>)>,
) -> Result {
    let Ok((combatant, target, casting)) = player.single() else {
        return Ok(());
    };

    egui::Window::new("player")
        .title_bar(false)
        .resizable(false)
        .anchor(egui::Align2::LEFT_TOP, [16.0, 16.0])
        .show(contexts.ctx_mut()?, |ui| {
            ui.set_width(220.0);
            ui.label(egui::RichText::new("You").strong().color(ACTIVE.lavender));

            let health = &combatant.health;
            bar(
                ui,
                health.fraction(),
                &format!("{} / {}", health.current().max(0), health.max()),
                HEALTH_COLOUR,
                220.0,
            );

            let resource = &combatant.resource;
            let fraction = resource.current() as f32 / resource.max().max(1) as f32;
            bar(
                ui,
                fraction,
                &format!("{} / {}", resource.current(), resource.max()),
                RESOURCE_COLOUR,
                220.0,
            );

            // Only while casting. A cast bar that is always present, and empty
            // most of the time, teaches a player to stop looking at it.
            if let Some(casting) = casting {
                ui.add_space(4.0);
                bar(
                    ui,
                    casting.cast.progress(),
                    &format!("Casting slot {}", casting.slot + 1),
                    CAST_COLOUR,
                    220.0,
                );
            }
        });

    let Some((combatant, effects, faction, dead)) =
        target.0.and_then(|entity| others.get(entity).ok())
    else {
        return Ok(());
    };

    egui::Window::new("target")
        .title_bar(false)
        .resizable(false)
        .anchor(egui::Align2::CENTER_TOP, [0.0, 16.0])
        .show(contexts.ctx_mut()?, |ui| {
            ui.set_width(220.0);

            let name = match faction {
                Some(Faction::Hostile) => "Hostile",
                Some(Faction::Friendly) => "Friendly",
                None => "Target",
            };
            let accent = match faction {
                Some(Faction::Hostile) => ACTIVE.red,
                Some(Faction::Friendly) => ACTIVE.green,
                None => ACTIVE.subtext0,
            };
            ui.label(egui::RichText::new(name).strong().color(accent));

            let health = &combatant.health;
            bar(
                ui,
                if dead { 0.0 } else { health.fraction() },
                &if dead {
                    "Dead".to_string()
                } else {
                    format!("{} / {}", health.current().max(0), health.max())
                },
                HEALTH_COLOUR,
                220.0,
            );

            // Effects, so a poison that is doing the work is visible as the
            // reason the health bar keeps moving with nobody attacking.
            if !effects.0.is_empty() {
                ui.horizontal_wrapped(|ui| {
                    for effect in &effects.0 {
                        ui.label(
                            egui::RichText::new(format!("{:?} x{}", effect.kind, effect.stacks))
                                .small()
                                .color(if effect.kind.is_harmful() {
                                    ACTIVE.maroon
                                } else {
                                    ACTIVE.green
                                }),
                        );
                    }
                });
            }
        });

    Ok(())
}

/// The four slots along the bottom, with what is stopping each of them.
fn draw_action_bar(
    mut contexts: EguiContexts,
    player: Query<(&AbilityBar, &Combatant), With<Player>>,
) -> Result {
    let Ok((bar_state, combatant)) = player.single() else {
        return Ok(());
    };

    egui::Window::new("actions")
        .title_bar(false)
        .resizable(false)
        .anchor(egui::Align2::CENTER_BOTTOM, [0.0, -20.0])
        .show(contexts.ctx_mut()?, |ui| {
            ui.horizontal(|ui| {
                for (index, slot) in bar_state.slots.iter().enumerate() {
                    let cooling = !slot.cooldown.is_ready();
                    let affordable = combatant.resource.can_afford(slot.ability.cost);

                    // The reason a slot is unusable is worth more than the fact
                    // of it: out of mana and on cooldown want different actions
                    // from the player.
                    let colour = if cooling {
                        ACTIVE.surface0
                    } else if !affordable {
                        ACTIVE.surface1
                    } else {
                        ACTIVE.surface2
                    };

                    let (rect, _) =
                        ui.allocate_exact_size(egui::vec2(56.0, 56.0), egui::Sense::hover());
                    let painter = ui.painter();
                    painter.rect_filled(rect, 4.0, colour);

                    // A ready slot is outlined; an unusable one is not. Colour
                    // alone would leave the bar unreadable to a colour-blind
                    // player, and the outline reads at a glance either way.
                    let edge = if cooling || !affordable {
                        ACTIVE.overlay0
                    } else {
                        ACTIVE.lavender
                    };
                    painter.rect_stroke(
                        rect,
                        4.0,
                        egui::Stroke::new(if cooling || !affordable { 1.0 } else { 2.0 }, edge),
                        egui::StrokeKind::Inside,
                    );

                    painter.text(
                        rect.left_top() + egui::vec2(6.0, 4.0),
                        egui::Align2::LEFT_TOP,
                        format!("{}", index + 1),
                        egui::FontId::proportional(14.0),
                        ACTIVE.text,
                    );

                    let label = if cooling {
                        format!("{:.1}s", slot.cooldown.remaining().0 as f32 / 1000.0)
                    } else if slot.ability.cost > 0 {
                        format!("{} mp", slot.ability.cost)
                    } else {
                        String::new()
                    };

                    painter.text(
                        rect.center_bottom() - egui::vec2(0.0, 6.0),
                        egui::Align2::CENTER_BOTTOM,
                        label,
                        egui::FontId::proportional(12.0),
                        if cooling {
                            ACTIVE.peach
                        } else {
                            ACTIVE.subtext0
                        },
                    );
                }
            });

            ui.label(
                egui::RichText::new("Tab select  ·  Esc clear  ·  1-4 abilities")
                    .small()
                    .weak(),
            );
        });

    Ok(())
}
