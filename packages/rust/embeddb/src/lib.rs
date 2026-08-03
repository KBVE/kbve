extern crate self as embeddb;

mod error;
mod db;
mod analytics;
mod tx;
mod value;
mod config;
mod migrate;
mod query;
mod pool;
mod convert;
#[cfg(feature = "vector")]
mod vector;

pub use error::{EmbedError, Result};
pub use db::EmbedDb;
pub use tx::EmbedTx;
pub use value::{EmbedValue, EmbedRow};
pub use turso::IntoParams;
pub use config::EmbedConfig;
pub use query::QueryResult;
pub use query::FromEmbedRow;
pub use convert::FromEmbedValue;

#[cfg(feature = "vector")]
pub use vector::{
    dot, normalize, norm, pack, unpack, VectorFilter, VectorHit, VectorSpace, VECTOR_TABLE,
};

#[cfg(feature = "derive")]
pub use embeddb_derive::FromEmbedRow;
