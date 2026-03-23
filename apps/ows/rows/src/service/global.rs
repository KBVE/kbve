use super::OWSService;
use crate::error::RowsError;
use crate::models::GlobalData;
use crate::repo::GlobalDataRepo;
use uuid::Uuid;

impl OWSService {
    pub async fn get_global_data(
        &self,
        customer_guid: Uuid,
        key: &str,
    ) -> Result<Option<GlobalData>, RowsError> {
        let repo = GlobalDataRepo(&self.state.db);
        repo.get(customer_guid, key).await
    }

    pub async fn set_global_data(
        &self,
        customer_guid: Uuid,
        key: &str,
        value: &str,
    ) -> Result<(), RowsError> {
        let repo = GlobalDataRepo(&self.state.db);
        repo.set(customer_guid, key, value).await
    }
}
