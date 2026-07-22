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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_values() {
        let c = EmbedConfig::default();
        assert_eq!(c.journal_mode, "WAL");
        assert_eq!(c.duckdb_extension_dir, None);
        assert_eq!(c.checkpoint_max_retries, 5);
        assert_eq!(c.reader_pool_size, 4);
    }

    #[test]
    fn struct_update_overrides_single_field() {
        let c = EmbedConfig {
            reader_pool_size: 2,
            ..Default::default()
        };
        assert_eq!(c.reader_pool_size, 2);
        assert_eq!(c.journal_mode, "WAL");
        assert_eq!(c.checkpoint_max_retries, 5);
    }

    #[test]
    fn clone_is_independent() {
        let a = EmbedConfig::default();
        let mut b = a.clone();
        b.journal_mode = "DELETE".into();
        b.reader_pool_size = 9;
        assert_eq!(a.journal_mode, "WAL");
        assert_eq!(a.reader_pool_size, 4);
        assert_eq!(b.journal_mode, "DELETE");
        assert_eq!(b.reader_pool_size, 9);
    }

    #[test]
    fn debug_includes_field_names() {
        let dbg = format!("{:?}", EmbedConfig::default());
        assert!(dbg.contains("journal_mode"));
        assert!(dbg.contains("reader_pool_size"));
    }

    #[test]
    fn extension_dir_holds_path() {
        let c = EmbedConfig {
            duckdb_extension_dir: Some(PathBuf::from("/tmp/ext")),
            ..Default::default()
        };
        assert_eq!(
            c.duckdb_extension_dir.as_deref(),
            Some(std::path::Path::new("/tmp/ext"))
        );
    }
}
