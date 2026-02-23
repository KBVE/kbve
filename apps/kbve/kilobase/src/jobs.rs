use pgrx::prelude::*;

#[derive(Debug)]
pub struct JobInfo {
    pub id: i32,
    pub schema: String,
    pub view_name: String,
    pub interval_secs: i32,
    pub source_table: Option<String>,
    pub last_change_count: i64,
    pub has_unique_index: bool,
}

impl JobInfo {
    pub fn from_tuple(job: &pgrx::spi::SpiHeapTupleData) -> Result<Self, pgrx::spi::Error> {
        Ok(JobInfo {
            id: job.get_by_name::<i32, _>("id")?.unwrap_or(0),
            schema: job
                .get_by_name::<String, _>("schema_name")?
                .unwrap_or_else(|| "public".to_string()),
            view_name: job
                .get_by_name::<String, _>("view_name")?
                .unwrap_or_else(|| "unknown".to_string()),
            interval_secs: job
                .get_by_name::<i32, _>("refresh_interval_seconds")?
                .unwrap_or(300),
            source_table: job.get_by_name::<String, _>("source_table")?.or(None),
            last_change_count: job.get_by_name::<i64, _>("last_change_count")?.unwrap_or(0),
            has_unique_index: job
                .get_by_name::<bool, _>("has_unique_index")?
                .unwrap_or(false),
        })
    }
}

pub fn log_cycle_completion(jobs_processed: usize, jobs_skipped: usize) {
    if jobs_processed > 0 || jobs_skipped > 0 {
        log!(
            "Processed {} refresh jobs, skipped {} (no changes)",
            jobs_processed,
            jobs_skipped
        );
    } else {
        log!("No materialized views due for refresh");
    }
}
