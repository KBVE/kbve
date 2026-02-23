use godot::prelude::*;
use serde::{self, Deserialize, Deserializer, Serialize, Serializer};

pub mod vector2_serde {
    use super::*;
    pub fn serialize<S>(vector: &Vector2, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let tuple = (vector.x, vector.y);
        tuple.serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vector2, D::Error>
    where
        D: Deserializer<'de>,
    {
        let (x, y) = <(f32, f32)>::deserialize(deserializer)?;
        Ok(Vector2 { x, y })
    }
}

pub mod vector2i_serde {
    use super::*;

    pub fn serialize<S>(vector: &Vector2i, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let tuple = (vector.x, vector.y);
        tuple.serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vector2i, D::Error>
    where
        D: Deserializer<'de>,
    {
        let (x, y) = <(i32, i32)>::deserialize(deserializer)?;
        Ok(Vector2i { x, y })
    }
}

pub mod vector3_serde {
    use super::*;

    pub fn serialize<S>(vector: &Vector3, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let tuple = (vector.x, vector.y, vector.z);
        tuple.serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vector3, D::Error>
    where
        D: Deserializer<'de>,
    {
        let (x, y, z) = <(f32, f32, f32)>::deserialize(deserializer)?;
        Ok(Vector3 { x, y, z })
    }
}

pub mod vector3i_serde {
    use super::*;

    pub fn serialize<S>(vector: &Vector3i, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let tuple = (vector.x, vector.y, vector.z);
        tuple.serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vector3i, D::Error>
    where
        D: Deserializer<'de>,
    {
        let (x, y, z) = <(i32, i32, i32)>::deserialize(deserializer)?;
        Ok(Vector3i { x, y, z })
    }
}
