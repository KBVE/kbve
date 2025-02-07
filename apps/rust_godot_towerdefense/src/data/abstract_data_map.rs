use godot::prelude::*;
use papaya::HashMap;
use serde::{ Serialize, Deserialize };
use serde_json::Value;

pub trait AbstractDataMap: Serialize + for<'de> Deserialize<'de> + Sized {
  fn to_variant_map(&self) -> HashMap<String, Variant> {
    let json = serde_json::to_value(self).unwrap_or_else(|_| Value::Object(Default::default()));

    let mut map = HashMap::new();
    if let Value::Object(obj) = json {
      let guard = map.guard();
      for (key, value) in obj {
        let variant = match value {
          Value::String(s) => Variant::from(s),
          Value::Number(n) => {
            if let Some(f) = n.as_f64() {
              Variant::from(f as f32)
            } else {
              Variant::from(n.as_i64().unwrap_or(0))
            }
          }
          Value::Bool(b) => Variant::from(b),
          _ => Variant::from(""),
        };
        map.insert(key, variant, &guard);
      }
    }
    map
  }

  fn from_variant_map(map: &HashMap<String, Variant>) -> Option<Self> {
    let mut json_map = serde_json::Map::new();
    let guard = map.guard();

    for (key, value) in map.iter(&guard) {
      let json_value = if let Ok(s) = value.try_to::<String>() {
        Value::String(s)
      } else if let Ok(f) = value.try_to::<f32>() {
        Value::Number(serde_json::Number::from_f64(f as f64).unwrap())
      } else if let Ok(i) = value.try_to::<i64>() {
        Value::Number(serde_json::Number::from(i))
      } else if let Ok(b) = value.try_to::<bool>() {
        Value::Bool(b)
      } else {
        Value::Null
      };
      json_map.insert(key.clone(), json_value);
    }

    serde_json::from_value(Value::Object(json_map)).ok()
  }

  fn to_json(&self) -> String {
    serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
  }

  fn from_json(json: &str) -> Option<Self> {
    serde_json::from_str(json).ok()
  }
}
