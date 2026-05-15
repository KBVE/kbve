use crate::db::DbPool;
use crate::error::RowsError;
use crate::models::*;
use uuid::Uuid;

/// Global data repository — key-value world state.
pub struct GlobalDataRepo<'a>(pub &'a DbPool);

impl<'a> GlobalDataRepo<'a> {
    pub async fn get(
        &self,
        customer_guid: Uuid,
        key: &str,
    ) -> Result<Option<GlobalData>, RowsError> {
        let data = sqlx::query_as::<_, GlobalData>(
            "SELECT globaldatakey AS global_data_key, globaldatavalue AS global_data_value
             FROM globaldata
             WHERE customerguid = $1 AND globaldatakey = $2",
        )
        .bind(customer_guid)
        .bind(key)
        .fetch_optional(self.0)
        .await?;

        Ok(data)
    }

    pub async fn set(&self, customer_guid: Uuid, key: &str, value: &str) -> Result<(), RowsError> {
        sqlx::query(
            "INSERT INTO globaldata (customerguid, globaldatakey, globaldatavalue)
             VALUES ($1, $2, $3)
             ON CONFLICT (customerguid, globaldatakey)
             DO UPDATE SET globaldatavalue = EXCLUDED.globaldatavalue",
        )
        .bind(customer_guid)
        .bind(key)
        .bind(value)
        .execute(self.0)
        .await?;

        Ok(())
    }
}
