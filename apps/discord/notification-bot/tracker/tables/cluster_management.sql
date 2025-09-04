-- Discord Bot Cluster Management Table
-- Manages shard assignments across multiple clusters and instances

CREATE TABLE IF NOT EXISTS tracker.cluster_management (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Instance identification
    instance_id TEXT NOT NULL,
    cluster_name TEXT NOT NULL,
    
    -- Shard assignment
    shard_id INTEGER NOT NULL,
    total_shards INTEGER NOT NULL DEFAULT 2,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Additional instance info
    hostname TEXT,
    pod_ip TEXT,
    node_name TEXT,
    
    -- Performance metrics (optional)
    guild_count INTEGER DEFAULT 0,
    latency_ms NUMERIC DEFAULT 0,
    
    -- Ensure unique shard assignment per cluster
    UNIQUE(cluster_name, shard_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cluster_management_instance ON tracker.cluster_management(instance_id, cluster_name);
CREATE INDEX IF NOT EXISTS idx_cluster_management_heartbeat ON tracker.cluster_management(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_cluster_management_status ON tracker.cluster_management(status, cluster_name);
CREATE INDEX IF NOT EXISTS idx_cluster_management_shard ON tracker.cluster_management(cluster_name, shard_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION tracker.update_cluster_management_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_cluster_management_updated_at
    BEFORE UPDATE ON tracker.cluster_management
    FOR EACH ROW
    EXECUTE FUNCTION tracker.update_cluster_management_updated_at();

-- Function to clean up stale assignments (older than 10 minutes)
CREATE OR REPLACE FUNCTION tracker.cleanup_stale_assignments()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM tracker.cluster_management 
    WHERE last_heartbeat < NOW() - INTERVAL '10 minutes'
    AND status != 'inactive';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get next available shard for a cluster
CREATE OR REPLACE FUNCTION tracker.get_next_available_shard(p_cluster_name TEXT, p_total_shards INTEGER DEFAULT 2)
RETURNS INTEGER AS $$
DECLARE
    next_shard INTEGER;
    used_shards INTEGER[];
BEGIN
    -- Get currently used shards for this cluster (active within last 5 minutes)
    SELECT ARRAY_AGG(shard_id) INTO used_shards
    FROM tracker.cluster_management 
    WHERE cluster_name = p_cluster_name 
    AND last_heartbeat > NOW() - INTERVAL '5 minutes'
    AND status = 'active';
    
    -- If no used shards, start with shard 0
    IF used_shards IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Find first available shard
    FOR i IN 0..(p_total_shards - 1) LOOP
        IF NOT (i = ANY(used_shards)) THEN
            RETURN i;
        END IF;
    END LOOP;
    
    -- All shards are used, return round-robin assignment
    RETURN array_length(used_shards, 1) % p_total_shards;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set RLS policies (service role only)
ALTER TABLE tracker.cluster_management ENABLE ROW LEVEL SECURITY;

-- Only service_role can access this table
CREATE POLICY "Service role full access" ON tracker.cluster_management
    FOR ALL USING (auth.role() = 'service_role');

-- Explicitly deny access to other roles
CREATE POLICY "Deny anon access" ON tracker.cluster_management
    FOR ALL TO anon USING (false);
    
CREATE POLICY "Deny authenticated access" ON tracker.cluster_management
    FOR ALL TO authenticated USING (false);

-- Grant permissions to service_role
GRANT ALL ON tracker.cluster_management TO service_role;