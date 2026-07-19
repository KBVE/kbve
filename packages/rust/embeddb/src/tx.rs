use crate::Result;

pub struct EmbedTx<'a> {
    tx: turso::transaction::Transaction<'a>,
}

impl<'a> EmbedTx<'a> {
    pub(crate) fn new(tx: turso::transaction::Transaction<'a>) -> Self {
        EmbedTx { tx }
    }

    pub async fn execute(&self, sql: &str, params: impl turso::IntoParams) -> Result<u64> {
        let affected = self.tx.execute(sql, params).await?;
        Ok(affected)
    }

    pub async fn commit(self) -> Result<()> {
        self.tx.commit().await?;
        Ok(())
    }

    pub async fn rollback(self) -> Result<()> {
        self.tx.rollback().await?;
        Ok(())
    }
}
