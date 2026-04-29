//! Skill definitions + registry resource.

use std::collections::HashMap;

use bevy::prelude::*;

use crate::xp::XpCurve;

/// Stable identifier for a skill, derived from its string ref via a
/// `DefaultHasher`. Two refs that hash to the same value would collide
/// — the namespace is small enough in practice (dozens of skills, not
/// millions) that collisions are not a real concern.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct SkillId(pub u64);

impl SkillId {
    /// Create a skill ID from a ref using a stable hash.
    ///
    /// # Arguments
    ///
    /// * `r` — URL-safe ref string (e.g. `"mining"`, `"swordsmanship"`).
    pub fn from_ref(r: &str) -> Self {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        r.hash(&mut h);
        Self(h.finish())
    }
}

/// Definition of a single skill type.
///
/// Define one of these per skill the game supports, then register them
/// into a [`SkillRegistry`] at startup. Designed for JSON / YAML
/// loading.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SkillDef {
    /// URL-safe identifier (e.g. `"mining"`, `"cooking"`,
    /// `"swordsmanship"`).
    pub r#ref: String,
    /// Display name shown in UI.
    pub name: String,
    /// XP curve for this skill. `None` means use the registry default.
    pub xp_curve: Option<XpCurve>,
    /// Skill category for grouping in UI (e.g. `"gathering"`,
    /// `"crafting"`, `"combat"`).
    pub category: String,
    /// Icon or sprite path. Optional.
    pub icon: Option<String>,
}

/// Bevy resource holding all skill definitions.
///
/// Loaded once at startup and provides lookups by [`SkillId`] or string
/// ref. Games register their skills here before any XP is granted.
#[derive(Resource, Default)]
pub struct SkillRegistry {
    defs: HashMap<SkillId, SkillDef>,
    by_ref: HashMap<String, SkillId>,
    default_curve: XpCurve,
}

impl SkillRegistry {
    /// Register a new skill definition.
    ///
    /// # Returns
    ///
    /// The [`SkillId`] derived from `def.r#ref`. Re-registering the
    /// same ref overwrites the previous definition.
    pub fn register(&mut self, def: SkillDef) -> SkillId {
        let id = SkillId::from_ref(&def.r#ref);
        self.by_ref.insert(def.r#ref.clone(), id);
        self.defs.insert(id, def);
        id
    }

    /// Bulk-register skills from a JSON array of [`SkillDef`] objects.
    ///
    /// # Arguments
    ///
    /// * `json_str` — JSON array (e.g. `[{"ref": "mining", ...}, ...]`).
    ///
    /// # Errors
    ///
    /// Returns the underlying [`serde_json::Error`] on parse failure.
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

    /// Look up a skill definition by its string ref.
    pub fn get_by_ref(&self, r: &str) -> Option<&SkillDef> {
        let id = self.by_ref.get(r)?;
        self.defs.get(id)
    }

    /// Resolve a string ref to its [`SkillId`].
    pub fn id_for_ref(&self, r: &str) -> Option<SkillId> {
        self.by_ref.get(r).copied()
    }

    /// Get the XP curve for a skill, falling back to the registry
    /// default when the [`SkillDef`] has no override.
    pub fn xp_curve(&self, id: SkillId) -> &XpCurve {
        self.defs
            .get(&id)
            .and_then(|d| d.xp_curve.as_ref())
            .unwrap_or(&self.default_curve)
    }

    /// Set the default XP curve used when a skill has no
    /// [`SkillDef::xp_curve`] override.
    pub fn set_default_curve(&mut self, curve: XpCurve) {
        self.default_curve = curve;
    }

    /// Total number of registered skills.
    pub fn len(&self) -> usize {
        self.defs.len()
    }

    /// Returns `true` when no skills are registered.
    pub fn is_empty(&self) -> bool {
        self.defs.is_empty()
    }

    /// Iterate over all registered skills.
    pub fn iter(&self) -> impl Iterator<Item = (SkillId, &SkillDef)> {
        self.defs.iter().map(|(&id, def)| (id, def))
    }

    /// Find every skill in the given category.
    ///
    /// # Arguments
    ///
    /// * `category` — exact match against [`SkillDef::category`].
    pub fn find_by_category(&self, category: &str) -> Vec<(SkillId, &SkillDef)> {
        self.defs
            .iter()
            .filter(|(_, def)| def.category == category)
            .map(|(&id, def)| (id, def))
            .collect()
    }
}
