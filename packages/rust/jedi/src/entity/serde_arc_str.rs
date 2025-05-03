use std::sync::Arc;
use serde::{ Deserialize, Deserializer, Serializer };

pub fn serialize<S>(value: &Arc<str>, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
  serializer.serialize_str(value)
}

pub fn deserialize<'de, D>(deserializer: D) -> Result<Arc<str>, D::Error> where D: Deserializer<'de> {
  let s: &str = Deserialize::deserialize(deserializer)?;
  Ok(Arc::from(s))
}
pub mod option {
  use super::*;
  use serde::{Deserializer, Serializer};

  pub fn serialize<S>(value: &Option<Arc<str>>, serializer: S) -> Result<S::Ok, S::Error>
  where
      S: Serializer,
  {
      match value {
          Some(v) => serializer.serialize_some(&**v),
          None => serializer.serialize_none(),
      }
  }

  pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<Arc<str>>, D::Error>
  where
      D: Deserializer<'de>,
  {
      let opt: Option<&str> = Option::deserialize(deserializer)?;
      Ok(opt.map(Arc::from))
  }
}

pub mod map_keys {
  use super::*;
  use serde::de::{self, MapAccess, Visitor};
  use serde::{Deserializer, Serialize, Serializer};
  use std::collections::HashMap;
  use std::fmt;

  pub fn serialize<S>(
      map: &HashMap<Arc<str>, String>,
      serializer: S,
  ) -> Result<S::Ok, S::Error>
  where
      S: Serializer,
  {
      let map_ref: HashMap<&str, &String> = map
          .iter()
          .map(|(k, v)| (k.as_ref(), v))
          .collect();
      map_ref.serialize(serializer)
  }

  pub fn deserialize<'de, D>(
      deserializer: D,
  ) -> Result<HashMap<Arc<str>, String>, D::Error>
  where
      D: Deserializer<'de>,
  {
      struct ArcMapVisitor;

      impl<'de> Visitor<'de> for ArcMapVisitor {
          type Value = HashMap<Arc<str>, String>;

          fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
              formatter.write_str("a map with string keys and string values")
          }

          fn visit_map<M>(self, mut access: M) -> Result<Self::Value, M::Error>
          where
              M: MapAccess<'de>,
          {
              let mut map = HashMap::with_capacity(access.size_hint().unwrap_or(0));

              while let Some((k, v)) = access.next_entry::<String, String>()? {
                  map.insert(Arc::from(k), v);
              }

              Ok(map)
          }
      }

      deserializer.deserialize_map(ArcMapVisitor)
  }
}
