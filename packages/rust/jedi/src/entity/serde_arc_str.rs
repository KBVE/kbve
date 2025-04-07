use std::sync::Arc;
use serde::{ Deserialize, Deserializer, Serializer };

pub fn serialize<S>(value: &Arc<str>, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
  serializer.serialize_str(value)
}

pub fn deserialize<'de, D>(deserializer: D) -> Result<Arc<str>, D::Error> where D: Deserializer<'de> {
  let s: &str = Deserialize::deserialize(deserializer)?;
  Ok(Arc::from(s))
}