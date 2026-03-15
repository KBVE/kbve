-- =============================================================================
-- Logflare ClickHouse Backend — Database Setup
-- =============================================================================
-- Creates the logflare database.
-- Run this before the table schemas.
--
-- Production (clustered):
--   CREATE DATABASE IF NOT EXISTS logflare ON CLUSTER 'cluster';
-- =============================================================================

CREATE DATABASE IF NOT EXISTS logflare;
