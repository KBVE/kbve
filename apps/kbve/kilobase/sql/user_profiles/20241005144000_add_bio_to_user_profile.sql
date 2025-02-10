BEGIN;

-- Check if the 'bio' column exists in the 'user_profiles' table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'user_profiles'
        AND column_name = 'bio'
    ) THEN
        -- Add the 'bio' column to the 'user_profiles' table
        ALTER TABLE public.user_profiles
        ADD COLUMN bio TEXT;

        -- Add constraints for the new 'bio' column
        ALTER TABLE public.user_profiles
        ADD CONSTRAINT bio_length CHECK (char_length(bio) <= 255);

        ALTER TABLE public.user_profiles
        ADD CONSTRAINT bio_format CHECK (bio ~ '^[a-zA-Z0-9.!? ]*$');
    END IF;
END $$;

-- Recreate triggers and functions to include the bio field (if not already defined)

-- Create or replace the function for handling profile updates and validation
CREATE OR REPLACE FUNCTION public.handle_profile_update()
    RETURNS TRIGGER AS $$
DECLARE
    v_new_username TEXT;
    v_new_bio TEXT;
BEGIN
    -- Assign variables for new username and bio
    v_new_username := new.username;
    v_new_bio := new.bio;

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

    -- Validate the new bio if it is being changed
    IF v_new_bio IS DISTINCT FROM old.bio THEN
        IF v_new_bio IS NOT NULL AND
           (char_length(v_new_bio) > 255 OR 
            NOT (v_new_bio ~ '^[a-zA-Z0-9.!? ]*$')) THEN
            RAISE EXCEPTION 'invalid_bio';
        END IF;
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate the trigger for handling profile updates to include bio field validation
DROP TRIGGER IF EXISTS handle_user_profile_update ON public.user_profiles;
CREATE TRIGGER handle_user_profile_update
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_profile_update();

COMMIT;
