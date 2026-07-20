use std::path::Path;
use std::sync::{Condvar, Mutex};
use crate::Result;

#[derive(Debug)]
pub(crate) struct ReaderPool {
    idle: Mutex<Vec<duckdb::Connection>>,
    available: Condvar,
}

impl ReaderPool {
    pub(crate) fn build(size: usize, ext_dir: Option<&Path>) -> Result<Self> {
        if size == 0 {
            return Err(crate::EmbedError::Other("reader_pool_size must be >= 1".into()));
        }
        let mut conns = Vec::with_capacity(size);
        for _ in 0..size {
            conns.push(crate::analytics::open_reader(ext_dir)?);
        }
        Ok(ReaderPool { idle: Mutex::new(conns), available: Condvar::new() })
    }

    pub(crate) fn checkout(&self) -> ReaderGuard<'_> {
        let mut idle = self.idle.lock().unwrap_or_else(|e| e.into_inner());
        loop {
            if let Some(conn) = idle.pop() {
                return ReaderGuard { pool: self, conn: Some(conn) };
            }
            idle = self.available.wait(idle).unwrap_or_else(|e| e.into_inner());
        }
    }

    fn checkin(&self, conn: duckdb::Connection) {
        let mut idle = self.idle.lock().unwrap_or_else(|e| e.into_inner());
        idle.push(conn);
        drop(idle);
        self.available.notify_one();
    }
}

pub(crate) struct ReaderGuard<'a> {
    pool: &'a ReaderPool,
    conn: Option<duckdb::Connection>,
}

impl std::ops::Deref for ReaderGuard<'_> {
    type Target = duckdb::Connection;
    fn deref(&self) -> &duckdb::Connection {
        self.conn.as_ref().expect("reader guard holds a connection until drop")
    }
}

impl Drop for ReaderGuard<'_> {
    fn drop(&mut self) {
        if let Some(conn) = self.conn.take() {
            self.pool.checkin(conn);
        }
    }
}

pub(crate) struct LazyReaderPool {
    size: usize,
    ext_dir: Option<std::path::PathBuf>,
    inner: std::sync::Mutex<Option<std::sync::Arc<ReaderPool>>>,
}

impl LazyReaderPool {
    pub(crate) fn new(size: usize, ext_dir: Option<std::path::PathBuf>) -> Self {
        LazyReaderPool { size, ext_dir, inner: std::sync::Mutex::new(None) }
    }

    pub(crate) fn get(&self) -> crate::Result<std::sync::Arc<ReaderPool>> {
        let mut guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(pool) = guard.as_ref() {
            return Ok(pool.clone());
        }
        let pool = std::sync::Arc::new(ReaderPool::build(self.size, self.ext_dir.as_deref())?);
        *guard = Some(pool.clone());
        Ok(pool)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_zero_errors() {
        let err = ReaderPool::build(0, None).unwrap_err();
        assert!(matches!(err, crate::EmbedError::Other(_)));
    }

    #[test]
    fn checkout_returns_to_pool_on_drop() {
        let pool = ReaderPool::build(1, None).unwrap();
        {
            let _g = pool.checkout();
        }
        let _g2 = pool.checkout();
    }
}
