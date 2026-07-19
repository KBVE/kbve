#[derive(Debug, thiserror::Error)]
pub enum EmbedError {
    #[error("turso error: {0}")]
    Turso(#[from] turso::Error),
    #[error("duckdb error: {0}")]
    Duck(#[from] duckdb::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("non-utf8 path: {0}")]
    NonUtf8Path(std::path::PathBuf),
    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, EmbedError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn io_error_maps() {
        let io = std::io::Error::new(std::io::ErrorKind::NotFound, "nope");
        let e: EmbedError = io.into();
        assert!(matches!(e, EmbedError::Io(_)));
    }
}
