use crate::{EmbedDb, EmbedError, Result, VectorFilter, VectorHit, VectorSpace};
use std::future::Future;
use std::pin::Pin;

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait Embedder: Send + Sync {
    fn provider(&self) -> &str;

    fn model(&self) -> &str;

    fn dim(&self) -> usize;

    fn embed<'a>(&'a self, texts: &'a [String]) -> BoxFuture<'a, Result<Vec<Vec<f32>>>>;

    fn space(&self) -> VectorSpace {
        VectorSpace::new(self.provider(), self.model(), self.dim())
    }
}

fn check_batch(embedder: &dyn Embedder, texts: &[String], got: &[Vec<f32>]) -> Result<()> {
    if got.len() != texts.len() {
        return Err(EmbedError::Embedder(format!(
            "embedder returned {} vectors for {} inputs",
            got.len(),
            texts.len()
        )));
    }
    for v in got {
        if v.len() != embedder.dim() {
            return Err(EmbedError::VectorDim {
                expected: embedder.dim(),
                actual: v.len(),
            });
        }
    }
    Ok(())
}

impl EmbedDb {
    pub async fn vector_upsert_text(
        &self,
        embedder: &dyn Embedder,
        ref_kind: &str,
        ref_id: &str,
        text: &str,
    ) -> Result<()> {
        let inputs = vec![text.to_string()];
        let vectors = embedder.embed(&inputs).await?;
        check_batch(embedder, &inputs, &vectors)?;
        self.vector_upsert(&embedder.space(), ref_kind, ref_id, &vectors[0])
            .await
    }

    pub async fn vector_upsert_texts(
        &self,
        embedder: &dyn Embedder,
        items: &[(String, String, String)],
    ) -> Result<u64> {
        if items.is_empty() {
            return Ok(0);
        }
        let inputs: Vec<String> = items.iter().map(|(_, _, text)| text.clone()).collect();
        let vectors = embedder.embed(&inputs).await?;
        check_batch(embedder, &inputs, &vectors)?;
        let rows: Vec<(String, String, Vec<f32>)> = items
            .iter()
            .zip(vectors)
            .map(|((kind, id, _), v)| (kind.clone(), id.clone(), v))
            .collect();
        self.vector_upsert_batch(&embedder.space(), &rows).await
    }

    pub async fn vector_search_text(
        &self,
        embedder: &dyn Embedder,
        query: &str,
        k: usize,
        filter: Option<&VectorFilter>,
    ) -> Result<Vec<VectorHit>> {
        let inputs = vec![query.to_string()];
        let vectors = embedder.embed(&inputs).await?;
        check_batch(embedder, &inputs, &vectors)?;
        self.vector_search(&embedder.space(), &vectors[0], k, filter)
            .await
    }
}

#[cfg(test)]
pub(crate) mod testing {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    pub(crate) struct HashEmbedder {
        pub dim: usize,
        pub model: String,
        pub calls: AtomicUsize,
    }

    impl HashEmbedder {
        pub(crate) fn new(model: &str, dim: usize) -> Self {
            HashEmbedder {
                dim,
                model: model.to_string(),
                calls: AtomicUsize::new(0),
            }
        }
    }

    impl Embedder for HashEmbedder {
        fn provider(&self) -> &str {
            "test"
        }
        fn model(&self) -> &str {
            &self.model
        }
        fn dim(&self) -> usize {
            self.dim
        }
        fn embed<'a>(&'a self, texts: &'a [String]) -> BoxFuture<'a, Result<Vec<Vec<f32>>>> {
            Box::pin(async move {
                self.calls.fetch_add(1, Ordering::SeqCst);
                Ok(texts
                    .iter()
                    .map(|t| {
                        let mut v = vec![0.0_f32; self.dim];
                        for (i, byte) in t.bytes().enumerate() {
                            v[i % self.dim] += f32::from(byte) / 255.0;
                        }
                        if v.iter().all(|x| *x == 0.0) {
                            v[0] = 1.0;
                        }
                        v
                    })
                    .collect())
            })
        }
    }

    pub(crate) struct BrokenEmbedder {
        pub dim: usize,
        pub emit: usize,
        pub emit_dim: usize,
    }

    impl Embedder for BrokenEmbedder {
        fn provider(&self) -> &str {
            "test"
        }
        fn model(&self) -> &str {
            "broken"
        }
        fn dim(&self) -> usize {
            self.dim
        }
        fn embed<'a>(&'a self, _texts: &'a [String]) -> BoxFuture<'a, Result<Vec<Vec<f32>>>> {
            let out = vec![vec![1.0_f32; self.emit_dim]; self.emit];
            Box::pin(async move { Ok(out) })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::testing::*;
    use super::*;
    use std::sync::atomic::Ordering;

    async fn open(name: &str) -> (tempfile::TempDir, EmbedDb) {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join(name)).await.unwrap();
        db.vector_init().await.unwrap();
        (dir, db)
    }

    #[tokio::test]
    async fn space_is_derived_from_the_embedder() {
        let e = HashEmbedder::new("m1", 8);
        let space = e.space();
        assert_eq!(space.provider, "test");
        assert_eq!(space.model, "m1");
        assert_eq!(space.dim, 8);
    }

    #[tokio::test]
    async fn upsert_and_search_by_text_round_trip() {
        let (_d, db) = open("embed_text.db").await;
        let e = HashEmbedder::new("m1", 16);

        db.vector_upsert_text(&e, "message", "a", "deploy the cluster")
            .await
            .unwrap();
        db.vector_upsert_text(&e, "message", "b", "lunch at noon")
            .await
            .unwrap();

        let hits = db
            .vector_search_text(&e, "deploy the cluster", 1, None)
            .await
            .unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].ref_id, "a");
        assert!((hits[0].score - 1.0).abs() < 1e-5);
    }

    #[tokio::test]
    async fn batch_text_upsert_issues_one_embedder_call() {
        let (_d, db) = open("embed_batch.db").await;
        let e = HashEmbedder::new("m1", 16);
        let items = vec![
            ("message".to_string(), "a".to_string(), "first".to_string()),
            ("message".to_string(), "b".to_string(), "second".to_string()),
            ("message".to_string(), "c".to_string(), "third".to_string()),
        ];

        let n = db.vector_upsert_texts(&e, &items).await.unwrap();
        assert_eq!(n, 3);
        assert_eq!(e.calls.load(Ordering::SeqCst), 1);
        assert_eq!(db.vector_count("m1").await.unwrap(), 3);
    }

    #[tokio::test]
    async fn empty_batch_does_not_call_the_embedder() {
        let (_d, db) = open("embed_empty.db").await;
        let e = HashEmbedder::new("m1", 16);
        assert_eq!(db.vector_upsert_texts(&e, &[]).await.unwrap(), 0);
        assert_eq!(e.calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn two_embedders_cannot_contaminate_each_other() {
        let (_d, db) = open("embed_isolation.db").await;
        let a = HashEmbedder::new("model-a", 16);
        let b = HashEmbedder::new("model-b", 16);

        db.vector_upsert_text(&a, "message", "x", "shared text")
            .await
            .unwrap();
        db.vector_upsert_text(&b, "message", "y", "shared text")
            .await
            .unwrap();

        let hits = db
            .vector_search_text(&a, "shared text", 10, None)
            .await
            .unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].ref_id, "x");
    }

    #[tokio::test]
    async fn wrong_vector_count_is_rejected() {
        let (_d, db) = open("embed_count.db").await;
        let e = BrokenEmbedder {
            dim: 4,
            emit: 2,
            emit_dim: 4,
        };
        let items = vec![("message".to_string(), "a".to_string(), "one".to_string())];
        let err = db.vector_upsert_texts(&e, &items).await.unwrap_err();
        assert!(matches!(err, EmbedError::Embedder(_)), "{err}");
        assert_eq!(db.vector_count("broken").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn wrong_vector_dim_is_rejected() {
        let (_d, db) = open("embed_dim.db").await;
        let e = BrokenEmbedder {
            dim: 4,
            emit: 1,
            emit_dim: 3,
        };
        let err = db
            .vector_upsert_text(&e, "message", "a", "one")
            .await
            .unwrap_err();
        assert!(
            matches!(
                err,
                EmbedError::VectorDim {
                    expected: 4,
                    actual: 3
                }
            ),
            "{err}"
        );
    }

    #[tokio::test]
    async fn embedder_is_usable_behind_dyn() {
        let (_d, db) = open("embed_dyn.db").await;
        let boxed: Box<dyn Embedder> = Box::new(HashEmbedder::new("m1", 8));
        db.vector_upsert_text(boxed.as_ref(), "message", "a", "text")
            .await
            .unwrap();
        let hits = db
            .vector_search_text(boxed.as_ref(), "text", 1, None)
            .await
            .unwrap();
        assert_eq!(hits[0].ref_id, "a");
    }
}
