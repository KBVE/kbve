use pgrx::{datum::DatumWithOid, prelude::*};

#[derive(Debug)]
pub struct JobInfo {
    pub id: i32,
    pub schema: String,
    pub view_name: String,
    pub interval_secs: i32,
}

impl JobInfo {
    pub fn from_tuple(job: &pgrx::spi::SpiHeapTupleData) -> Result<Self, pgrx::spi::Error> {
        Ok(JobInfo {
            id: job.get_by_name::<i32, _>("id")?.unwrap_or(0),
            schema: job.get_by_name::<String, _>("schema_name")?.unwrap_or_else(|| "public".to_string()),
            view_name: job.get_by_name::<String, _>("view_name")?.unwrap_or_else(|| "unknown".to_string()),
            interval_secs: job.get_by_name::<i32, _>("refresh_interval_seconds")?.unwrap_or(300),
        })
    }

    pub fn process(&self, client: &mut pgrx::spi::SpiClient) -> Result<(), pgrx::spi::Error> {
        log!("Processing refresh for {}.{} (job_id: {})", 
             self.schema, self.view_name, self.id);

        let refresh_result = crate::refresh_materialized_view(client, self);
        self.update_next_refresh(client)?;

        match refresh_result {
            Ok(duration_ms) => {
                log!("SUCCESS: Refreshed {}.{} in {}ms", 
                     self.schema, self.view_name, duration_ms);
            }
            Err(error_msg) => {
                log!("ERROR: Failed to refresh {}.{}: {}", 
                     self.schema, self.view_name, error_msg);
            }
        }

        Ok(())
    }

    fn update_next_refresh(&self, client: &mut pgrx::spi::SpiClient) -> Result<(), pgrx::spi::Error> {
        let next_refresh_sql = format!(
            "UPDATE matview_refresh_jobs 
            SET last_refresh = NOW(), 
                next_refresh = NOW() + INTERVAL '{} seconds'
            WHERE id = $1",
            self.interval_secs
        );
        
        client.update(
            &next_refresh_sql, 
            None, 
            &[unsafe { DatumWithOid::new(self.id.into_datum().unwrap(), pg_sys::INT4OID) }]
        )?;
        Ok(())
    }
}

pub fn log_cycle_completion(jobs_processed: usize) {
    if jobs_processed > 0 {
        log!("Processed {} refresh jobs", jobs_processed);
    } else {
        log!("No materialized views due for refresh");
    }
}