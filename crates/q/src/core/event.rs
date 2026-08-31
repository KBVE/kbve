#[derive(Debug, Clone)]
pub enum GameRequest {
    SpawnEntity { x: f32, y: f32 },
    DespawnEntity { id: String },
    UpdatePosition { id: String, x: f32, y: f32 },
    Custom(String, String),
    Shutdown,
}

#[derive(Debug, Clone)]
pub enum GameEvent {
    EntitySpawned { id: String, x: f32, y: f32 },
    EntityDespawned { id: String },
    PositionUpdated { id: String, x: f32, y: f32 },
    Custom(String, String),
    Error(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn game_request_variants() {
        let spawn = GameRequest::SpawnEntity { x: 1.0, y: 2.0 };
        assert!(matches!(spawn, GameRequest::SpawnEntity { x, y } if x == 1.0 && y == 2.0));

        let despawn = GameRequest::DespawnEntity {
            id: "abc".to_string(),
        };
        assert!(matches!(despawn, GameRequest::DespawnEntity { ref id } if id == "abc"));

        let update = GameRequest::UpdatePosition {
            id: "xyz".to_string(),
            x: 5.0,
            y: 10.0,
        };
        assert!(
            matches!(update, GameRequest::UpdatePosition { ref id, x, y } if id == "xyz" && x == 5.0 && y == 10.0)
        );

        let custom = GameRequest::Custom("type".to_string(), "data".to_string());
        assert!(matches!(custom, GameRequest::Custom(ref t, ref d) if t == "type" && d == "data"));

        let shutdown = GameRequest::Shutdown;
        assert!(matches!(shutdown, GameRequest::Shutdown));
    }

    #[test]
    fn game_event_variants() {
        let spawned = GameEvent::EntitySpawned {
            id: "e1".to_string(),
            x: 1.0,
            y: 2.0,
        };
        assert!(matches!(spawned, GameEvent::EntitySpawned { ref id, .. } if id == "e1"));

        let error = GameEvent::Error("oops".to_string());
        assert!(matches!(error, GameEvent::Error(ref msg) if msg == "oops"));
    }

    #[test]
    fn clone_preserves_data() {
        let original = GameRequest::UpdatePosition {
            id: "test".to_string(),
            x: 3.0,
            y: 4.0,
        };
        let cloned = original.clone();
        assert!(
            matches!(cloned, GameRequest::UpdatePosition { ref id, x, y } if id == "test" && x == 3.0 && y == 4.0)
        );
    }
}
