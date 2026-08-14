use crate::{kilobase_job_id, kilobase_refresh_job};
use pgrx::prelude::*;

// Scheduling delegated to pg_durable rather than the built-in worker loop.
//
// The worker in lib.rs polls: it wakes on a timer, scans for due jobs, and
// keeps its own next_refresh bookkeeping. That works, but it has no memory
// across a crash mid-refresh, no retry policy, and no history beyond
// matview_refresh_log. pg_durable already solves those, so a scheduled refresh
// here is an eternal loop of `wait_for_schedule(cron) ~> kilobase_refresh_job(id)`.
//
// Only the scheduling moves. Deciding whether a view can refresh CONCURRENTLY,
// whether its source changed, and what to record afterwards all stay in
// kilobase_refresh_job, so the two paths cannot drift apart.
//
// Every df.* function takes and returns text, so the graph composes directly
// and none of this needs dynamic SQL.

extension_sql!(
    r#"
    CREATE TABLE IF NOT EXISTS matview_durable_schedules (
        job_id INTEGER PRIMARY KEY REFERENCES matview_refresh_jobs(id) ON DELETE CASCADE,
        instance_id VARCHAR(8) NOT NULL,
        cron_expression TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_matview_durable_instance
        ON matview_durable_schedules(instance_id);

    -- Deterministic so a schedule can always be found again from the view name
    -- alone, without storing the instance id anywhere else.
    CREATE OR REPLACE FUNCTION kilobase_durable_label(
        p_schema_name TEXT,
        p_view_name TEXT
    ) RETURNS TEXT AS $$
        SELECT 'kilobase:matview:' || p_schema_name || '.' || p_view_name;
    $$ LANGUAGE sql IMMUTABLE;

    -- Schedule a registered job on a cron expression. Returns the pg_durable
    -- instance id. Re-scheduling the same view cancels the previous instance
    -- rather than leaving two loops refreshing the same view.
    CREATE OR REPLACE FUNCTION kilobase_schedule_matview(
        p_schema_name TEXT,
        p_view_name TEXT,
        p_cron TEXT
    ) RETURNS TEXT AS $$
    DECLARE
        v_job_id INTEGER;
        v_label TEXT;
        v_instance TEXT;
    BEGIN
        v_job_id := kilobase_job_id(p_schema_name, p_view_name);
        IF v_job_id IS NULL THEN
            RAISE EXCEPTION 'no active refresh job for %.% - call register_matview_refresh first',
                p_schema_name, p_view_name;
        END IF;

        v_label := kilobase_durable_label(p_schema_name, p_view_name);

        PERFORM kilobase_unschedule_matview(p_schema_name, p_view_name);

        v_instance := df.start(
            df.loop(
                df.wait_for_schedule(p_cron)
                ~> format('SELECT kilobase_refresh_job(%s)', v_job_id)
            ),
            v_label
        );

        INSERT INTO matview_durable_schedules (job_id, instance_id, cron_expression)
        VALUES (v_job_id, v_instance, p_cron)
        ON CONFLICT (job_id) DO UPDATE
            SET instance_id = EXCLUDED.instance_id,
                cron_expression = EXCLUDED.cron_expression,
                created_at = NOW();

        RETURN v_instance;
    END;
    $$ LANGUAGE plpgsql;

    -- Cancel the scheduling loop. The job stays registered, so the built-in
    -- worker still picks it up on its own timer.
    CREATE OR REPLACE FUNCTION kilobase_unschedule_matview(
        p_schema_name TEXT,
        p_view_name TEXT
    ) RETURNS BOOLEAN AS $$
    DECLARE
        v_label TEXT;
        v_instance TEXT;
        v_cancelled BOOLEAN := FALSE;
    BEGIN
        v_label := kilobase_durable_label(p_schema_name, p_view_name);

        FOR v_instance IN
            SELECT id FROM df.instances
            WHERE label = v_label AND status IN ('pending', 'running')
        LOOP
            PERFORM df.cancel(v_instance, 'Unscheduled via kilobase_unschedule_matview');
            v_cancelled := TRUE;
        END LOOP;

        DELETE FROM matview_durable_schedules
        WHERE job_id = kilobase_job_id(p_schema_name, p_view_name);

        RETURN v_cancelled;
    END;
    $$ LANGUAGE plpgsql;

    -- NULL when the view was never scheduled, otherwise the pg_durable status.
    CREATE OR REPLACE FUNCTION kilobase_durable_status(
        p_schema_name TEXT,
        p_view_name TEXT
    ) RETURNS TEXT AS $$
        SELECT status
        FROM df.instances
        WHERE label = kilobase_durable_label(p_schema_name, p_view_name)
        ORDER BY created_at DESC
        LIMIT 1;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE VIEW matview_durable_status AS
    SELECT
        j.id AS job_id,
        j.schema_name,
        j.view_name,
        s.cron_expression,
        s.instance_id,
        i.status,
        i.created_at AS scheduled_at,
        j.last_refresh
    FROM matview_durable_schedules s
    JOIN matview_refresh_jobs j ON j.id = s.job_id
    LEFT JOIN df.instances i ON i.id = s.instance_id;
    "#,
    name = "durable_scheduling",
    requires = ["try_refresh_helper", kilobase_refresh_job, kilobase_job_id]
);
