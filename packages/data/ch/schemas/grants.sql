-- grants.sql — privileges for the shared `logflare` ingest user.
-- =============================================================================
-- The `logflare` CH user is the single ingest identity for the direct-write
-- pipelines (Logflare-the-service is no longer in the path):
--   • apps/metrics  (Rust frontend telemetry)  → telemetry.*
--   • Vector (DaemonSet)                        → observability.*
--   • mc presence snapshots (apps/kbve)         → mc.*
--
-- `CREATE USER logflare ... IDENTIFIED WITH sha256_password` is issued by the
-- bootstrap Job from a sealed secret (password never lands in git). This file
-- is the canonical record of the GRANTs that must accompany it.
--
-- ClickHouse 25.x gates every `ON CLUSTER` statement behind the global CLUSTER
-- privilege — without it, CREATE DATABASE/TABLE ON CLUSTER fails ACCESS_DENIED
-- (Code 497) and the per-pipeline setup jobs can never provision their schema.
-- =============================================================================

-- Required to run any `ON CLUSTER` DDL (the setup jobs run as logflare).
GRANT CLUSTER ON *.* TO logflare ON CLUSTER 'cluster';

-- Data access for each direct-write pipeline (creating a table does not grant
-- the creator data rights in CH RBAC — these are required for INSERT/SELECT).
GRANT ALL ON logflare.* TO logflare ON CLUSTER 'cluster';
GRANT ALL ON telemetry.* TO logflare ON CLUSTER 'cluster';
GRANT ALL ON observability.* TO logflare ON CLUSTER 'cluster';
GRANT ALL ON mc.* TO logflare ON CLUSTER 'cluster';
