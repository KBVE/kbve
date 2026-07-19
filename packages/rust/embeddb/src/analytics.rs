use std::path::Path;
use crate::Result;

pub fn scalar_i64(path: &Path, sql: &str) -> Result<i64> {
    let conn = duckdb::Connection::open_in_memory()?;
    prepare_sqlite_scanner(&conn)?;
    let attach = format!("ATTACH '{}' AS src (TYPE sqlite, READ_ONLY);", sql_quote_path(path));
    conn.execute_batch(&attach)?;
    conn.execute_batch("USE src;")?;
    let val: i64 = conn.query_row(sql, [], |r| r.get(0))?;
    Ok(val)
}

pub fn scalar_f64(path: &Path, sql: &str) -> Result<f64> {
    let conn = duckdb::Connection::open_in_memory()?;
    prepare_sqlite_scanner(&conn)?;
    let attach = format!("ATTACH '{}' AS src (TYPE sqlite, READ_ONLY);", sql_quote_path(path));
    conn.execute_batch(&attach)?;
    conn.execute_batch("USE src;")?;
    let val: f64 = conn.query_row(sql, [], |r| r.get(0))?;
    Ok(val)
}

fn prepare_sqlite_scanner(conn: &duckdb::Connection) -> Result<()> {
    if let Ok(dir) = std::env::var("EMBEDDB_DUCKDB_EXTENSION_DIR") {
        let set_dir = format!("SET extension_directory = '{}';", sql_quote_str(&dir));
        conn.execute_batch(&set_dir)?;
    }
    conn.execute_batch("INSTALL sqlite; LOAD sqlite;")?;
    Ok(())
}

fn sql_quote_str(s: &str) -> String {
    s.replace('\'', "''")
}

fn sql_quote_path(path: &Path) -> String {
    sql_quote_str(&path.display().to_string())
}
