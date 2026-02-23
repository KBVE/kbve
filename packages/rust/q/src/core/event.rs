#[derive(Debug, Clone)]
pub enum GameRequest {
    SpawnEntity { x: f32, y: f32 },
    DespawnEntity { id: String },
    UpdatePosition { id: String, x: f32, y: f32 },
    Custom(String, String),
}

#[derive(Debug, Clone)]
pub enum GameEvent {
    EntitySpawned { id: String, x: f32, y: f32 },
    EntityDespawned { id: String },
    PositionUpdated { id: String, x: f32, y: f32 },
    Custom(String, String),
    Error(String),
}
