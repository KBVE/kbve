-- KBVE Tracker Schema
-- Service-level operations and distributed system coordination
-- Security: Service role only access

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS tracker;
ALTER SCHEMA tracker OWNER TO postgres;
GRANT USAGE ON SCHEMA tracker TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA tracker TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tracker TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA tracker TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA tracker TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tracker GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tracker GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tracker GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tracker GRANT ALL ON ROUTINES TO service_role;

-- Also grant default privileges for objects created by postgres role
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tracker GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tracker GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tracker GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tracker GRANT ALL ON ROUTINES TO service_role;
REVOKE ALL ON SCHEMA tracker FROM PUBLIC;
REVOKE ALL ON SCHEMA tracker FROM anon;
REVOKE ALL ON SCHEMA tracker FROM authenticated;
CREATE TABLE IF NOT EXISTS tracker.cluster_management (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_id TEXT NOT NULL,
    cluster_name TEXT NOT NULL,
    shard_id INTEGER NOT NULL CHECK (shard_id >= 0),
    total_shards INTEGER NOT NULL DEFAULT 2 CHECK (total_shards > 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error', 'starting', 'stopping')),
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hostname TEXT,
    pod_ip INET,
    node_name TEXT,
    namespace TEXT DEFAULT 'discord',
    guild_count INTEGER DEFAULT 0 CHECK (guild_count >= 0),
    latency_ms NUMERIC(10,2) DEFAULT 0 CHECK (latency_ms >= 0),
    memory_usage_mb NUMERIC(10,2) DEFAULT 0,
    cpu_usage_percent NUMERIC(5,2) DEFAULT 0,
    bot_version TEXT,
    deployment_version TEXT,
    UNIQUE(cluster_name, shard_id),
    UNIQUE(instance_id, cluster_name)
);

COMMENT ON TABLE tracker.cluster_management IS 'Discord bot shard coordination across clusters';
CREATE INDEX IF NOT EXISTS idx_cluster_management_instance_lookup 
    ON tracker.cluster_management(instance_id, cluster_name);

CREATE INDEX IF NOT EXISTS idx_cluster_management_heartbeat 
    ON tracker.cluster_management(last_heartbeat DESC);

CREATE INDEX IF NOT EXISTS idx_cluster_management_active_status 
    ON tracker.cluster_management(status, cluster_name) 
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_cluster_management_shard_assignment 
    ON tracker.cluster_management(cluster_name, shard_id);

CREATE INDEX IF NOT EXISTS idx_cluster_management_stale_cleanup 
    ON tracker.cluster_management(last_heartbeat) 
    WHERE status != 'inactive';
CREATE OR REPLACE FUNCTION tracker.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

DROP TRIGGER IF EXISTS trigger_update_cluster_management_updated_at ON tracker.cluster_management;
CREATE TRIGGER trigger_update_cluster_management_updated_at
    BEFORE UPDATE ON tracker.cluster_management
    FOR EACH ROW
    EXECUTE FUNCTION tracker.update_updated_at_column();
CREATE OR REPLACE FUNCTION tracker.cleanup_stale_assignments(
    p_stale_threshold INTERVAL DEFAULT '10 minutes'
)
RETURNS TABLE (
    cleaned_count INTEGER,
    affected_instances TEXT[]
) AS $$
DECLARE
    deleted_count INTEGER;
    affected_list TEXT[];
BEGIN
    -- Get list of instances being cleaned up
    SELECT ARRAY_AGG(instance_id || '/' || cluster_name) INTO affected_list
    FROM tracker.cluster_management 
    WHERE last_heartbeat < (NOW() - p_stale_threshold)
    AND status != 'inactive';
    
    -- Delete stale assignments
    DELETE FROM tracker.cluster_management 
    WHERE last_heartbeat < (NOW() - p_stale_threshold)
    AND status != 'inactive';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Return results
    RETURN QUERY SELECT deleted_count, COALESCE(affected_list, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = '';
CREATE OR REPLACE FUNCTION tracker.get_next_available_shard(
    p_cluster_name TEXT, 
    p_total_shards INTEGER DEFAULT 2,
    p_active_threshold INTERVAL DEFAULT '5 minutes'
)
RETURNS TABLE (
    shard_id INTEGER,
    assignment_strategy TEXT,
    active_shards INTEGER[]
) AS $$
DECLARE
    next_shard INTEGER;
    used_shards INTEGER[];
    assignment_method TEXT;
BEGIN
    -- Input validation
    IF p_total_shards <= 0 THEN
        RAISE EXCEPTION 'Total shards must be greater than 0';
    END IF;
    
    -- Get currently active shards for this cluster
    SELECT ARRAY_AGG(cm.shard_id ORDER BY cm.shard_id) INTO used_shards
    FROM tracker.cluster_management cm
    WHERE cm.cluster_name = p_cluster_name 
    AND cm.last_heartbeat > (NOW() - p_active_threshold)
    AND cm.status = 'active';
    
    -- If no active shards, assign shard 0
    IF used_shards IS NULL OR array_length(used_shards, 1) IS NULL THEN
        assignment_method := 'first_assignment';
        next_shard := 0;
    ELSE
        -- Find first available shard
        next_shard := NULL;
        FOR i IN 0..(p_total_shards - 1) LOOP
            IF NOT (i = ANY(used_shards)) THEN
                next_shard := i;
                assignment_method := 'available_slot';
                EXIT;
            END IF;
        END LOOP;
        
        -- If all shards are taken, use round-robin
        IF next_shard IS NULL THEN
            next_shard := array_length(used_shards, 1) % p_total_shards;
            assignment_method := 'round_robin';
        END IF;
    END IF;
    
    -- Return the assignment information
    RETURN QUERY SELECT 
        next_shard, 
        assignment_method,
        COALESCE(used_shards, ARRAY[]::INTEGER[]);
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = '';
CREATE OR REPLACE FUNCTION tracker.upsert_instance_assignment(
    p_instance_id TEXT,
    p_cluster_name TEXT,
    p_hostname TEXT DEFAULT NULL,
    p_pod_ip INET DEFAULT NULL,
    p_node_name TEXT DEFAULT NULL,
    p_namespace TEXT DEFAULT 'discord',
    p_bot_version TEXT DEFAULT NULL,
    p_deployment_version TEXT DEFAULT NULL,
    p_total_shards INTEGER DEFAULT 2
)
RETURNS TABLE (
    instance_id TEXT,
    cluster_name TEXT,
    assigned_shard_id INTEGER,
    total_shards INTEGER,
    assignment_strategy TEXT,
    is_new_assignment BOOLEAN
) AS $$
DECLARE
    existing_assignment RECORD;
    shard_assignment RECORD;
    is_new BOOLEAN := FALSE;
BEGIN
    -- Check for existing assignment
    SELECT * INTO existing_assignment
    FROM tracker.cluster_management
    WHERE cluster_management.instance_id = p_instance_id 
    AND cluster_management.cluster_name = p_cluster_name;
    
    IF existing_assignment IS NOT NULL THEN
        -- Update existing assignment
        UPDATE tracker.cluster_management SET
            last_heartbeat = NOW(),
            status = 'active',
            hostname = COALESCE(p_hostname, hostname),
            pod_ip = COALESCE(p_pod_ip, pod_ip),
            node_name = COALESCE(p_node_name, node_name),
            namespace = COALESCE(p_namespace, namespace),
            bot_version = COALESCE(p_bot_version, bot_version),
            deployment_version = COALESCE(p_deployment_version, deployment_version),
            total_shards = p_total_shards
        WHERE cluster_management.instance_id = p_instance_id 
        AND cluster_management.cluster_name = p_cluster_name;
        
        -- Return existing assignment
        RETURN QUERY SELECT 
            p_instance_id,
            p_cluster_name,
            existing_assignment.shard_id,
            p_total_shards,
            'existing_assignment'::TEXT,
            FALSE;
    ELSE
        -- Get next available shard
        SELECT * INTO shard_assignment
        FROM tracker.get_next_available_shard(p_cluster_name, p_total_shards);
        
        -- Insert new assignment
        INSERT INTO tracker.cluster_management (
            instance_id, cluster_name, shard_id, total_shards,
            hostname, pod_ip, node_name, namespace,
            bot_version, deployment_version,
            status, last_heartbeat
        ) VALUES (
            p_instance_id, p_cluster_name, shard_assignment.shard_id, p_total_shards,
            p_hostname, p_pod_ip, p_node_name, p_namespace,
            p_bot_version, p_deployment_version,
            'active', NOW()
        );
        
        -- Return new assignment
        RETURN QUERY SELECT 
            p_instance_id,
            p_cluster_name,
            shard_assignment.shard_id,
            p_total_shards,
            shard_assignment.assignment_strategy,
            TRUE;
    END IF;
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = '';
ALTER TABLE tracker.cluster_management ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON tracker.cluster_management
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);
CREATE POLICY "deny_anon_access" ON tracker.cluster_management
    FOR ALL TO anon
    USING (false);

CREATE POLICY "deny_authenticated_access" ON tracker.cluster_management
    FOR ALL TO authenticated
    USING (false);
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tracker TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA tracker TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tracker TO service_role;

COMMENT ON SCHEMA tracker IS 'Service-level operations and distributed system coordination - Service role access only';

-- Verify setup before committing
DO $$
DECLARE
    test_result RECORD;
    schema_exists BOOLEAN;
    table_exists BOOLEAN;
BEGIN
    -- Check if schema was created
    SELECT EXISTS(
        SELECT 1 FROM information_schema.schemata 
        WHERE schema_name = 'tracker'
    ) INTO schema_exists;
    
    -- Check if table was created
    SELECT EXISTS(
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'tracker' 
        AND table_name = 'cluster_management'
    ) INTO table_exists;
    
    -- Report schema creation status
    IF NOT schema_exists OR NOT table_exists THEN
        RAISE EXCEPTION 'Schema setup failed - schema exists: %, table exists: %', schema_exists, table_exists;
    END IF;
    
    -- Test the shard assignment function
    SELECT * INTO test_result 
    FROM tracker.upsert_instance_assignment(
        'test-instance-001', 
        'test-cluster', 
        'test-hostname',
        '192.168.1.100'::inet,
        'test-node'
    );
    
    -- Verify assignment was created
    IF test_result IS NULL THEN
        RAISE EXCEPTION 'Test failed: Could not create shard assignment';
    END IF;
    
    RAISE NOTICE 'Test successful: Instance % got shard % via %', 
        test_result.instance_id, 
        test_result.assigned_shard_id, 
        test_result.assignment_strategy;
        
    -- Cleanup test data
    DELETE FROM tracker.cluster_management WHERE instance_id = 'test-instance-001';
    
    -- Final success message
    RAISE NOTICE 'Tracker schema setup and verification completed successfully!';
END $$;

COMMIT;

-- To remove the tracker schema:
-- DROP SCHEMA IF EXISTS tracker CASCADE;

