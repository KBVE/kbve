BEGIN;

-- Drop the function and trigger for creating an empty user profile row on registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_profile();
DROP FUNCTION IF EXISTS public.create_user_profile(_username TEXT);

-- Function to create a user profile using the caller's UUID
CREATE OR REPLACE FUNCTION public.create_user_profile(_username TEXT)
    RETURNS TEXT AS $$
DECLARE
    _user_id UUID := auth.uid(); -- Automatically get the UUID of the caller
BEGIN

    -- Check if _user_id is NULL (i.e., the caller is not authenticated)
    IF _user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- Ensure the username is in lowercase
    _username := lower(_username);

    -- Validate the username
    IF _username IS NULL OR 
       char_length(_username) < 5 OR 
       char_length(_username) > 24 OR 
       NOT (_username ~ '^[a-z0-9_-]+$') THEN
        RAISE EXCEPTION 'invalid_username';
    END IF;

    -- Check if a profile for this user already exists with a set username
    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = _user_id AND username IS NOT NULL) THEN
        RAISE EXCEPTION 'profile_already_exists';
    END IF;

    -- Check if the username is already taken by another user
    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE username = _username) THEN
        RAISE EXCEPTION 'username_taken';
    END IF;

    -- Insert the profile with the username if it doesn't already exist
    INSERT INTO public.user_profiles (id, username)
    VALUES (_user_id, _username);

    -- Return the created username
    RETURN _username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



COMMIT;