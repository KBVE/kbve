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
    actions: Vec<RawAction>,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompressInfo {
    pub target_ref: String,
    pub ratio: u32,
}

#[derive(Debug, Default)]
pub struct ProfessionDb {
    gather: HashMap<String, GatherInfo>,
    compress: HashMap<String, CompressInfo>,
}

impl ProfessionDb {
    pub fn from_json(json_str: &str) -> Result<Self, ProfessionLoadError> {
        let root: RawRoot = serde_json::from_str(json_str).map_err(ProfessionLoadError::Parse)?;

        let mut gather = HashMap::new();
        let mut compress = HashMap::new();

        for profession in &root.professions {
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

        Ok(Self { gather, compress })
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

    pub fn compress_len(&self) -> usize {
        self.compress.len()
    }

    pub fn is_empty(&self) -> bool {
        self.gather.is_empty() && self.compress.is_empty()
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
    fn empty_db_is_empty() {
        let db = ProfessionDb::from_json(r#"{"professions": []}"#).unwrap();
        assert!(db.is_empty());
    }
}
