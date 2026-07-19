use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct EmbedConfig {
    pub journal_mode: String,
    pub duckdb_extension_dir: Option<PathBuf>,
    pub checkpoint_max_retries: u32,
    pub reader_pool_size: usize,
}

impl Default for EmbedConfig {
    fn default() -> Self {
        EmbedConfig {
            journal_mode: "WAL".to_string(),
            duckdb_extension_dir: None,
            checkpoint_max_retries: 5,
            reader_pool_size: 4,
        }
    }
}
