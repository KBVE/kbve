BEGIN;
-- Failed to connect to the channel test: This may be due to restrictive RLS policies. Check your role and try again.
-- EXAMPLE PSQL FROM https://supabase.com/blog/supabase-realtime-broadcast-and-presence-authorization#create-rls-policies
CREATE POLICY "authenticated user listen to all"
ON "realtime"."messages"
AS permissive
FOR SELECT -- receive
TO authenticated
USING ( true );

CREATE POLICY "authenticated user write to all"
ON "realtime"."messages"
AS permissive
FOR INSERT -- send
TO authenticated
WITH CHECK ( true );


CREATE POLICY "authenticated users can only read from 'locked' topic"
ON "realtime"."messages"
AS permissive
FOR SELECT   -- read only
TO authenticated
USING (
  realtime.topic() = 'locked'  -- access the topic name
);

COMMIT;