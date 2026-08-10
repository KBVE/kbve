pub mod flora_compute;
pub mod flora_field;
pub mod grass_compute;
pub mod grass_field;
pub mod harvest;
pub mod stone_field;
pub mod stone_mesh;
pub mod terrain;
pub mod tree_field;

pub(crate) fn q_hidden(name: &str) -> bool {
    std::env::var("Q_HIDE")
        .map(|v| v.split(',').any(|s| s.trim() == name))
        .unwrap_or(false)
}
