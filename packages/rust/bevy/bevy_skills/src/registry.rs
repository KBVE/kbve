use std::collections::HashMap;

use bevy::prelude::*;

use crate::xp::XpCurve;

/// Stable identifier for a skill, derived from its slug.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct SkillId(pub u64);

impl SkillId {
    /// Create a skill ID from a slug using a stable hash.
    pub fn from_slug(slug: &str) -> Self {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        slug.hash(&mut h);
        Self(h.finish())
    }
}

/// Definition of a single skill type.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SkillDef {
    /// URL-safe identifier (e.g. "mining", "cooking", "swordsmanship").
    pub slug: String,
    /// Display name shown in UI.
    pub name: String,
    /// XP curve for this skill. If None, uses the registry default.
    pub xp_curve: Option<XpCurve>,
    /// Skill category for grouping in UI (e.g. "gathering", "crafting", "combat").
    pub category: String,
    /// Icon or sprite path.
    pub icon: Option<String>,
}

/// Bevy resource holding all skill definitions.
///
/// Loaded at startup. Provides lookups by [`SkillId`] or slug.
/// Games register their skills here before any XP is granted.
#[derive(Resource, Default)]
pub struct SkillRegistry {
    defs: HashMap<SkillId, SkillDef>,
    by_slug: HashMap<String, SkillId>,
    default_curve: XpCurve,
}

impl SkillRegistry {
    /// Register a new skill definition.
    pub fn register(&mut self, def: SkillDef) -> SkillId {
        let id = SkillId::from_slug(&def.slug);
        self.by_slug.insert(def.slug.clone(), id);
        self.defs.insert(id, def);
        id
    }

    /// Bulk-register skills from a JSON string.
    ///
    /// Expects an array of `SkillDef` objects.
    pub fn from_json(json_str: &str) -> Result<Self, serde_json::Error> {
        let defs: Vec<SkillDef> = serde_json::from_str(json_str)?;
        let mut registry = Self::default();
        for def in defs {
            registry.register(def);
        }
        Ok(registry)
    }

    /// Look up a skill definition by ID.
    pub fn get(&self, id: SkillId) -> Option<&SkillDef> {
        self.defs.get(&id)
    }

    /// Look up a skill definition by slug.
    pub fn get_by_slug(&self, slug: &str) -> Option<&SkillDef> {
        let id = self.by_slug.get(slug)?;
        self.defs.get(id)
    }

    /// Resolve a slug to a [`SkillId`].
    pub fn id_for_slug(&self, slug: &str) -> Option<SkillId> {
        self.by_slug.get(slug).copied()
    }

    /// Get the XP curve for a skill, falling back to the registry default.
    pub fn xp_curve(&self, id: SkillId) -> &XpCurve {
        self.defs
            .get(&id)
            .and_then(|d| d.xp_curve.as_ref())
            .unwrap_or(&self.default_curve)
    }

    /// Set the default XP curve used when a skill has no override.
    pub fn set_default_curve(&mut self, curve: XpCurve) {
        self.default_curve = curve;
    }

    /// Total number of registered skills.
    pub fn len(&self) -> usize {
        self.defs.len()
    }

    /// Whether any skills are registered.
    pub fn is_empty(&self) -> bool {
        self.defs.is_empty()
    }

    /// Iterate over all registered skills.
    pub fn iter(&self) -> impl Iterator<Item = (SkillId, &SkillDef)> {
        self.defs.iter().map(|(&id, def)| (id, def))
    }

    /// Find all skills in a given category.
    pub fn find_by_category(&self, category: &str) -> Vec<(SkillId, &SkillDef)> {
        self.defs
            .iter()
            .filter(|(_, def)| def.category == category)
            .map(|(&id, def)| (id, def))
            .collect()
    }
}
