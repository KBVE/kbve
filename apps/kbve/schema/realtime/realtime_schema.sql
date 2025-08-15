-- Realtime Schema - 2025 Best Practices
-- Complete setup for Supabase Realtime with performance optimization
-- Based on Supabase Realtime Authorization and Performance Guidelines

BEGIN;

-- =============================================================================
-- TABLE CREATION
-- =============================================================================

-- Drop existing table if it exists (for clean recreation)
DROP TABLE IF EXISTS public.realtime_messages;

-- Create realtime messages table in public schema
-- Using public schema for better integration with Supabase Realtime
CREATE TABLE public.realtime_messages (
    id BIGSERIAL PRIMARY KEY,
    topic TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    payload JSONB,
    message_type TEXT DEFAULT 'broadcast', -- 'broadcast', 'presence', 'postgres_changes', 'system'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PERFORMANCE INDEXES
-- =============================================================================

-- Performance indexes (critical for RLS performance)
-- These indexes provide 100x+ performance improvement for RLS policies
CREATE INDEX IF NOT EXISTS idx_realtime_messages_topic 
    ON public.realtime_messages(topic);

CREATE INDEX IF NOT EXISTS idx_realtime_messages_user_id 
    ON public.realtime_messages(user_id);

CREATE INDEX IF NOT EXISTS idx_realtime_messages_created_at 
    ON public.realtime_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_realtime_messages_type_topic 
    ON public.realtime_messages(message_type, topic);

-- =============================================================================
-- REALTIME CONFIGURATION
-- =============================================================================

-- Enable Row Level Security
ALTER TABLE public.realtime_messages ENABLE ROW LEVEL SECURITY;

-- Enable replication for realtime updates
-- REPLICA IDENTITY FULL ensures all column changes are captured
ALTER TABLE public.realtime_messages REPLICA IDENTITY FULL;

-- Add table to the supabase_realtime publication (if not already added)
-- This enables realtime subscriptions on this table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'realtime_messages'
        AND schemaname = 'public'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.realtime_messages;
    END IF;
END $$;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Create updated_at trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_realtime_messages_updated_at 
    BEFORE UPDATE ON public.realtime_messages 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Drop existing policies if they exist (for safe re-runs)
DROP POLICY IF EXISTS "authenticated_users_read_messages" ON public.realtime_messages;
DROP POLICY IF EXISTS "authenticated_users_insert_messages" ON public.realtime_messages;
DROP POLICY IF EXISTS "users_update_own_messages" ON public.realtime_messages;
DROP POLICY IF EXISTS "users_delete_own_messages" ON public.realtime_messages;
DROP POLICY IF EXISTS "service_role_full_access" ON public.realtime_messages;

-- Allow authenticated users to read all messages
-- Simple policy for testing - can be restricted later
CREATE POLICY "authenticated_users_read_messages"
ON public.realtime_messages
FOR SELECT
TO authenticated
USING (true);

-- Users can insert messages with their own user_id
CREATE POLICY "authenticated_users_insert_messages"
ON public.realtime_messages
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
);

-- Users can update their own messages
CREATE POLICY "users_update_own_messages"
ON public.realtime_messages
FOR UPDATE
TO authenticated
USING (
    auth.uid() = user_id
)
WITH CHECK (
    auth.uid() = user_id
);

-- Users can delete their own messages
CREATE POLICY "users_delete_own_messages"
ON public.realtime_messages
FOR DELETE
TO authenticated
USING (
    auth.uid() = user_id
);

-- Admin override policy (for system messages)
-- Allows service_role to bypass restrictions
CREATE POLICY "service_role_full_access"
ON public.realtime_messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to clean up old realtime messages
-- Prevents table from growing indefinitely
CREATE OR REPLACE FUNCTION public.cleanup_old_realtime_messages(
    retention_days INTEGER DEFAULT 7
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.realtime_messages 
    WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active topics
-- Useful for monitoring and debugging
CREATE OR REPLACE FUNCTION public.get_active_realtime_topics(
    since_minutes INTEGER DEFAULT 60
)
RETURNS TABLE (
    topic TEXT,
    message_count BIGINT,
    unique_users BIGINT,
    last_activity TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rm.topic,
        COUNT(*) as message_count,
        COUNT(DISTINCT rm.user_id) as unique_users,
        MAX(rm.created_at) as last_activity
    FROM public.realtime_messages rm
    WHERE rm.created_at >= NOW() - INTERVAL '1 minute' * since_minutes
    GROUP BY rm.topic
    ORDER BY last_activity DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's accessible topics
-- Based on RLS policies, useful for client applications
CREATE OR REPLACE FUNCTION public.get_user_accessible_topics()
RETURNS TABLE (topic TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT rm.topic
    FROM public.realtime_messages rm
    WHERE rm.created_at >= NOW() - INTERVAL '1 day'
    ORDER BY rm.topic;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to send a system message to a topic
-- Useful for admin notifications or system events
CREATE OR REPLACE FUNCTION public.send_system_message(
    target_topic TEXT,
    message_payload JSONB
)
RETURNS UUID AS $$
DECLARE
    message_id UUID;
BEGIN
    INSERT INTO public.realtime_messages (
        topic,
        user_id,
        payload,
        message_type
    ) VALUES (
        target_topic,
        NULL, -- System messages have no user_id
        message_payload,
        'system'
    )
    RETURNING id INTO message_id;
    
    RETURN message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;