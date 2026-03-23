use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;

pub type DbPool = PgPool;

pub async fn connect(database_url: &str) -> anyhow::Result<DbPool> {
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(300))
        .connect(database_url)
        .await?;
    Ok(pool)
}

/// Generic query helper — execute a stored procedure / SQL and map rows.
/// Uses borrowing to avoid cloning the pool.
pub async fn fetch_optional<T>(
    pool: &DbPool,
    query: &str,
    binder: impl FnOnce(
        sqlx::query::QueryAs<'_, sqlx::Postgres, T, sqlx::postgres::PgArguments>,
    ) -> sqlx::query::QueryAs<'_, sqlx::Postgres, T, sqlx::postgres::PgArguments>,
) -> Result<Option<T>, sqlx::Error>
where
    T: for<'r> sqlx::FromRow<'r, sqlx::postgres::PgRow> + Send + Unpin,
{
    let q = sqlx::query_as::<_, T>(query);
    binder(q).fetch_optional(pool).await
}

pub async fn fetch_all<T>(
    pool: &DbPool,
    query: &str,
    binder: impl FnOnce(
        sqlx::query::QueryAs<'_, sqlx::Postgres, T, sqlx::postgres::PgArguments>,
    ) -> sqlx::query::QueryAs<'_, sqlx::Postgres, T, sqlx::postgres::PgArguments>,
) -> Result<Vec<T>, sqlx::Error>
where
    T: for<'r> sqlx::FromRow<'r, sqlx::postgres::PgRow> + Send + Unpin,
{
    let q = sqlx::query_as::<_, T>(query);
    binder(q).fetch_all(pool).await
}

pub async fn execute(
    pool: &DbPool,
    query: &str,
    binder: impl FnOnce(
        sqlx::query::Query<'_, sqlx::Postgres, sqlx::postgres::PgArguments>,
    ) -> sqlx::query::Query<'_, sqlx::Postgres, sqlx::postgres::PgArguments>,
) -> Result<u64, sqlx::Error> {
    let q = sqlx::query(query);
    let result = binder(q).execute(pool).await?;
    Ok(result.rows_affected())
}
