-- grants.sql — privileges for the shared `kbve_ingest` ingest user.
-- =============================================================================
-- The `kbve_ingest` CH user is the single ingest identity for the direct-write
-- pipelines (renamed from the legacy `logflare` user — Logflare-the-service is
-- no longer in the path):
--   • apps/metrics  (Rust frontend telemetry)  → telemetry.*
--   • Vector (DaemonSet)                        → observability.*
--   • mc presence snapshots (apps/kbve)         → mc.*
--   • factorio relay + factorio-ctl (agones)    → gameops.* (write)
--   • firecracker microVM telemetry             → firecracker.*
--   • axum-kbve dashboard proxy (apps/kbve)     → gameops.* (read)
--
-- `CREATE USER kbve_ingest ... IDENTIFIED WITH sha256_password` is issued by the
-- bootstrap Job from a sealed secret (password never lands in git). This file
-- is the canonical record of the GRANTs that must accompany it. The username is
-- supplied to consumers as plain env (not sensitive); only the password is sealed.
--
-- ClickHouse 25.x gates every `ON CLUSTER` statement behind the global CLUSTER
-- privilege — without it, CREATE DATABASE/TABLE ON CLUSTER fails ACCESS_DENIED
-- (Code 497) and the per-pipeline setup jobs can never provision their schema.
-- =============================================================================

-- Required to run any `ON CLUSTER` DDL (the setup jobs run as kbve_ingest).
GRANT CLUSTER ON *.* TO kbve_ingest ON CLUSTER 'cluster';

-- Data access for each direct-write pipeline (creating a table does not grant
-- the creator data rights in CH RBAC — these are required for INSERT/SELECT).
GRANT ALL ON logflare.* TO kbve_ingest ON CLUSTER 'cluster';
GRANT ALL ON telemetry.* TO kbve_ingest ON CLUSTER 'cluster';
GRANT ALL ON observability.* TO kbve_ingest ON CLUSTER 'cluster';
GRANT ALL ON mc.* TO kbve_ingest ON CLUSTER 'cluster';
-- gameops: factorio + sim telemetry (schemas/factorio.sql). Written by the
-- relay/factorio-ctl pipelines, read by the axum-kbve dashboard proxy.
GRANT ALL ON gameops.* TO kbve_ingest ON CLUSTER 'cluster';
-- firecracker: microVM lifecycle telemetry (schemas/firecracker.sql).
GRANT ALL ON firecracker.* TO kbve_ingest ON CLUSTER 'cluster';
