-- Tracker Schema for Service Operations
-- This schema is only accessible via service role

-- Create the tracker schema
CREATE SCHEMA IF NOT EXISTS tracker;

-- Set default privileges for the tracker schema
-- Only service_role should have access
GRANT USAGE ON SCHEMA tracker TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA tracker TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tracker TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA tracker TO service_role;

-- Ensure future tables inherit these permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA tracker GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tracker GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tracker GRANT ALL ON FUNCTIONS TO service_role;

-- Explicitly revoke access from anon and authenticated roles
REVOKE ALL ON SCHEMA tracker FROM anon;
REVOKE ALL ON SCHEMA tracker FROM authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA tracker FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA tracker FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA tracker FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA tracker FROM authenticated;