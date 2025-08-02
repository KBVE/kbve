use pgrx::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(PostgresEnum, Serialize, Deserialize)]
pub enum RefreshStatus {
    Pending,
    Running,
    Success,
    Failed,
}

#[derive(PostgresType, Serialize, Deserialize)]
pub struct MatviewRefreshResult {
    pub view_name: String,
    pub schema_name: String,
    pub status: RefreshStatus,
    pub duration_ms: i32,
    pub error_message: Option<String>,
}

extension_sql!(
    r#"
    -- Core table for tracking materialized view refresh jobs
    CREATE TABLE IF NOT EXISTS matview_refresh_jobs (
        id SERIAL PRIMARY KEY,
        schema_name TEXT NOT NULL,
        view_name TEXT NOT NULL,
        refresh_interval_seconds INTEGER DEFAULT 300,
        last_refresh TIMESTAMPTZ,
        next_refresh TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(schema_name, view_name)
    );

    -- Log table for refresh history
    CREATE TABLE IF NOT EXISTS matview_refresh_log (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES matview_refresh_jobs(id),
        refresh_time TIMESTAMPTZ DEFAULT NOW(),
        status TEXT NOT NULL,
        duration_ms INTEGER,
        error_message TEXT,
        rows_affected BIGINT
    );
    "#,
    name = "bootstrap_tables",
    bootstrap,
);

// Create indexes after tables
extension_sql!(
    r#"
    -- Indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_matview_jobs_next_refresh 
        ON matview_refresh_jobs(next_refresh) WHERE is_active = true;
    
    CREATE INDEX IF NOT EXISTS idx_matview_log_job_time 
        ON matview_refresh_log(job_id, refresh_time);
    
    CREATE INDEX IF NOT EXISTS idx_matview_log_status_time 
        ON matview_refresh_log(status, refresh_time);
    "#,
    name = "create_indexes",
    requires = ["bootstrap_tables"]
);

// Helper functions for managing refresh jobs
extension_sql!(
    r#"
    -- Function to register a materialized view for automatic refresh
    CREATE OR REPLACE FUNCTION register_matview_refresh(
        p_schema_name TEXT,
        p_view_name TEXT,
        p_interval_seconds INTEGER DEFAULT 300
    ) RETURNS INTEGER AS $$
    DECLARE
        job_id INTEGER;
    BEGIN
        -- Verify the materialized view exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_matviews 
            WHERE schemaname = p_schema_name AND matviewname = p_view_name
        ) THEN
            RAISE EXCEPTION 'Materialized view %.% does not exist', p_schema_name, p_view_name;
        END IF;

        -- Insert or update the job
        INSERT INTO matview_refresh_jobs (schema_name, view_name, refresh_interval_seconds, next_refresh)
        VALUES (p_schema_name, p_view_name, p_interval_seconds, NOW() + INTERVAL '1 minute')
        ON CONFLICT (schema_name, view_name) 
        DO UPDATE SET 
            refresh_interval_seconds = p_interval_seconds,
            is_active = true,
            next_refresh = NOW() + INTERVAL '1 minute'
        RETURNING id INTO job_id;

        RETURN job_id;
    END;
    $$ LANGUAGE plpgsql;

    -- Function to unregister a materialized view
    CREATE OR REPLACE FUNCTION unregister_matview_refresh(
        p_schema_name TEXT,
        p_view_name TEXT
    ) RETURNS BOOLEAN AS $$
    BEGIN
        UPDATE matview_refresh_jobs 
        SET is_active = false 
        WHERE schema_name = p_schema_name AND view_name = p_view_name;
        
        RETURN FOUND;
    END;
    $$ LANGUAGE plpgsql;
    "#,
    name = "helper_functions",
    requires = ["create_indexes"]
);

extension_sql!(
    r#"
    -- View to see current refresh job status
    CREATE OR REPLACE VIEW matview_refresh_status AS
    SELECT 
        j.id,
        j.schema_name,
        j.view_name,
        j.refresh_interval_seconds,
        j.last_refresh,
        j.next_refresh,
        j.is_active,
        CASE 
            WHEN j.next_refresh <= NOW() THEN 'Due'
            ELSE 'Scheduled'
        END as current_status,
        mv.ispopulated as view_populated,
        pg_size_pretty(pg_total_relation_size(
            (j.schema_name || '.' || j.view_name)::regclass
        )) as view_size
    FROM matview_refresh_jobs j
    LEFT JOIN pg_matviews mv ON j.schema_name = mv.schemaname AND j.view_name = mv.matviewname
    WHERE j.is_active = true
    ORDER BY j.next_refresh;

    -- View for recent refresh history
    CREATE OR REPLACE VIEW matview_refresh_history AS
    SELECT 
        l.refresh_time,
        j.schema_name,
        j.view_name,
        l.status,
        l.duration_ms,
        l.error_message,
        l.rows_affected
    FROM matview_refresh_log l
    JOIN matview_refresh_jobs j ON l.job_id = j.id
    ORDER BY l.refresh_time DESC
    LIMIT 100;
    "#,
    name = "monitoring_views",
    requires = ["helper_functions"]
);

extension_sql!(
    r#"
    -- Example: Create a sample materialized view if none exist
    DO $$
    BEGIN
        -- Only create if no materialized views exist
        IF NOT EXISTS (SELECT 1 FROM pg_matviews LIMIT 1) THEN
            -- Create a simple example materialized view
            CREATE MATERIALIZED VIEW IF NOT EXISTS sample_stats AS
            SELECT 
                'sample_data'::text as category,
                generate_series(1, 10) as id,
                random() * 100 as value,
                NOW() as created_at;
            
            -- Add unique index for concurrent refresh
            CREATE UNIQUE INDEX IF NOT EXISTS idx_sample_stats_id ON sample_stats(id);
            
            -- Register it for automatic refresh every 2 minutes
            PERFORM register_matview_refresh('public', 'sample_stats', 120);
        END IF;
    END
    $$;
    "#,
    name = "sample_setup",
    requires = ["monitoring_views"]
);

extension_sql!(
    r#"
    -- Function to notify background worker of configuration changes
    CREATE OR REPLACE FUNCTION notify_matview_worker() RETURNS void AS $$
    BEGIN
        PERFORM pg_notify('matview_refresh_config_changed', '');
    END;
    $$ LANGUAGE plpgsql;

    -- Trigger to notify worker when jobs are modified
    CREATE OR REPLACE FUNCTION matview_jobs_notify_trigger() 
    RETURNS trigger AS $$
    BEGIN
        PERFORM notify_matview_worker();
        RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS matview_jobs_change_notify ON matview_refresh_jobs;
    CREATE TRIGGER matview_jobs_change_notify
        AFTER INSERT OR UPDATE OR DELETE ON matview_refresh_jobs
        FOR EACH ROW EXECUTE FUNCTION matview_jobs_notify_trigger();
    "#,
    name = "notifications",
    requires = ["sample_setup"]
);