use bytes::Bytes;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;

pub fn serialize<S>(map: &HashMap<Bytes, Bytes>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let string_map: HashMap<&str, &str> = map
        .iter()
        .map(|(k, v)| {
            (
                std::str::from_utf8(k).unwrap_or("[invalid utf8 key]"),
                std::str::from_utf8(v).unwrap_or("[invalid utf8 val]"),
            )
        })
        .collect();
    string_map.serialize(serializer)
}

pub fn deserialize<'de, D>(deserializer: D) -> Result<HashMap<Bytes, Bytes>, D::Error>
where
    D: Deserializer<'de>,
{
    let string_map = HashMap::<String, String>::deserialize(deserializer)?;
    Ok(string_map
        .into_iter()
        .map(|(k, v)| (Bytes::from(k), Bytes::from(v)))
        .collect())
}
