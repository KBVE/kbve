use pgrx::prelude::*;

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
}

pub fn log_cycle_completion(jobs_processed: usize) {
    if jobs_processed > 0 {
        log!("Processed {} refresh jobs", jobs_processed);
    } else {
        log!("No materialized views due for refresh");
    }
}