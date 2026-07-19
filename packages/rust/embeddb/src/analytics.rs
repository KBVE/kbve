use std::path::Path;
use crate::Result;

pub fn scalar_i64(path: &Path, sql: &str, ext_dir: Option<&Path>) -> Result<i64> {
    let conn = attached_conn(path, ext_dir)?;
    let val: i64 = conn.query_row(sql, [], |r| r.get(0))?;
    Ok(val)
}

pub fn scalar_f64(path: &Path, sql: &str, ext_dir: Option<&Path>) -> Result<f64> {
    let conn = attached_conn(path, ext_dir)?;
    let val: f64 = conn.query_row(sql, [], |r| r.get(0))?;
    Ok(val)
}

pub fn scalar_string(path: &Path, sql: &str, ext_dir: Option<&Path>) -> Result<String> {
    let conn = attached_conn(path, ext_dir)?;
    let val: String = conn.query_row(sql, [], |r| r.get(0))?;
    Ok(val)
}

pub fn query(path: &Path, sql: &str, ext_dir: Option<&Path>) -> Result<crate::QueryResult> {
    let conn = attached_conn(path, ext_dir)?;
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([])?;
    let columns = rows.as_ref().map(|s| s.column_names()).unwrap_or_default();
    let ncols = columns.len();
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut vals = Vec::with_capacity(ncols);
        for i in 0..ncols {
            vals.push(value_from_ref(row.get_ref(i)?)?);
        }
        out.push(crate::EmbedRow(vals));
    }
    Ok(crate::QueryResult { columns, rows: out })
}

pub fn rows(path: &Path, sql: &str, ext_dir: Option<&Path>) -> Result<Vec<crate::EmbedRow>> {
    Ok(query(path, sql, ext_dir)?.rows)
}

fn value_from_ref(v: duckdb::types::ValueRef<'_>) -> Result<crate::EmbedValue> {
    use duckdb::types::ValueRef as V;
    Ok(match v {
        V::Null => crate::EmbedValue::Null,
        V::Boolean(b) => crate::EmbedValue::Bool(b),
        V::TinyInt(n) => crate::EmbedValue::Int(n as i64),
        V::SmallInt(n) => crate::EmbedValue::Int(n as i64),
        V::Int(n) => crate::EmbedValue::Int(n as i64),
        V::BigInt(n) => crate::EmbedValue::Int(n),
        V::HugeInt(n) => crate::EmbedValue::HugeInt(n),
        V::UTinyInt(n) => crate::EmbedValue::Int(n as i64),
        V::USmallInt(n) => crate::EmbedValue::Int(n as i64),
        V::UInt(n) => crate::EmbedValue::Int(n as i64),
        V::UBigInt(n) => match i64::try_from(n) {
            Ok(v) => crate::EmbedValue::Int(v),
            Err(_) => crate::EmbedValue::HugeInt(n as i128),
        },
        V::Float(n) => crate::EmbedValue::Float(n as f64),
        V::Double(n) => crate::EmbedValue::Float(n),
        V::Decimal(d) => crate::EmbedValue::Text(d.to_string()),
        V::Timestamp(unit, v) => crate::EmbedValue::Timestamp(to_micros(unit, v)),
        V::Date32(v) => crate::EmbedValue::Date(v),
        V::Time64(unit, v) => crate::EmbedValue::Time(to_micros(unit, v)),
        V::Text(b) => crate::EmbedValue::Text(String::from_utf8_lossy(b).into_owned()),
        V::Blob(b) => crate::EmbedValue::Blob(b.to_vec()),
        other => return Err(crate::EmbedError::Other(format!(
            "unmapped duckdb type {:?}; cast to VARCHAR in SQL", other))),
    })
}

fn to_micros(unit: duckdb::types::TimeUnit, v: i64) -> i64 {
    use duckdb::types::TimeUnit as U;
    match unit {
        U::Second => v.saturating_mul(1_000_000),
        U::Millisecond => v.saturating_mul(1_000),
        U::Microsecond => v,
        U::Nanosecond => v / 1_000,
    }
}

fn attached_conn(path: &Path, ext_dir: Option<&Path>) -> Result<duckdb::Connection> {
    let conn = duckdb::Connection::open_in_memory()?;
    prepare_sqlite_scanner(&conn, ext_dir)?;
    let attach = format!("ATTACH '{}' AS src (TYPE sqlite, READ_ONLY);", sql_quote_str(crate::db::path_str(path)?));
    conn.execute_batch(&attach)?;
    conn.execute_batch("USE src;")?;
    Ok(conn)
}

fn prepare_sqlite_scanner(conn: &duckdb::Connection, ext_dir: Option<&Path>) -> Result<()> {
    let dir = match ext_dir {
        Some(p) => Some(p.to_string_lossy().into_owned()),
        None => std::env::var("EMBEDDB_DUCKDB_EXTENSION_DIR").ok(),
    };
    if let Some(dir) = dir {
        let set_dir = format!("SET extension_directory = '{}';", sql_quote_str(&dir));
        conn.execute_batch(&set_dir)?;
    }
    conn.execute_batch("INSTALL sqlite; LOAD sqlite;")?;
    Ok(())
}

fn sql_quote_str(s: &str) -> String {
    s.replace('\'', "''")
}
