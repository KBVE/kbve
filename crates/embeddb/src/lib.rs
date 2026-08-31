extern crate self as embeddb;

#[cfg(feature = "analytics")]
mod analytics;
mod config;
mod convert;
mod db;
#[cfg(feature = "vector")]
mod embed;
#[cfg(feature = "embed-api")]
mod embed_api;
mod error;
mod migrate;
#[cfg(feature = "analytics")]
mod pool;
mod query;
mod read;
mod tx;
mod value;
#[cfg(feature = "vector")]
mod vector;

pub use config::EmbedConfig;
pub use convert::FromEmbedValue;
pub use db::EmbedDb;
pub use error::{EmbedError, Result};
pub use query::FromEmbedRow;
pub use query::QueryResult;
pub use turso::IntoParams;
pub use tx::EmbedTx;
pub use value::{EmbedRow, EmbedValue};

pub use read::params_from_values;

#[cfg(feature = "vector")]
pub use embed::{BoxFuture, Embedder};

#[cfg(feature = "embed-api")]
pub use embed_api::{ApiEmbedder, ApiEmbedderConfig};

#[cfg(feature = "vector")]
pub use vector::{
    VECTOR_TABLE, VectorFilter, VectorHit, VectorSpace, dot, norm, normalize, pack, unpack,
};

#[cfg(feature = "derive")]
pub use embeddb_derive::FromEmbedRow;
