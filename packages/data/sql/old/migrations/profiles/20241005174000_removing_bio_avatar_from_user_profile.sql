BEGIN;

-- [START] - Modify User Profile Table and Policies

-- Drop columns bio and avatar_url if they exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'user_profiles'
        AND column_name = 'bio'
    ) THEN
        ALTER TABLE public.user_profiles
        DROP COLUMN bio;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'user_profiles'
        AND column_name = 'avatar_url'
    ) THEN
        ALTER TABLE public.user_profiles
        DROP COLUMN avatar_url;
    END IF;
END $$;

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Public user_profiles are viewable by everyone." ON public.user_profiles;

-- Create a new SELECT policy to allow only users to view their own profiles
CREATE POLICY "Users can view their own profiles." ON public.user_profiles
    FOR SELECT USING ((SELECT auth.uid()) = id);

-- Drop the existing UPDATE policy
DROP POLICY IF EXISTS "Users can update own profile." ON public.user_profiles;

-- Create a new UPDATE policy to allow only the supbase_admin role to update the profile
CREATE POLICY "Only supbase_admin can update profiles." ON public.user_profiles
    FOR UPDATE USING (current_setting('role') = 'supbase_admin');

-- Drop existing triggers and functions if they reference removed columns
DROP TRIGGER IF EXISTS handle_user_profile_update ON public.user_profiles;
DROP FUNCTION IF EXISTS public.handle_profile_update();

-- Create a new function to handle profile updates with the modified structure
CREATE OR REPLACE FUNCTION public.handle_profile_update()
    RETURNS TRIGGER AS $$
DECLARE
    v_new_username TEXT;
BEGIN
    -- Assign variables for new username
    v_new_username := new.username;

    -- Validate the new username if it is being changed
    IF v_new_username IS DISTINCT FROM old.username THEN
        IF v_new_username IS NULL OR 
           char_length(v_new_username) < 5 OR 
           char_length(v_new_username) > 24 OR 
           NOT (v_new_username ~ '^[a-zA-Z0-9_-]+$') THEN
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

-- Create a new trigger to use the modified function
CREATE TRIGGER handle_user_profile_update
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_profile_update();

-- Drop unnecessary triggers and functions
DROP TRIGGER IF EXISTS handle_avatar_url_update ON public.user_profiles;
DROP FUNCTION IF EXISTS public.handle_avatar_url_update();

-- Drop any remaining bio-related triggers and functions
DROP FUNCTION IF EXISTS public.handle_bio_update();
DROP TRIGGER IF EXISTS handle_bio_update ON public.user_profiles;

-- Recreate the moddatetime trigger if it was removed
DROP TRIGGER IF EXISTS handle_user_profiles_update ON public.user_profiles;
CREATE TRIGGER handle_user_profiles_update
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE PROCEDURE moddatetime(updated_at);

-- Drop and recreate the function and trigger for handling new user profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_profile();

-- Create a new function for handling new user profiles without avatar_url
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
    RETURNS TRIGGER AS $$
    DECLARE
        v_username TEXT;
    BEGIN
        -- Assign variables from user meta data
        v_username := new.raw_user_meta_data->>'username';

        -- Validate the username
        IF v_username IS NULL OR 
           char_length(v_username) < 5 OR 
           char_length(v_username) > 24 OR 
           NOT (v_username ~ '^[a-zA-Z0-9_-]+$') THEN
            RAISE EXCEPTION 'invalid_username';
        END IF;

        -- Validate unique username (for profile creation)
        IF EXISTS (SELECT 1 FROM public.user_profiles WHERE username = v_username) THEN
            RAISE EXCEPTION 'username_taken';
        END IF;

        -- Insert into user_profiles table
        BEGIN
            INSERT INTO public.user_profiles (id, username)
            VALUES (new.id, v_username);
        EXCEPTION WHEN unique_violation THEN
            RAISE EXCEPTION 'username_taken';
        END;

        RETURN new;
    END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger to execute the new function on new auth.user creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_new_user_profile();

-- [END] - Modify User Profile Table and Policies

COMMIT;
