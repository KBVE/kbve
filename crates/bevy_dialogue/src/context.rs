//! What the player has done, and whether that satisfies a condition.

use std::collections::{HashMap, HashSet};

use bevy::prelude::*;
use kbve_proto::kbve::common::v1::QuestStatus;

use crate::proto::DialogueCondition;

/// The player state a condition is evaluated against.
///
/// A conversation graph asks questions about the player -- which flags are set,
/// which quests are underway, how often this graph has been entered -- and this
/// is what answers them. It is deliberately a plain struct the caller fills in
/// rather than a trait over the game's own state: a dungeon crawler and a town
/// scene disagree about almost everything except these questions.
///
/// A default context knows nothing, and satisfies only conditions that require
/// nothing. That is the right default: a graph that asks for a flag should not
/// open just because the caller has not wired flags up yet.
#[derive(Resource, Debug, Default, Clone)]
pub struct DialogueContext {
    pub flags: HashSet<String>,
    pub level: i32,
    /// Quest states by ULID text, as `kbve_proto::ulid_text` renders it.
    pub quests: HashMap<String, QuestStatus>,
    /// Item ULIDs the player is carrying, in the same textual form.
    pub items: HashSet<String>,
    pub class: Option<String>,
    /// Reputation per faction ULID.
    pub reputation: HashMap<String, i32>,
    /// Disposition per NPC ULID.
    pub disposition: HashMap<String, i32>,
    /// Skills the player has passed, e.g. `"persuasion:30"` is satisfied by a
    /// `persuasion` entry of 30 or more.
    pub skills: HashMap<String, i32>,
    /// How many times each graph has been entered, keyed by graph ref.
    pub visits: HashMap<String, i32>,
    /// Choices already taken, for the `once` flag, as `"<graph>/<node>/<id>"`.
    pub taken: HashSet<String>,
    /// Nodes already visited, for the node-level `once` flag.
    pub seen_nodes: HashSet<String>,
}

impl DialogueContext {
    /// Whether the condition holds. `None` always holds.
    ///
    /// Every populated field is a conjunct, which is what the schema says and
    /// what makes an unpopulated condition mean "always".
    pub fn allows(&self, condition: Option<&DialogueCondition>, graph_ref: &str) -> bool {
        let Some(c) = condition else {
            return true;
        };

        if !c.required_flags.iter().all(|f| self.flags.contains(f)) {
            return false;
        }
        if c.blocked_flags.iter().any(|f| self.flags.contains(f)) {
            return false;
        }
        if c.min_level.is_some_and(|min| self.level < min) {
            return false;
        }
        if c.max_level.is_some_and(|max| self.level > max) {
            return false;
        }
        if !c.quests.iter().all(|q| self.quest_ok(q)) {
            return false;
        }

        let missing_item = c.required_item_refs.iter().any(|item| {
            kbve_proto::ulid_text(Some(item)).is_none_or(|text| !self.items.contains(&text))
        });
        if missing_item {
            return false;
        }

        if let Some(required) = &c.required_class {
            if self.class.as_deref() != Some(required.as_str()) {
                return false;
            }
        }
        if let Some(min) = c.min_reputation {
            let faction = c.faction_ref.as_ref().and_then(|f| kbve_proto::ulid_text(Some(f)));
            // A reputation floor with no faction names no score to compare, so
            // it cannot be satisfied rather than being quietly ignored.
            match faction.and_then(|f| self.reputation.get(&f).copied()) {
                Some(score) if score >= min => {}
                _ => return false,
            }
        }
        if let Some(min) = c.min_disposition {
            let npc = c.faction_ref.as_ref().and_then(|f| kbve_proto::ulid_text(Some(f)));
            match npc.and_then(|n| self.disposition.get(&n).copied()) {
                Some(score) if score >= min => {}
                _ => return false,
            }
        }
        if let Some(check) = &c.skill_check {
            if !self.skill_ok(check) {
                return false;
            }
        }

        let visits = self.visits.get(graph_ref).copied().unwrap_or(0);
        if c.min_visits.is_some_and(|min| visits < min) {
            return false;
        }
        if c.max_visits.is_some_and(|max| visits > max) {
            return false;
        }

        // The escape hatch is not evaluated. The schema asks authors to prefer
        // a real field precisely because an expression is opaque to every
        // consumer that does not implement the same evaluator, and this one
        // does not. Treating it as satisfied would let a guarded node open;
        // refusing it is the safer of the two ways to be wrong.
        if c.expression.is_some() {
            return false;
        }

        true
    }

    fn quest_ok(&self, q: &crate::proto::QuestCondition) -> bool {
        let Some(key) = q.quest_ref.as_ref().and_then(|r| kbve_proto::ulid_text(Some(r))) else {
            return false;
        };
        let state = self.quests.get(&key).copied().unwrap_or(QuestStatus::Unspecified);
        if q.states.is_empty() {
            // "Empty means any state but LOCKED" -- and a quest the player has
            // never encountered is not in any state at all.
            return !matches!(state, QuestStatus::Locked | QuestStatus::Unspecified);
        }
        q.states.contains(&(state as i32))
    }

    /// `"persuasion:30"` -- the skill, then the value it must reach.
    ///
    /// A check that does not parse fails rather than passing: an author typo
    /// should close a door, not open one.
    fn skill_ok(&self, check: &str) -> bool {
        let Some((skill, threshold)) = check.split_once(':') else {
            return false;
        };
        let Ok(threshold) = threshold.trim().parse::<i32>() else {
            return false;
        };
        self.skills.get(skill.trim()).copied().unwrap_or(0) >= threshold
    }
}
