use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct RawRoot {
    professions: Vec<RawProfession>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawProfession {
    #[serde(rename = "ref")]
    ref_: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    category: String,
    #[serde(default)]
    emoji: Option<String>,
    #[serde(default)]
    experience_curve: Option<RawExperienceCurve>,
    #[serde(default)]
    actions: Vec<RawAction>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawExperienceCurve {
    #[serde(default)]
    kind: String,
    #[serde(default)]
    base_xp: u64,
    #[serde(default)]
    growth_factor: f64,
    #[serde(default)]
    max_level: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawAction {
    #[serde(rename = "ref")]
    ref_: String,
    #[serde(default)]
    required_level: u32,
    #[serde(default)]
    xp_reward: u32,
    #[serde(default)]
    resource_node_ref: Option<String>,
    #[serde(default)]
    inputs: Vec<RawItemStack>,
    #[serde(default)]
    outputs: Vec<RawItemStack>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawItemStack {
    item_ref: String,
    quantity: u32,
}

#[derive(Debug)]
pub enum ProfessionLoadError {
    Parse(serde_json::Error),
}

impl std::fmt::Display for ProfessionLoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Parse(e) => write!(f, "professiondb JSON parse error: {e}"),
        }
    }
}

impl std::error::Error for ProfessionLoadError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GatherInfo {
    pub skill_ref: String,
    pub required_level: u32,
    pub xp_reward: u32,
    pub resource_node_ref: String,
}

/// Profession metadata — the skill definition side of professiondb, used by
/// engines to build their skill registry from data instead of hardcoding it.
#[derive(Debug, Clone, PartialEq)]
pub struct ProfessionInfo {
    pub r#ref: String,
    pub name: String,
    pub category: String,
    pub emoji: Option<String>,
    pub max_level: u32,
    pub curve: Option<ProfessionCurve>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProfessionCurve {
    pub kind: String,
    pub base_xp: u64,
    pub growth_factor: f64,
    pub max_level: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompressInfo {
    pub target_ref: String,
    pub ratio: u32,
}

#[derive(Debug, Default)]
pub struct ProfessionDb {
    professions: Vec<ProfessionInfo>,
    gather: HashMap<String, GatherInfo>,
    compress: HashMap<String, CompressInfo>,
}

impl ProfessionDb {
    pub fn from_json(json_str: &str) -> Result<Self, ProfessionLoadError> {
        let root: RawRoot = serde_json::from_str(json_str).map_err(ProfessionLoadError::Parse)?;

        let mut professions = Vec::with_capacity(root.professions.len());
        let mut gather = HashMap::new();
        let mut compress = HashMap::new();

        for profession in &root.professions {
            professions.push(ProfessionInfo {
                r#ref: profession.ref_.clone(),
                name: if profession.name.is_empty() {
                    profession.ref_.clone()
                } else {
                    profession.name.clone()
                },
                category: normalize_category(&profession.category),
                emoji: profession.emoji.clone(),
                max_level: profession
                    .experience_curve
                    .as_ref()
                    .map(|c| c.max_level)
                    .filter(|l| *l > 0)
                    .unwrap_or(99),
                curve: profession.experience_curve.as_ref().and_then(|c| {
                    let kind = normalize_curve_kind(&c.kind);
                    if kind.is_empty() {
                        None
                    } else {
                        Some(ProfessionCurve {
                            kind,
                            base_xp: c.base_xp,
                            growth_factor: c.growth_factor,
                            max_level: if c.max_level > 0 { c.max_level } else { 99 },
                        })
                    }
                }),
            });

            for action in &profession.actions {
                if action.ref_.starts_with("gather-") {
                    let resource_node_ref = action.resource_node_ref.clone().unwrap_or_default();
                    for output in &action.outputs {
                        gather
                            .entry(output.item_ref.clone())
                            .or_insert_with(|| GatherInfo {
                                skill_ref: profession.ref_.clone(),
                                required_level: action.required_level,
                                xp_reward: action.xp_reward,
                                resource_node_ref: resource_node_ref.clone(),
                            });
                    }
                } else if action.ref_.starts_with("compress-")
                    && let (Some(input), Some(output)) =
                        (action.inputs.first(), action.outputs.first())
                {
                    compress
                        .entry(input.item_ref.clone())
                        .or_insert_with(|| CompressInfo {
                            target_ref: output.item_ref.clone(),
                            ratio: input.quantity,
                        });
                }
            }
        }

        Ok(Self {
            professions,
            gather,
            compress,
        })
    }

    pub fn professions(&self) -> &[ProfessionInfo] {
        &self.professions
    }

    pub fn profession(&self, profession_ref: &str) -> Option<&ProfessionInfo> {
        self.professions.iter().find(|p| p.r#ref == profession_ref)
    }

    pub fn gather(&self, item_ref: &str) -> Option<&GatherInfo> {
        self.gather.get(item_ref)
    }

    pub fn compress(&self, item_ref: &str) -> Option<&CompressInfo> {
        self.compress.get(item_ref)
    }

    pub fn gather_len(&self) -> usize {
        self.gather.len()
    }

    /// Every gatherable item paired with what it takes and pays. Ordering
    /// follows the underlying map and is not stable — sort if you need it.
    pub fn gather_iter(&self) -> impl Iterator<Item = (&str, &GatherInfo)> {
        self.gather.iter().map(|(k, v)| (k.as_str(), v))
    }

    pub fn compress_len(&self) -> usize {
        self.compress.len()
    }

    pub fn is_empty(&self) -> bool {
        self.professions.is_empty() && self.gather.is_empty() && self.compress.is_empty()
    }

    pub fn validate_skill_refs<F: Fn(&str) -> bool>(&self, is_known: F) -> Result<(), Vec<String>> {
        let mut missing: Vec<String> = self
            .gather
            .values()
            .map(|g| g.skill_ref.clone())
            .filter(|r| !is_known(r))
            .collect();
        missing.sort();
        missing.dedup();
        if missing.is_empty() {
            Ok(())
        } else {
            Err(missing)
        }
    }
}

/// `PROFESSION_CATEGORY_GATHERING` -> `gathering`.
fn normalize_category(raw: &str) -> String {
    raw.strip_prefix("PROFESSION_CATEGORY_")
        .unwrap_or(raw)
        .to_ascii_lowercase()
}

fn normalize_curve_kind(raw: &str) -> String {
    let normalized = raw
        .strip_prefix("CURVE_KIND_")
        .unwrap_or(raw)
        .to_ascii_lowercase();
    if normalized == "unspecified" {
        String::new()
    } else {
        normalized
    }
}

static PROFESSION_DB_REF: OnceLock<&'static ProfessionDb> = OnceLock::new();

pub fn init_profession_db(db: &'static ProfessionDb) {
    let _ = PROFESSION_DB_REF.set(db);
}

pub fn get_profession_db() -> Option<&'static ProfessionDb> {
    PROFESSION_DB_REF.get().copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = r#"
    {
        "professions": [
            {
                "ref": "mining",
                "key": 1,
                "name": "Mining",
                "category": "PROFESSION_CATEGORY_GATHERING",
                "emoji": "⛏️",
                "experienceCurve": {"kind": "CURVE_KIND_POLYNOMIAL", "baseXp": 50, "growthFactor": 1.6, "maxLevel": 99},
                "actions": [
                    {
                        "ref": "gather-copper-ore",
                        "key": 15,
                        "name": "Mine Copper Ore",
                        "requiredLevel": 1,
                        "xpReward": 18,
                        "durationMs": 3000,
                        "resourceNodeRef": "copper-vein",
                        "toolRefs": ["pickaxe"],
                        "outputs": [{"itemRef": "copper-ore", "quantity": 1}]
                    }
                ]
            },
            {
                "ref": "cooking",
                "key": 2,
                "name": "Cooking",
                "actions": [
                    {
                        "ref": "compress-berry",
                        "key": 44,
                        "name": "Compress Berry",
                        "requiredLevel": 0,
                        "xpReward": 0,
                        "inputs": [{"itemRef": "berry", "quantity": 100}],
                        "outputs": [{"itemRef": "meal", "quantity": 1}]
                    }
                ]
            }
        ]
    }
    "#;

    #[test]
    fn loads_gather_and_compress() {
        let db = ProfessionDb::from_json(FIXTURE).unwrap();

        assert_eq!(db.gather_len(), 1);
        assert_eq!(db.compress_len(), 1);
        assert!(!db.is_empty());

        let gather = db.gather("copper-ore").unwrap();
        assert_eq!(gather.skill_ref, "mining");
        assert_eq!(gather.required_level, 1);
        assert_eq!(gather.xp_reward, 18);
        assert_eq!(gather.resource_node_ref, "copper-vein");

        let compress = db.compress("berry").unwrap();
        assert_eq!(compress.target_ref, "meal");
        assert_eq!(compress.ratio, 100);

        assert!(db.gather("nonexistent").is_none());
        assert!(db.compress("nonexistent").is_none());
    }

    #[test]
    fn exposes_profession_metadata() {
        let db = ProfessionDb::from_json(FIXTURE).unwrap();

        assert_eq!(db.professions().len(), 2);

        let mining = db.profession("mining").unwrap();
        assert_eq!(mining.name, "Mining");
        assert_eq!(mining.category, "gathering");
        assert_eq!(mining.emoji.as_deref(), Some("⛏️"));
        assert_eq!(mining.max_level, 99);

        // Missing category/curve fall back instead of failing the parse.
        let cooking = db.profession("cooking").unwrap();
        assert_eq!(cooking.category, "");
        assert_eq!(cooking.max_level, 99);

        assert!(db.profession("nonexistent").is_none());
    }

    #[test]
    fn parses_experience_curve() {
        let db = ProfessionDb::from_json(FIXTURE).unwrap();

        let mining = db.profession("mining").unwrap();
        let curve = mining.curve.as_ref().unwrap();
        assert_eq!(curve.kind, "polynomial");
        assert_eq!(curve.base_xp, 50);
        assert!((curve.growth_factor - 1.6).abs() < 1e-9);
        assert_eq!(curve.max_level, 99);

        let cooking = db.profession("cooking").unwrap();
        assert!(cooking.curve.is_none());
    }

    #[test]
    fn empty_db_is_empty() {
        let db = ProfessionDb::from_json(r#"{"professions": []}"#).unwrap();
        assert!(db.is_empty());
    }

    #[test]
    fn validate_skill_refs_ok_when_all_known() {
        let db = ProfessionDb::from_json(FIXTURE).unwrap();
        assert!(db.gather_len() >= 1);
        assert_eq!(db.validate_skill_refs(|r| r == "mining"), Ok(()));
    }

    #[test]
    fn validate_skill_refs_reports_missing() {
        let db = ProfessionDb::from_json(FIXTURE).unwrap();
        assert!(db.gather_len() >= 1);
        assert_eq!(
            db.validate_skill_refs(|_| false),
            Err(vec!["mining".to_string()])
        );
    }
}
