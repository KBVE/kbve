--- Create table for registration failures.
CREATE TABLE IF NOT EXISTS public.registration_failed_verification_attempts (
  user_email TEXT NOT NULL,
  last_failed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_email)
);

--- Row Level Security
ALTER TABLE public.registration_failed_verification_attempts ENABLE ROW LEVEL SECURITY;

-- Policy to allow only users with the role 'supabase_auth_admin' to access the table
CREATE POLICY "Allow supabase_auth_admin access" 
ON public.registration_failed_verification_attempts
USING (current_setting('role') = 'supabase_auth_admin');

-- Policy to allow the row owner (based on user_email) to view their own failed attempts
CREATE POLICY "Allow row owner access"
ON public.registration_failed_verification_attempts
USING (current_setting('request.jwt.claims.email') = user_email);

-- Policy to allow 'supabase_auth_admin' role to insert failed attempts
CREATE POLICY "Allow supabase_auth_admin insert"
ON public.registration_failed_verification_attempts
FOR INSERT
USING (current_setting('role') = 'supabase_auth_admin');