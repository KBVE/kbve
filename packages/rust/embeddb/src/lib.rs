extern crate self as embeddb;

mod error;
mod db;
#[cfg(feature = "analytics")]
mod analytics;
mod tx;
mod value;
mod config;
mod migrate;
mod query;
#[cfg(feature = "analytics")]
mod pool;
mod convert;
mod read;
#[cfg(feature = "vector")]
mod vector;
#[cfg(feature = "vector")]
mod embed;
#[cfg(feature = "embed-api")]
mod embed_api;

pub use error::{EmbedError, Result};
pub use db::EmbedDb;
pub use tx::EmbedTx;
pub use value::{EmbedValue, EmbedRow};
pub use turso::IntoParams;
pub use config::EmbedConfig;
pub use query::QueryResult;
pub use query::FromEmbedRow;
pub use convert::FromEmbedValue;

pub use read::params_from_values;

#[cfg(feature = "vector")]
pub use embed::{BoxFuture, Embedder};

#[cfg(feature = "embed-api")]
pub use embed_api::{ApiEmbedder, ApiEmbedderConfig};

#[cfg(feature = "vector")]
pub use vector::{
    dot, normalize, norm, pack, unpack, VectorFilter, VectorHit, VectorSpace, VECTOR_TABLE,
};

#[cfg(feature = "derive")]
pub use embeddb_derive::FromEmbedRow;
