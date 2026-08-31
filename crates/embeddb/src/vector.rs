use crate::{EmbedDb, EmbedError, Result};

pub const VECTOR_TABLE: &str = "_embeddb_vectors";

const CREATE_TABLE: &str = "CREATE TABLE IF NOT EXISTS _embeddb_vectors (\
 id INTEGER PRIMARY KEY AUTOINCREMENT,\
 ref_kind TEXT NOT NULL,\
 ref_id TEXT NOT NULL,\
 provider TEXT NOT NULL,\
 model TEXT NOT NULL,\
 dim INTEGER NOT NULL,\
 norm REAL NOT NULL,\
 vec BLOB NOT NULL,\
 created_at INTEGER NOT NULL)";

const CREATE_UNIQUE_INDEX: &str = "CREATE UNIQUE INDEX IF NOT EXISTS _embeddb_vectors_ref_model \
ON _embeddb_vectors (ref_kind, ref_id, model)";

const CREATE_LOOKUP_INDEX: &str = "CREATE INDEX IF NOT EXISTS _embeddb_vectors_model_kind \
ON _embeddb_vectors (model, ref_kind)";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VectorSpace {
    pub provider: String,
    pub model: String,
    pub dim: usize,
}

impl VectorSpace {
    pub fn new(provider: impl Into<String>, model: impl Into<String>, dim: usize) -> VectorSpace {
        VectorSpace {
            provider: provider.into(),
            model: model.into(),
            dim,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct VectorHit {
    pub ref_kind: String,
    pub ref_id: String,
    pub score: f32,
}

#[derive(Debug, Clone, Default)]
pub struct VectorFilter {
    pub ref_kind: Option<String>,
}

impl VectorFilter {
    pub fn kind(ref_kind: impl Into<String>) -> VectorFilter {
        VectorFilter {
            ref_kind: Some(ref_kind.into()),
        }
    }
}

pub fn pack(vec: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(vec.len() * 4);
    for v in vec {
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}

pub fn unpack(bytes: &[u8]) -> Result<Vec<f32>> {
    if bytes.len() % 4 != 0 {
        return Err(EmbedError::VectorBlob(format!(
            "blob length {} is not a multiple of 4",
            bytes.len()
        )));
    }
    let mut out = Vec::with_capacity(bytes.len() / 4);
    for chunk in bytes.chunks_exact(4) {
        out.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }
    Ok(out)
}

pub fn norm(vec: &[f32]) -> f32 {
    vec.iter().map(|v| v * v).sum::<f32>().sqrt()
}

pub fn normalize(vec: &[f32]) -> Result<(Vec<f32>, f32)> {
    let n = norm(vec);
    if !n.is_finite() || n <= f32::EPSILON {
        return Err(EmbedError::VectorZeroNorm);
    }
    Ok((vec.iter().map(|v| v / n).collect(), n))
}

pub fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

fn check_dim(space: &VectorSpace, vec: &[f32]) -> Result<()> {
    if vec.len() != space.dim {
        return Err(EmbedError::VectorDim {
            expected: space.dim,
            actual: vec.len(),
        });
    }
    Ok(())
}

struct TopK {
    k: usize,
    items: Vec<VectorHit>,
}

impl TopK {
    fn new(k: usize) -> TopK {
        TopK {
            k,
            items: Vec::with_capacity(k.saturating_add(1)),
        }
    }

    fn push(&mut self, hit: VectorHit) {
        if self.k == 0 {
            return;
        }
        if self.items.len() < self.k {
            self.items.push(hit);
            if self.items.len() == self.k {
                self.items.sort_by(|a, b| b.score.total_cmp(&a.score));
            }
            return;
        }
        let worst = &self.items[self.k - 1];
        if hit.score.total_cmp(&worst.score) != std::cmp::Ordering::Greater {
            return;
        }
        self.items[self.k - 1] = hit;
        self.items.sort_by(|a, b| b.score.total_cmp(&a.score));
    }

    fn finish(mut self) -> Vec<VectorHit> {
        self.items.sort_by(|a, b| b.score.total_cmp(&a.score));
        self.items
    }
}

impl EmbedDb {
    pub async fn vector_init(&self) -> Result<()> {
        self.execute(CREATE_TABLE, ()).await?;
        self.execute(CREATE_UNIQUE_INDEX, ()).await?;
        self.execute(CREATE_LOOKUP_INDEX, ()).await?;
        Ok(())
    }

    pub async fn vector_upsert(
        &self,
        space: &VectorSpace,
        ref_kind: &str,
        ref_id: &str,
        vec: &[f32],
    ) -> Result<()> {
        check_dim(space, vec)?;
        let (unit, magnitude) = normalize(vec)?;
        self.execute(
            UPSERT_SQL,
            (
                ref_kind,
                ref_id,
                space.provider.as_str(),
                space.model.as_str(),
                space.dim as i64,
                magnitude as f64,
                pack(&unit),
            ),
        )
        .await?;
        Ok(())
    }

    pub async fn vector_upsert_batch(
        &self,
        space: &VectorSpace,
        items: &[(String, String, Vec<f32>)],
    ) -> Result<u64> {
        let mut rows = Vec::with_capacity(items.len());
        for (ref_kind, ref_id, vec) in items {
            check_dim(space, vec)?;
            let (unit, magnitude) = normalize(vec)?;
            rows.push((
                ref_kind.clone(),
                ref_id.clone(),
                space.provider.clone(),
                space.model.clone(),
                space.dim as i64,
                magnitude as f64,
                pack(&unit),
            ));
        }
        self.execute_batch(UPSERT_SQL, rows).await
    }

    pub async fn vector_search(
        &self,
        space: &VectorSpace,
        query: &[f32],
        k: usize,
        filter: Option<&VectorFilter>,
    ) -> Result<Vec<VectorHit>> {
        check_dim(space, query)?;
        let (unit, _) = normalize(query)?;
        let kind = filter.and_then(|f| f.ref_kind.clone());
        let mut rows = match kind.as_deref() {
            Some(kind) => {
                self.conn()
                    .query(SEARCH_SQL_KIND, (space.model.as_str(), kind))
                    .await?
            }
            None => {
                self.conn()
                    .query(SEARCH_SQL, (space.model.as_str(),))
                    .await?
            }
        };
        let mut top = TopK::new(k);
        while let Some(row) = rows.next().await? {
            let ref_kind = row.get_value(0)?;
            let ref_id = row.get_value(1)?;
            let blob = row.get_value(2)?;
            let bytes = match blob {
                turso::Value::Blob(b) => b,
                other => {
                    return Err(EmbedError::VectorBlob(format!(
                        "vec column is not a blob: {:?}",
                        other
                    )));
                }
            };
            let stored = unpack(&bytes)?;
            if stored.len() != space.dim {
                return Err(EmbedError::VectorDim {
                    expected: space.dim,
                    actual: stored.len(),
                });
            }
            top.push(VectorHit {
                ref_kind: value_text(ref_kind)?,
                ref_id: value_text(ref_id)?,
                score: dot(&unit, &stored),
            });
        }
        Ok(top.finish())
    }

    pub async fn vector_delete(&self, model: &str, ref_kind: &str, ref_id: &str) -> Result<u64> {
        self.execute(
            "DELETE FROM _embeddb_vectors WHERE model = ? AND ref_kind = ? AND ref_id = ?",
            (model, ref_kind, ref_id),
        )
        .await
    }

    pub async fn vector_delete_model(&self, model: &str) -> Result<u64> {
        self.execute("DELETE FROM _embeddb_vectors WHERE model = ?", (model,))
            .await
    }

    pub async fn vector_count(&self, model: &str) -> Result<i64> {
        let mut rows = self
            .conn()
            .query(
                "SELECT count(*) FROM _embeddb_vectors WHERE model = ?",
                (model,),
            )
            .await?;
        let mut n = 0_i64;
        if let Some(row) = rows.next().await? {
            n = row.get::<i64>(0).unwrap_or(0);
        }
        while rows.next().await?.is_some() {}
        Ok(n)
    }
}

const UPSERT_SQL: &str = "INSERT INTO _embeddb_vectors \
(ref_kind, ref_id, provider, model, dim, norm, vec, created_at) \
VALUES (?, ?, ?, ?, ?, ?, ?, CAST(strftime('%s','now') AS INTEGER)) \
ON CONFLICT (ref_kind, ref_id, model) DO UPDATE SET \
provider = excluded.provider, dim = excluded.dim, norm = excluded.norm, \
vec = excluded.vec, created_at = excluded.created_at";

const SEARCH_SQL: &str = "SELECT ref_kind, ref_id, vec FROM _embeddb_vectors WHERE model = ?";

const SEARCH_SQL_KIND: &str =
    "SELECT ref_kind, ref_id, vec FROM _embeddb_vectors WHERE model = ? AND ref_kind = ?";

fn value_text(v: turso::Value) -> Result<String> {
    match v {
        turso::Value::Text(s) => Ok(s),
        other => Err(EmbedError::VectorBlob(format!(
            "expected text column, got {:?}",
            other
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::EmbedDb;

    async fn open(name: &str) -> (tempfile::TempDir, EmbedDb) {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join(name)).await.unwrap();
        db.vector_init().await.unwrap();
        (dir, db)
    }

    fn space() -> VectorSpace {
        VectorSpace::new("local", "test-model", 3)
    }

    #[test]
    fn pack_unpack_roundtrip() {
        let v = vec![1.5_f32, -2.25, 0.0];
        let bytes = pack(&v);
        assert_eq!(bytes.len(), 12);
        assert_eq!(unpack(&bytes).unwrap(), v);
    }

    #[test]
    fn unpack_rejects_ragged_blob() {
        let err = unpack(&[0, 1, 2]).unwrap_err();
        assert!(matches!(err, EmbedError::VectorBlob(_)));
    }

    #[test]
    fn normalize_produces_unit_vector() {
        let (unit, magnitude) = normalize(&[3.0, 4.0]).unwrap();
        assert!((magnitude - 5.0).abs() < 1e-6);
        assert!((norm(&unit) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn normalize_rejects_zero_vector() {
        assert!(matches!(
            normalize(&[0.0, 0.0]).unwrap_err(),
            EmbedError::VectorZeroNorm
        ));
    }

    #[test]
    fn dot_of_unit_vectors_is_cosine() {
        let (a, _) = normalize(&[1.0, 0.0]).unwrap();
        let (b, _) = normalize(&[0.0, 1.0]).unwrap();
        assert!(dot(&a, &b).abs() < 1e-6);
        assert!((dot(&a, &a) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn topk_keeps_highest_scores_in_order() {
        let mut top = TopK::new(2);
        for (i, score) in [0.1_f32, 0.9, 0.5, 0.7].iter().enumerate() {
            top.push(VectorHit {
                ref_kind: "m".into(),
                ref_id: i.to_string(),
                score: *score,
            });
        }
        let hits = top.finish();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].ref_id, "1");
        assert_eq!(hits[1].ref_id, "3");
    }

    #[test]
    fn topk_zero_returns_empty() {
        let mut top = TopK::new(0);
        top.push(VectorHit {
            ref_kind: "m".into(),
            ref_id: "a".into(),
            score: 1.0,
        });
        assert!(top.finish().is_empty());
    }

    #[tokio::test]
    async fn vector_init_is_idempotent() {
        let (_d, db) = open("vec_init.db").await;
        db.vector_init().await.unwrap();
        db.vector_init().await.unwrap();
        assert_eq!(db.vector_count("test-model").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn upsert_then_search_ranks_by_cosine() {
        let (_d, db) = open("vec_search.db").await;
        let s = space();
        db.vector_upsert(&s, "msg", "a", &[1.0, 0.0, 0.0])
            .await
            .unwrap();
        db.vector_upsert(&s, "msg", "b", &[0.0, 1.0, 0.0])
            .await
            .unwrap();
        db.vector_upsert(&s, "msg", "c", &[0.9, 0.1, 0.0])
            .await
            .unwrap();
        let hits = db
            .vector_search(&s, &[1.0, 0.0, 0.0], 2, None)
            .await
            .unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].ref_id, "a");
        assert_eq!(hits[1].ref_id, "c");
        assert!(hits[0].score > hits[1].score);
    }

    #[tokio::test]
    async fn search_scores_are_magnitude_invariant() {
        let (_d, db) = open("vec_mag.db").await;
        let s = space();
        db.vector_upsert(&s, "msg", "small", &[1.0, 0.0, 0.0])
            .await
            .unwrap();
        db.vector_upsert(&s, "msg", "large", &[100.0, 0.0, 0.0])
            .await
            .unwrap();
        let hits = db
            .vector_search(&s, &[5.0, 0.0, 0.0], 2, None)
            .await
            .unwrap();
        assert!((hits[0].score - hits[1].score).abs() < 1e-5);
        assert!((hits[0].score - 1.0).abs() < 1e-5);
    }

    #[tokio::test]
    async fn upsert_replaces_same_ref_and_model() {
        let (_d, db) = open("vec_upsert.db").await;
        let s = space();
        db.vector_upsert(&s, "msg", "a", &[1.0, 0.0, 0.0])
            .await
            .unwrap();
        db.vector_upsert(&s, "msg", "a", &[0.0, 1.0, 0.0])
            .await
            .unwrap();
        assert_eq!(db.vector_count("test-model").await.unwrap(), 1);
        let hits = db
            .vector_search(&s, &[0.0, 1.0, 0.0], 1, None)
            .await
            .unwrap();
        assert!((hits[0].score - 1.0).abs() < 1e-5);
    }

    #[tokio::test]
    async fn models_do_not_mix_in_search() {
        let (_d, db) = open("vec_models.db").await;
        let a = VectorSpace::new("local", "model-a", 3);
        let b = VectorSpace::new("api", "model-b", 3);
        db.vector_upsert(&a, "msg", "x", &[1.0, 0.0, 0.0])
            .await
            .unwrap();
        db.vector_upsert(&b, "msg", "y", &[1.0, 0.0, 0.0])
            .await
            .unwrap();
        let hits = db
            .vector_search(&a, &[1.0, 0.0, 0.0], 10, None)
            .await
            .unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].ref_id, "x");
        assert_eq!(db.vector_count("model-b").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn same_ref_can_hold_one_row_per_model() {
        let (_d, db) = open("vec_dual.db").await;
        let a = VectorSpace::new("local", "model-a", 3);
        let b = VectorSpace::new("api", "model-b", 3);
        db.vector_upsert(&a, "msg", "same", &[1.0, 0.0, 0.0])
            .await
            .unwrap();
        db.vector_upsert(&b, "msg", "same", &[0.0, 1.0, 0.0])
            .await
            .unwrap();
        assert_eq!(db.vector_count("model-a").await.unwrap(), 1);
        assert_eq!(db.vector_count("model-b").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn filter_restricts_to_ref_kind() {
        let (_d, db) = open("vec_filter.db").await;
        let s = space();
        db.vector_upsert(&s, "msg", "a", &[1.0, 0.0, 0.0])
            .await
            .unwrap();
        db.vector_upsert(&s, "doc", "b", &[1.0, 0.0, 0.0])
            .await
            .unwrap();
        let hits = db
            .vector_search(&s, &[1.0, 0.0, 0.0], 10, Some(&VectorFilter::kind("doc")))
            .await
            .unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].ref_kind, "doc");
    }

    #[tokio::test]
    async fn dim_mismatch_errors_on_upsert_and_search() {
        let (_d, db) = open("vec_dim.db").await;
        let s = space();
        let err = db
            .vector_upsert(&s, "msg", "a", &[1.0, 0.0])
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            EmbedError::VectorDim {
                expected: 3,
                actual: 2
            }
        ));
        let err = db
            .vector_search(&s, &[1.0, 0.0], 1, None)
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            EmbedError::VectorDim {
                expected: 3,
                actual: 2
            }
        ));
    }

    #[tokio::test]
    async fn zero_vector_rejected_on_upsert() {
        let (_d, db) = open("vec_zero.db").await;
        let s = space();
        let err = db
            .vector_upsert(&s, "msg", "a", &[0.0, 0.0, 0.0])
            .await
            .unwrap_err();
        assert!(matches!(err, EmbedError::VectorZeroNorm));
    }

    #[tokio::test]
    async fn batch_upsert_inserts_all() {
        let (_d, db) = open("vec_batch.db").await;
        let s = space();
        let items = vec![
            ("msg".to_string(), "a".to_string(), vec![1.0, 0.0, 0.0]),
            ("msg".to_string(), "b".to_string(), vec![0.0, 1.0, 0.0]),
            ("msg".to_string(), "c".to_string(), vec![0.0, 0.0, 1.0]),
        ];
        let n = db.vector_upsert_batch(&s, &items).await.unwrap();
        assert_eq!(n, 3);
        assert_eq!(db.vector_count("test-model").await.unwrap(), 3);
    }

    #[tokio::test]
    async fn batch_upsert_validates_before_writing() {
        let (_d, db) = open("vec_batch_bad.db").await;
        let s = space();
        let items = vec![
            ("msg".to_string(), "a".to_string(), vec![1.0, 0.0, 0.0]),
            ("msg".to_string(), "bad".to_string(), vec![1.0, 0.0]),
        ];
        assert!(db.vector_upsert_batch(&s, &items).await.is_err());
        assert_eq!(db.vector_count("test-model").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn delete_removes_single_row() {
        let (_d, db) = open("vec_del.db").await;
        let s = space();
        db.vector_upsert(&s, "msg", "a", &[1.0, 0.0, 0.0])
            .await
            .unwrap();
        db.vector_upsert(&s, "msg", "b", &[0.0, 1.0, 0.0])
            .await
            .unwrap();
        assert_eq!(db.vector_delete("test-model", "msg", "a").await.unwrap(), 1);
        assert_eq!(db.vector_count("test-model").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn delete_model_clears_only_that_model() {
        let (_d, db) = open("vec_del_model.db").await;
        let a = VectorSpace::new("local", "model-a", 3);
        let b = VectorSpace::new("api", "model-b", 3);
        db.vector_upsert(&a, "msg", "x", &[1.0, 0.0, 0.0])
            .await
            .unwrap();
        db.vector_upsert(&b, "msg", "y", &[1.0, 0.0, 0.0])
            .await
            .unwrap();
        db.vector_delete_model("model-a").await.unwrap();
        assert_eq!(db.vector_count("model-a").await.unwrap(), 0);
        assert_eq!(db.vector_count("model-b").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn search_on_empty_store_returns_empty() {
        let (_d, db) = open("vec_empty.db").await;
        let hits = db
            .vector_search(&space(), &[1.0, 0.0, 0.0], 5, None)
            .await
            .unwrap();
        assert!(hits.is_empty());
    }

    #[tokio::test]
    async fn search_k_larger_than_corpus_returns_all() {
        let (_d, db) = open("vec_k.db").await;
        let s = space();
        db.vector_upsert(&s, "msg", "a", &[1.0, 0.0, 0.0])
            .await
            .unwrap();
        db.vector_upsert(&s, "msg", "b", &[0.0, 1.0, 0.0])
            .await
            .unwrap();
        let hits = db
            .vector_search(&s, &[1.0, 0.0, 0.0], 50, None)
            .await
            .unwrap();
        assert_eq!(hits.len(), 2);
    }

    #[tokio::test]
    async fn search_survives_writer_reader_interleave() {
        let (_d, db) = open("vec_live.db").await;
        let s = space();
        for i in 0..25 {
            let v = vec![1.0, i as f32 / 100.0, 0.0];
            db.vector_upsert(&s, "msg", &i.to_string(), &v)
                .await
                .unwrap();
        }
        db.checkpoint().await.unwrap();
        for i in 25..40 {
            let v = vec![1.0, i as f32 / 100.0, 0.0];
            db.vector_upsert(&s, "msg", &i.to_string(), &v)
                .await
                .unwrap();
        }
        assert_eq!(db.vector_count("test-model").await.unwrap(), 40);
        let hits = db
            .vector_search(&s, &[1.0, 0.0, 0.0], 40, None)
            .await
            .unwrap();
        assert_eq!(hits.len(), 40);
        assert_eq!(hits[0].ref_id, "0");
    }
}
