use std::path::Path;
use crate::Result;

pub fn scalar_i64(path: &Path, sql: &str) -> Result<i64> {
    let conn = duckdb::Connection::open_in_memory()?;
    conn.execute_batch("INSTALL sqlite; LOAD sqlite;")?;
    let attach = format!("ATTACH '{}' AS src (TYPE sqlite, READ_ONLY);", path.display());
    conn.execute_batch(&attach)?;
    conn.execute_batch("USE src;")?;
    let val: i64 = conn.query_row(sql, [], |r| r.get(0))?;
    Ok(val)
}
