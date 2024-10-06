BEGIN;

-- [START] - Setup user_cards table and policies

-- Ensure the pg_jsonschema extension is enabled in the extensions schema
CREATE EXTENSION IF NOT EXISTS pg_jsonschema WITH SCHEMA extensions;

-- Create the table for public.user_cards
CREATE TABLE IF NOT EXISTS public.user_cards (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    bio TEXT,
    socials JSONB NOT NULL, -- JSONB column to store social links
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT bio_length CHECK (char_length(bio) <= 255), -- Limit bio length to 255 characters
    CONSTRAINT bio_format CHECK (bio ~ '^[a-zA-Z0-9.!? ]*$'), -- Allow alphanumeric characters, spaces, and basic punctuation

    -- JSON Schema Constraint for socials (use extensions.json_matches_schema)
    CONSTRAINT valid_socials CHECK (
        extensions.json_matches_schema(
            '{
                "type": "object",
                "properties": {
                    "twitter": {
                        "type": "string",
                        "format": "uri",
                        "pattern": "^https://(www\\.)?twitter.com/[a-zA-Z0-9_]{1,15}/?$"
                    },
                    "github": {
                        "type": "string",
                        "format": "uri",
                        "pattern": "^https://(www\\.)?github.com/[a-zA-Z0-9_-]+/?$"
                    },
                    "linkedin": {
                        "type": "string",
                        "format": "uri",
                        "pattern": "^https://(www\\.)?linkedin.com/in/[a-zA-Z0-9_-]+/?$"
                    },
                    "website": {
                        "type": "string",
                        "format": "uri"
                    }
                },
                "additionalProperties": false,
                "required": []
            }',
            socials
        )
    )
);

-- Enable Row-Level Security for the table
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;

-- Policies
-- Allow everyone to view public user_cards
DROP POLICY IF EXISTS "Public user_cards are viewable by everyone." ON public.user_cards;
CREATE POLICY "Public user_cards are viewable by everyone." ON public.user_cards
    FOR SELECT USING (true);

-- Allow authenticated users to insert their own user_card
DROP POLICY IF EXISTS "Users can insert their own user_card." ON public.user_cards;
CREATE POLICY "Users can insert their own user_card." ON public.user_cards
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = id);

-- Allow users to update their own user_card
DROP POLICY IF EXISTS "Users can update their own user_card." ON public.user_cards;
CREATE POLICY "Users can update their own user_card." ON public.user_cards
    FOR UPDATE USING ((SELECT auth.uid()) = id);

-- Drop the existing triggers if they exist
DROP TRIGGER IF EXISTS handle_user_cards_update ON public.user_cards;

-- Create the moddatetime trigger to automatically update the updated_at field
CREATE TRIGGER handle_user_cards_update
    BEFORE UPDATE ON public.user_cards
    FOR EACH ROW
    EXECUTE PROCEDURE moddatetime(updated_at);

-- Create a function to handle new user_card creation and validation
CREATE OR REPLACE FUNCTION public.handle_new_user_card()
    RETURNS TRIGGER AS $$
DECLARE
    v_bio TEXT;
    v_socials JSONB;
BEGIN
    -- Assign variables from user metadata
    v_bio := new.raw_user_meta_data->>'bio';
    v_socials := new.raw_user_meta_data->>'socials'::jsonb;

    -- Validate bio (if applicable)
    IF v_bio IS NOT NULL AND
       (char_length(v_bio) > 255 OR
        NOT (v_bio ~ '^[a-zA-Z0-9.!? ]*$')) THEN
        RAISE EXCEPTION 'invalid_bio';
    END IF;

    -- Validate the socials JSON structure if it is not null
    IF v_socials IS NOT NULL AND
       NOT extensions.json_matches_schema(
           '{
               "type": "object",
               "properties": {
                   "twitter": {
                       "type": "string",
                       "format": "uri",
                       "pattern": "^https://(www\\.)?twitter.com/[a-zA-Z0-9_]{1,15}/?$"
                   },
                   "github": {
                       "type": "string",
                       "format": "uri",
                       "pattern": "^https://(www\\.)?github.com/[a-zA-Z0-9_-]+/?$"
                   },
                   "linkedin": {
                       "type": "string",
                       "format": "uri",
                       "pattern": "^https://(www\\.)?linkedin.com/in/[a-zA-Z0-9_-]+/?$"
                   },
                   "website": {
                       "type": "string",
                       "format": "uri"
                   }
               },
               "additionalProperties": false,
               "required": []
           }',
           v_socials
       ) THEN
        RAISE EXCEPTION 'invalid_socials';
    END IF;

    -- Insert into user_cards table
    INSERT INTO public.user_cards (id, bio, socials)
    VALUES (
        new.id,
        v_bio,
        COALESCE(v_socials, '{}')
    );

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger to handle new user_card creation when a new user is created in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_new_user_card();

-- Create a function to handle user_card updates and validation
CREATE OR REPLACE FUNCTION public.handle_user_card_update()
    RETURNS TRIGGER AS $$
DECLARE
    v_new_bio TEXT;
    v_new_socials JSONB;
BEGIN
    -- Assign variables for new bio and socials
    v_new_bio := new.bio;
    v_new_socials := new.socials;

    -- Validate the new bio if it is being changed
    IF v_new_bio IS DISTINCT FROM old.bio THEN
        IF v_new_bio IS NOT NULL AND
           (char_length(v_new_bio) > 255 OR
            NOT (v_new_bio ~ '^[a-zA-Z0-9.!? ]*$')) THEN
            RAISE EXCEPTION 'invalid_bio';
        END IF;
    END IF;

    -- Validate the new socials JSON structure if it is being changed
    IF v_new_socials IS DISTINCT FROM old.socials THEN
        IF v_new_socials IS NOT NULL AND
           NOT extensions.json_matches_schema(
               '{
                   "type": "object",
                   "properties": {
                       "twitter": {
                           "type": "string",
                           "format": "uri",
                           "pattern": "^https://(www\\.)?twitter.com/[a-zA-Z0-9_]{1,15}/?$"
                       },
                       "github": {
                           "type": "string",
                           "format": "uri",
                           "pattern": "^https://(www\\.)?github.com/[a-zA-Z0-9_-]+/?$"
                       },
                       "linkedin": {
                           "type": "string",
                           "format": "uri",
                           "pattern": "^https://(www\\.)?linkedin.com/in/[a-zA-Z0-9_-]+/?$"
                       },
                       "website": {
                           "type": "string",
                           "format": "uri"
                       }
                   },
                   "additionalProperties": false,
                   "required": []
               }',
               v_new_socials
           ) THEN
            RAISE EXCEPTION 'invalid_socials';
        END IF;
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create or replace the trigger to handle user_card updates
DROP TRIGGER IF EXISTS handle_user_card_update ON public.user_cards;
CREATE TRIGGER handle_user_card_update
    BEFORE UPDATE ON public.user_cards
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_user_card_update();

-- [END] - Setup user_cards table and policies

COMMIT;
