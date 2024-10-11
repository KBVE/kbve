BEGIN;
-- [Start of Hcaptcha.sql]
-- [GO TRUE -> SO SKIP THIS SQL.]
--- Extensions Check
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

--- Create table for registration failures.
CREATE TABLE IF NOT EXISTS public.registration_failed_verification_attempts (
  user_email TEXT NOT NULL,
  last_failed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_email)
);

--- Row Level Security
ALTER TABLE public.registration_failed_verification_attempts ENABLE ROW LEVEL SECURITY;


-- Constraint on emails that are being added.
ALTER TABLE public.registration_failed_verification_attempts
DROP CONSTRAINT IF EXISTS valid_email_format;

ALTER TABLE public.registration_failed_verification_attempts
ADD CONSTRAINT valid_email_format CHECK (
  user_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' AND
  char_length(user_email) < 32
);


-- Policy to allow all users to see their own rows
--- Drop Check
DROP POLICY IF EXISTS "Allow row owner to view" ON public.registration_failed_verification_attempts;

CREATE POLICY "Allow row owner to view" 
ON public.registration_failed_verification_attempts
USING (current_setting('request.jwt.claims.email') = user_email);

-- Policy to allow only authenticated users to insert their own email in the table
DROP POLICY IF EXISTS "Allow insert if user_email matches" ON public.registration_failed_verification_attempts;
CREATE POLICY "Allow insert if user_email matches"
ON public.registration_failed_verification_attempts
FOR INSERT
WITH CHECK (current_setting('request.jwt.claims.email') = user_email);

-- Policy to allow admin role to view all rows
DROP POLICY IF EXISTS "Allow admin to view all rows" ON public.registration_failed_verification_attempts;
CREATE POLICY "Allow admin to view all rows"
ON public.registration_failed_verification_attempts
USING (current_setting('role') = 'supabase_auth_admin');

-- Policy to allow admin to insert any email
DROP POLICY IF EXISTS "Allow admin to insert any email" ON public.registration_failed_verification_attempts;
CREATE POLICY "Allow admin to insert any email"
ON public.registration_failed_verification_attempts
FOR INSERT
WITH CHECK (current_setting('role') = 'supabase_auth_admin');

-- Create Hcaptcha Hook Function
CREATE OR REPLACE FUNCTION public.hook_hcaptcha_verification(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    hcaptcha_token TEXT;
    hcaptcha_secret_key TEXT := 'YOUR_HCAPTCHA_SECRET_KEY'; -- Replace with your hCaptcha secret key
    verification_response JSONB;
    verification_success BOOLEAN;
    last_failed_at TIMESTAMP;
BEGIN
    -- Attempt to extract the hCaptcha token from the top-level event JSON
    hcaptcha_token := event->>'hcaptcha_token';

    -- If the token is not found at the top level, look for it in options->data->token
    IF hcaptcha_token IS NULL OR hcaptcha_token = '' THEN
        hcaptcha_token := event->'options'->'data'->>'token';
    END IF;

    -- If there is still no hCaptcha token, reject the registration
    IF hcaptcha_token IS NULL OR hcaptcha_token = '' THEN
        RETURN jsonb_build_object(
            'error', jsonb_build_object(
                'http_code', 400,
                'message',   'Missing hCaptcha token in both event and options.data fields.'
            )
        );
    END IF;

    -- Make a request to the hCaptcha API to verify the token using pg_net
    SELECT pg_net.post(
        'https://api.hcaptcha.com/siteverify',
        headers := '{"Content-Type": "application/x-www-form-urlencoded"}',
        body := format('secret=%s&response=%s', hcaptcha_secret_key, hcaptcha_token)
    )::JSONB INTO verification_response;

    -- Check the verification response
    verification_success := (verification_response->>'success')::BOOLEAN;

    -- If verification fails, log the attempt and reject the registration
    IF NOT verification_success THEN
        -- Optional: Insert failed attempt into the log table
        INSERT INTO public.registration_failed_verification_attempts (user_email, last_failed_at)
        VALUES (event->>'user_email', now())
        ON CONFLICT (user_email)
        DO UPDATE SET last_failed_at = now();

        RETURN jsonb_build_object(
            'error', jsonb_build_object(
                'http_code', 400,
                'message',   'hCaptcha verification failed. Please try again.'
            )
        );
    END IF;

    -- If verification succeeds, allow the registration to continue
    RETURN jsonb_build_object('decision', 'continue');
END;
$$;

-- Permissions for HCaptcha Hook
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.hook_hcaptcha_verification TO supabase_auth_admin;
REVOKE ALL ON FUNCTION public.hook_hcaptcha_verification FROM authenticated, anon, public;

GRANT INSERT, SELECT, UPDATE ON TABLE public.registration_failed_verification_attempts TO supabase_auth_admin;
REVOKE ALL ON TABLE public.registration_failed_verification_attempts FROM authenticated, anon, public;

-- Trigger Hook

CREATE OR REPLACE FUNCTION public.before_insert_hcaptcha_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    hcaptcha_token TEXT;
    hcaptcha_secret_key TEXT := 'YOUR_HCAPTCHA_SECRET_KEY'; -- Replace with your hCaptcha secret key
    verification_response JSONB;
    verification_success BOOLEAN;
BEGIN
    -- Extract the hCaptcha token from the `raw_user_meta_data` field
    -- Assuming the `raw_user_meta_data` has a field named `token` where the hCaptcha token is stored
    hcaptcha_token := NEW.raw_user_meta_data->>'token';

    -- If there is no hCaptcha token, reject the registration
    IF hcaptcha_token IS NULL OR hcaptcha_token = '' THEN
        RAISE EXCEPTION 'Missing hCaptcha token in user metadata. Registration rejected.';
    END IF;

    -- Make a request to the hCaptcha API to verify the token using pg_net
    SELECT pg_net.post(
        'https://api.hcaptcha.com/siteverify',
        headers := '{"Content-Type": "application/x-www-form-urlencoded"}',
        body := format('secret=%s&response=%s', hcaptcha_secret_key, hcaptcha_token)
    )::JSONB INTO verification_response;

    -- Check the verification response
    verification_success := (verification_response->>'success')::BOOLEAN;

    -- If verification fails, log the attempt and reject the registration
    IF NOT verification_success THEN
        RAISE EXCEPTION 'hCaptcha verification failed. Registration rejected.';
    END IF;

    -- If verification succeeds, allow the registration to continue
    RETURN NEW;
END;
$$;

-- Trigger for Auth
DROP TRIGGER IF EXISTS before_insert_hcaptcha ON auth.users;
CREATE TRIGGER before_insert_hcaptcha
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.before_insert_hcaptcha_verification();

-- [END of Hcaptcha.sql]
COMMIT;