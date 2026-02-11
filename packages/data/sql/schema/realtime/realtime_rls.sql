-- Realtime RLS Policies
-- This file contains the Row Level Security policies needed for Supabase Realtime to function properly
-- Run this after the main realtime_schema.sql

BEGIN;

-- =============================================================================
-- POLICIES FOR realtime.messages (Supabase Broadcast Table)
-- =============================================================================
-- This table is used by Supabase Realtime for broadcast functionality
-- Without these policies, WebSocket connections cannot send/receive broadcast messages

-- Drop existing policies if they exist (for safe re-runs)
DROP POLICY IF EXISTS "authenticated users can read broadcast messages" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated users can insert broadcast messages" ON realtime.messages;
DROP POLICY IF EXISTS "anon users can read broadcast messages" ON realtime.messages;
DROP POLICY IF EXISTS "anon users can insert broadcast messages" ON realtime.messages;
DROP POLICY IF EXISTS "service role has full access to broadcast messages" ON realtime.messages;

-- Allow ONLY authenticated users to read broadcast messages
CREATE POLICY "authenticated users can read broadcast messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

-- Allow ONLY authenticated users to insert broadcast messages
CREATE POLICY "authenticated users can insert broadcast messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Service role bypass for system operations
CREATE POLICY "service role has full access to broadcast messages"
ON realtime.messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =============================================================================
-- VERIFY EXISTING POLICIES ON public.realtime_messages
-- =============================================================================
-- Our custom table should already have policies from realtime_schema.sql
-- This section just verifies they exist

DO $$
BEGIN
    -- Check if policies exist on public.realtime_messages
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'realtime_messages'
        AND policyname = 'authenticated_users_read_messages'
    ) THEN
        RAISE NOTICE 'Missing policy: authenticated_users_read_messages on public.realtime_messages';
        
        -- Create the missing policy
        EXECUTE 'CREATE POLICY "authenticated_users_read_messages"
        ON public.realtime_messages
        FOR SELECT
        TO authenticated
        USING (true)';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'realtime_messages'
        AND policyname = 'authenticated_users_insert_messages'
    ) THEN
        RAISE NOTICE 'Missing policy: authenticated_users_insert_messages on public.realtime_messages';
        
        -- Create the missing policy
        EXECUTE 'CREATE POLICY "authenticated_users_insert_messages"
        ON public.realtime_messages
        FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() = user_id)';
    END IF;
END $$;

-- =============================================================================
-- GRANT NECESSARY PERMISSIONS
-- =============================================================================

-- Grant usage on realtime schema to authenticated users only
GRANT USAGE ON SCHEMA realtime TO authenticated;

-- Grant permissions on realtime.messages table to authenticated users only
GRANT SELECT, INSERT ON realtime.messages TO authenticated;

-- Grant permissions on public.realtime_messages table to authenticated users only
GRANT ALL ON public.realtime_messages TO authenticated;

-- Grant sequence permissions for ID generation
GRANT USAGE, SELECT ON SEQUENCE public.realtime_messages_id_seq TO authenticated;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these queries to verify the policies are working:

-- Check RLS is enabled on both tables
-- SELECT 
--     n.nspname as schema,
--     c.relname as table,
--     c.relrowsecurity as rls_enabled
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE c.relname IN ('messages', 'realtime_messages')
-- AND n.nspname IN ('realtime', 'public');

-- Check all policies
-- SELECT 
--     schemaname,
--     tablename,
--     policyname,
--     permissive,
--     roles,
--     cmd
-- FROM pg_policies
-- WHERE (schemaname = 'realtime' AND tablename = 'messages')
--    OR (schemaname = 'public' AND tablename = 'realtime_messages')
-- ORDER BY schemaname, tablename, policyname;

-- Check grants
-- SELECT 
--     n.nspname as schema,
--     c.relname as table,
--     pg_catalog.array_to_string(c.relacl, E'\n') AS privileges
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE c.relname IN ('messages', 'realtime_messages')
-- AND n.nspname IN ('realtime', 'public');

COMMIT;

-- =============================================================================
-- NOTES
-- =============================================================================
-- After running this script:
-- 1. WebSocket connections should be able to connect and subscribe to channels (authenticated users only)
-- 2. ONLY authenticated users can send and receive broadcast messages (no anon/guest access)
-- 3. The Studio warning about missing policies should disappear
-- 4. Guests/anon users will be blocked from realtime functionality
-- 5. Test with: supabase.channel('test-channel').subscribe() (requires authentication)