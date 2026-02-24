use dashmap::DashMap;
use godot::classes::file_access::ModeFlags;
use godot::prelude::*;
use godot::tools::GFile;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub trait AbstractDataMap: Serialize + for<'de> Deserialize<'de> + Sized {
    fn to_variant_map(&self) -> DashMap<String, Variant> {
        let map = DashMap::new();
        if let Value::Object(obj) =
            serde_json::to_value(self).unwrap_or_else(|_| Value::Object(Default::default()))
        {
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
                map.insert(key, variant);
            }
        }
        map
    }

    fn from_variant_map(map: &DashMap<String, Variant>) -> Option<Self> {
        let mut json_map = serde_json::Map::new();
        for entry in map.iter() {
            let json_value = if let Ok(s) = entry.value().try_to::<String>() {
                Value::String(s)
            } else if let Ok(f) = entry.value().try_to::<f32>() {
                Value::Number(serde_json::Number::from_f64(f as f64).unwrap())
            } else if let Ok(i) = entry.value().try_to::<i64>() {
                Value::Number(serde_json::Number::from(i))
            } else if let Ok(b) = entry.value().try_to::<bool>() {
                Value::Bool(b)
            } else if entry.value().is_nil() {
                Value::Null
            } else {
                Value::Null
            };
            json_map.insert(entry.key().clone(), json_value);
        }
        serde_json::from_value(Value::Object(json_map)).ok()
    }

    fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
    }

    fn from_json(json: &str) -> Option<Self> {
        serde_json::from_str(json).ok()
    }

    fn to_save_gfile_json(&self, file_path: &str) -> bool {
        let json_string = self.to_json();
        if let Ok(mut file) = GFile::open(file_path, ModeFlags::WRITE) {
            let _ = file.write_gstring_line(&GString::from(json_string));
            true
        } else {
            godot_error!("Failed to save data to file: {}", file_path);
            false
        }
    }

    fn from_load_gfile_json(file_path: &str) -> Option<Self> {
        let file = GFile::open(file_path, ModeFlags::READ);

        match file {
            Ok(mut file) => {
                if let Ok(json_string) = file.read_gstring_line() {
                    return Self::from_json(&json_string.to_string());
                } else {
                    godot_error!("[AbstractDataMap] ERROR: Failed to read JSON string.");
                }
            }
            Err(e) => {
                if e.to_string().contains("ERR_FILE_NOT_FOUND") {
                    godot_warn!("[AbstractDataMap] File not found, returning None.");
                } else {
                    godot_error!(
                        "[AbstractDataMap] ERROR: Failed to open file {}: {:?}",
                        file_path,
                        e
                    );
                }
            }
        }

        None
    }
}
