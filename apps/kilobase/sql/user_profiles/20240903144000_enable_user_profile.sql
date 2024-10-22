BEGIN;
-- [START] - User Profile
-- Extensions Check
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- Create a table for public.user_profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    username TEXT UNIQUE,

    -- Constraints for username
    CONSTRAINT username_length CHECK (char_length(username) >= 5 AND char_length(username) <= 24),
    CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_-]+$')
);

ALTER TABLE public.user_profiles
    ENABLE ROW LEVEL SECURITY;

-- Policy Management

DROP POLICY IF EXISTS "Public user_profiles are viewable by everyone." ON public.user_profiles;
-- CREATE POLICY "Public user_profiles are viewable by everyone." ON public.user_profiles
--     FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view limited user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view their own profile." on public.user_profiles;

CREATE POLICY "Users can view their own profile." ON public.user_profiles
    FOR SELECT USING ((select auth.uid()) = id);
    
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.user_profiles;
CREATE POLICY "Users can insert their own profile." ON public.user_profiles
    FOR INSERT WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile." ON public.user_profiles;
CREATE POLICY "Users can update own profile." ON public.user_profiles
    FOR UPDATE USING ((select auth.uid()) = id);

-- Drop the existing trigger if it exists
DROP TRIGGER IF EXISTS handle_user_profiles_update ON public.user_profiles;

-- Create the handler user profile update trigger again
CREATE TRIGGER handle_user_profiles_update
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE PROCEDURE moddatetime(updated_at);

-- Function to handle new user creation and validation
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
    RETURNS TRIGGER AS $$
    DECLARE
        v_username TEXT;
    BEGIN
        -- Assign variables from user meta data
        v_username := lower(new.raw_user_meta_data->>'username'); -- Convert username to lowercase

        -- Validate the username
        IF v_username IS NULL OR 
        char_length(v_username) < 5 OR 
        char_length(v_username) > 24 OR 
        NOT (v_username ~ '^[a-z0-9_-]+$') THEN
            RAISE EXCEPTION 'invalid_username';
        END IF;

        -- Validate unique username (for profile creation)
        IF EXISTS (SELECT 1 FROM public.user_profiles WHERE username = v_username) THEN
            RAISE EXCEPTION 'username_taken';
        END IF;

        -- Insert into user_profiles table
        BEGIN
            INSERT INTO public.user_profiles (id, username)
            VALUES (
                new.id,
                v_username
            );
        EXCEPTION WHEN unique_violation THEN
            RAISE EXCEPTION 'username_taken';
        END;

        RETURN new;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Trigger the function every time a user is created
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_profile();

-- Function to handle profile updates and validation
CREATE OR REPLACE FUNCTION public.handle_profile_update()
    RETURNS TRIGGER AS $$
DECLARE
    v_new_username TEXT;
BEGIN
    -- Assign variables for new username
    v_new_username := lower(new.username); -- Ensure lowercase for uniqueness check

    -- Validate the new username if it is being changed
    IF v_new_username IS DISTINCT FROM lower(old.username) THEN
        IF v_new_username IS NULL OR 
           char_length(v_new_username) < 5 OR 
           char_length(v_new_username) > 24 OR 
           NOT (v_new_username ~ '^[a-z0-9_-]+$') THEN
            RAISE EXCEPTION 'invalid_username';
        END IF;

        -- Check if the new username is already taken by another user
        IF EXISTS (SELECT 1 FROM public.user_profiles WHERE username = v_new_username AND id <> old.id) THEN
            RAISE EXCEPTION 'username_taken';
        END IF;
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create or replace the trigger for handling profile updates
DROP TRIGGER IF EXISTS handle_user_profile_update ON public.user_profiles;
CREATE TRIGGER handle_user_profile_update
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_profile_update();

-- [END of Profile]
COMMIT;
