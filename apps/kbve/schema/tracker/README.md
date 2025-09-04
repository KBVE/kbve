# KBVE Tracker Schema

The tracker schema provides service-level operations and distributed system coordination for KBVE applications.

## Overview

This schema is designed exclusively for **service role access** and handles:
- Discord bot shard coordination across multiple clusters
- Distributed system state management
- Performance monitoring and metrics collection
- Automated cleanup and maintenance tasks

## Security Model

- ✅ **Service Role**: Full access (SELECT, INSERT, UPDATE, DELETE, EXECUTE)
- ❌ **Anon Role**: No access 
- ❌ **Authenticated Role**: No access
- ❌ **Public**: No access

## Installation

Run the complete schema setup in your Supabase project:

```sql
\i apps/kbve/schema/tracker/tracker.sql
```

## Tables

### `tracker.cluster_management`

Manages Discord bot shard assignments and coordination across multiple clusters and instances.

**Key Features:**
- Automatic shard assignment with conflict prevention
- Heartbeat monitoring for instance health
- Performance metrics collection
- Kubernetes metadata tracking
- Automatic cleanup of stale assignments

## Functions

### Core Functions

- `tracker.upsert_instance_assignment()` - Get or create shard assignment for an instance
- `tracker.get_next_available_shard()` - Find next available shard in a cluster
- `tracker.cleanup_stale_assignments()` - Remove inactive/dead instances

### Utility Functions

- `tracker.update_updated_at_column()` - Trigger function for timestamp updates

## Automatic Maintenance

The schema includes automated cleanup via pg_cron (if available):
- Runs every 5 minutes
- Removes assignments older than 10 minutes
- Prevents resource leaks from crashed instances

## Usage Example

```sql
-- Get/create shard assignment for a bot instance
SELECT * FROM tracker.upsert_instance_assignment(
    'discord-bot-001',        -- instance_id
    'production-cluster',     -- cluster_name 
    'pod-discord-bot-001',   -- hostname
    '10.244.1.5'::inet,      -- pod_ip
    'node-1'                 -- node_name
);

-- Manual cleanup of stale assignments
SELECT * FROM tracker.cleanup_stale_assignments('15 minutes'::interval);
```

## Monitoring

Key queries for monitoring the system:

```sql
-- Active instances per cluster
SELECT cluster_name, COUNT(*) as active_instances
FROM tracker.cluster_management 
WHERE status = 'active' 
AND last_heartbeat > NOW() - INTERVAL '5 minutes'
GROUP BY cluster_name;

-- Shard distribution
SELECT cluster_name, shard_id, instance_id, last_heartbeat
FROM tracker.cluster_management
WHERE status = 'active'
ORDER BY cluster_name, shard_id;
```