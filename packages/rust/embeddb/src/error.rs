#[derive(Debug, thiserror::Error)]
pub enum EmbedError {
    #[error("placeholder")]
    Placeholder,
}

pub type Result<T> = std::result::Result<T, EmbedError>;
