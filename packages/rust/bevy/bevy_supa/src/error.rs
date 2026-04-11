//! Transport-agnostic error type for SupaClient operations.

#[derive(Debug, thiserror::Error)]
pub enum SupaError {
    /// The client was constructed without a URL / key, or the env vars
    /// were empty strings.
    #[error("missing configuration: {0}")]
    Config(String),

    /// An HTTP-layer failure from the active transport (reqwest on
    /// native, fetch on WASM once that lands).
    #[error("transport: {0}")]
    Transport(String),

    /// Successful HTTP round-trip but the server returned a non-2xx
    /// response. `status` is the numeric HTTP status, `body` is the
    /// (possibly truncated) response text.
    #[error("http {status}: {body}")]
    Http { status: u16, body: String },

    /// JSON decode failed on a successful response.
    #[error("decode: {0}")]
    Decode(String),
}

#[cfg(feature = "native")]
impl From<reqwest::Error> for SupaError {
    fn from(err: reqwest::Error) -> Self {
        SupaError::Transport(err.to_string())
    }
}
