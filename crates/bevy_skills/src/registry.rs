//! Skill definitions + registry resource.

use std::collections::HashMap;

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

/// Skill definition registry.
///
/// Loaded once at startup and provides lookups by [`SkillId`] or string
/// ref. Games register their skills here before any XP is granted.
/// Used as a `Resource` when the `bevy` feature is enabled.
#[derive(Default)]
#[cfg_attr(feature = "bevy", derive(bevy::prelude::Resource))]
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

    #[cfg(feature = "bevy")]
    pub fn register_professions(&mut self, db: &bevy_items::profession::ProfessionDb) {
        for profession in db.professions() {
            let xp_curve = profession
                .curve
                .as_ref()
                .and_then(|c| match c.kind.as_str() {
                    "polynomial" => Some(XpCurve::Polynomial {
                        base_xp: c.base_xp,
                        growth_factor: c.growth_factor,
                        max_level: c.max_level,
                    }),
                    _ => None,
                });
            self.register(SkillDef {
                r#ref: profession.r#ref.clone(),
                name: profession.name.clone(),
                category: profession.category.clone(),
                icon: profession.emoji.clone(),
                xp_curve,
            });
        }
    }

    #[cfg(feature = "bevy")]
    pub fn register_gathering_fallback(&mut self) {
        for (r#ref, name) in [
            ("woodcutting", "Woodcutting"),
            ("mining", "Mining"),
            ("foraging", "Foraging"),
        ] {
            self.register(SkillDef {
                r#ref: r#ref.into(),
                name: name.into(),
                category: "gathering".into(),
                icon: None,
                xp_curve: None,
            });
        }
    }
}

#[cfg(all(test, feature = "bevy"))]
mod professiondb_tests {
    use super::*;

    const FIXTURE: &str = r#"
    {
        "professions": [
            {
                "ref": "mining",
                "name": "Mining",
                "category": "PROFESSION_CATEGORY_GATHERING",
                "emoji": "⛏️",
                "actions": [],
                "experienceCurve": {"kind": "CURVE_KIND_POLYNOMIAL", "baseXp": 50, "growthFactor": 1.6, "maxLevel": 99}
            },
            {
                "ref": "cooking",
                "name": "Cooking",
                "category": "PROFESSION_CATEGORY_PRODUCTION",
                "emoji": "🍳",
                "actions": []
            }
        ]
    }
    "#;

    #[test]
    fn register_professions_builds_one_skill_per_profession() {
        let db = bevy_items::profession::ProfessionDb::from_json(FIXTURE).unwrap();
        assert_eq!(db.professions().len(), 2);

        let mut r = SkillRegistry::default();
        r.register_professions(&db);

        assert_eq!(r.len(), 2);
        assert!(r.id_for_ref("mining").is_some());
        assert!(r.id_for_ref("cooking").is_some());

        let mining = r.get_by_ref("mining").unwrap();
        assert_eq!(mining.name, "Mining");
        assert_eq!(mining.category, "gathering");
        assert_eq!(mining.icon.as_deref(), Some("⛏️"));
    }

    #[test]
    fn register_professions_sources_polynomial_curve() {
        let db = bevy_items::profession::ProfessionDb::from_json(FIXTURE).unwrap();

        let mut r = SkillRegistry::default();
        r.register_professions(&db);

        let mining_curve = r.xp_curve(r.id_for_ref("mining").unwrap());
        assert!(matches!(
            mining_curve,
            XpCurve::Polynomial { base_xp: 50, .. }
        ));

        let cooking_curve = r.xp_curve(r.id_for_ref("cooking").unwrap());
        assert!(matches!(cooking_curve, XpCurve::Quadratic { .. }));
    }

    #[test]
    fn register_gathering_fallback_builds_three() {
        let mut r = SkillRegistry::default();
        r.register_gathering_fallback();

        assert_eq!(r.len(), 3);
        for s in ["woodcutting", "mining", "foraging"] {
            assert!(r.id_for_ref(s).is_some());
        }
    }
}
