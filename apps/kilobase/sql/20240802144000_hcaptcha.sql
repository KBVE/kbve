--- Create table for registration failures.
CREATE TABLE IF NOT EXISTS public.registration_failed_verification_attempts (
  user_email TEXT NOT NULL,
  last_failed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_email)
);

--- Row Level Security
ALTER TABLE public.registration_failed_verification_attempts ENABLE ROW LEVEL SECURITY;

-- Policy to allow all users to see their own rows
CREATE POLICY "Allow row owner to view" 
ON public.registration_failed_verification_attempts
USING (current_setting('request.jwt.claims.email') = user_email);

-- Policy to allow only authenticated users to insert their own email in the table
CREATE POLICY "Allow insert if user_email matches"
ON public.registration_failed_verification_attempts
FOR INSERT
WITH CHECK (current_setting('request.jwt.claims.email') = user_email);

-- Policy to allow admin role to view all rows
CREATE POLICY "Allow admin to view all rows"
ON public.registration_failed_verification_attempts
USING (current_setting('role') = 'supabase_auth_admin');

-- Policy to allow admin to insert any email
CREATE POLICY "Allow admin to insert any email"
ON public.registration_failed_verification_attempts
FOR INSERT
WITH CHECK (current_setting('role') = 'supabase_auth_admin');

-- Constraint on emails that are being added.
ALTER TABLE public.registration_failed_verification_attempts
ADD CONSTRAINT valid_email_format CHECK (
  user_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' AND
  char_length(user_email) < 32
);

-- Hook Function