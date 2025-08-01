BEGIN;

-- [START] - Setup user_cards table with reference to username and policies

-- Ensure the pg_jsonschema extension is enabled in the extensions schema
CREATE EXTENSION IF NOT EXISTS pg_jsonschema WITH SCHEMA extensions;

-- Create the table for public.user_cards with a username reference
CREATE TABLE IF NOT EXISTS public.user_cards (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    bio TEXT,
    socials JSONB, -- JSONB column to store social links (nullable)
    style JSONB, -- JSONB column to store profile style information (nullable)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT bio_length CHECK (char_length(bio) <= 255), -- Limit bio length to 255 characters
    CONSTRAINT bio_format CHECK (bio ~ '^[a-zA-Z0-9.!? ]*$'), -- Allow alphanumeric characters, spaces, and basic punctuation

    -- JSON Schema Constraint for socials (use extensions.jsonb_matches_schema)
    CONSTRAINT valid_socials CHECK (
        socials IS NULL OR extensions.jsonb_matches_schema(
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
    ),

    -- JSON Schema Constraint for style (use extensions.jsonb_matches_schema)
    CONSTRAINT valid_style CHECK (
        style IS NULL OR extensions.jsonb_matches_schema(
            '{
                "type": "object",
                "properties": {
                    "colors": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "pattern": "^#[A-Fa-f0-9]{8}$"
                        },
                        "maxItems": 10
                    },
                    "cover": {
                        "type": "string",
                        "pattern": "^[a-zA-Z0-9_-]+$"
                    },
                    "background": {
                        "type": "string",
                        "pattern": "^[a-zA-Z0-9_-]+$"
                    }
                },
                "additionalProperties": false
            }',
            style
        )
    )
);

-- Enable Row-Level Security for the table
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;

-- Policies
-- Allow authenticated users to insert their own user_card
DROP POLICY IF EXISTS "Users can insert their own user_card." ON public.user_cards;
CREATE POLICY "Users can insert their own user_card." ON public.user_cards
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = id);

-- Allow users to update their own user_card
DROP POLICY IF EXISTS "Users can update their own user_card." ON public.user_cards;
CREATE POLICY "Users can update their own user_card." ON public.user_cards
    FOR UPDATE USING ((SELECT auth.uid()) = id);

-- Restrict SELECT access on user_cards to only the user
DROP POLICY IF EXISTS "Users can view their own user_card." ON public.user_cards;
CREATE POLICY "Users can view their own user_card." ON public.user_cards
    FOR SELECT USING ((SELECT auth.uid()) = id);

-- Drop the existing triggers if they exist
DROP TRIGGER IF EXISTS handle_user_cards_update ON public.user_cards;

-- Create the moddatetime trigger to automatically update the updated_at field
CREATE TRIGGER handle_user_cards_update
    BEFORE UPDATE ON public.user_cards
    FOR EACH ROW
    EXECUTE PROCEDURE moddatetime(updated_at);

-- Create the function to handle new user_card creation and validation
CREATE OR REPLACE FUNCTION public.handle_new_user_card()
RETURNS TRIGGER AS $$
BEGIN
    -- Simplified version: Just insert a row into user_cards with NULL values
    INSERT INTO public.user_cards (id, bio, socials, style)
    VALUES (NEW.id, NULL, NULL, NULL);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Create the trigger to handle new user_card creation when a new user is created in public.user_profiles
DROP TRIGGER IF EXISTS on_auth_new_card_created ON auth.users;

CREATE TRIGGER on_auth_new_card_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_new_user_card();

-- Create the function to handle user_card updates and validation
CREATE OR REPLACE FUNCTION public.handle_user_card_update()
    RETURNS TRIGGER AS $$
DECLARE
    v_new_bio TEXT;
    v_new_socials JSONB;
    v_new_style JSONB;
BEGIN
    -- Assign variables for new bio, socials, and style
    v_new_bio := new.bio;
    v_new_socials := new.socials;
    v_new_style := new.style;

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
           NOT extensions.jsonb_matches_schema(
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

    -- Validate the new style JSON structure if it is being changed
    IF v_new_style IS DISTINCT FROM old.style THEN
        IF v_new_style IS NOT NULL AND
           NOT extensions.jsonb_matches_schema(
               '{
                   "type": "object",
                   "properties": {
                       "colors": {
                           "type": "array",
                           "items": {
                               "type": "string",
                               "pattern": "^#[A-Fa-f0-9]{8}$"
                           },
                           "maxItems": 10
                       },
                       "cover": {
                           "type": "string",
                           "pattern": "^[a-zA-Z0-9_-]+$"
                       },
                       "background": {
                           "type": "string",
                           "pattern": "^[a-zA-Z0-9_-]+$"
                       }
                   },
                   "additionalProperties": false
               }',
               v_new_style
           ) THEN
            RAISE EXCEPTION 'invalid_style';
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

DROP MATERIALIZED VIEW IF EXISTS public.user_cards_public;
-- Create a materialized view for public access without UUID
CREATE MATERIALIZED VIEW public.user_cards_public AS
SELECT
    up.username,
    uc.bio,
    uc.socials,
    uc.style,
    uc.created_at,
    uc.updated_at
FROM public.user_cards uc
JOIN public.user_profiles up ON uc.id = up.id;
-- Create an index on the materialized view after it has been populated.
CREATE INDEX IF NOT EXISTS idx_user_cards_username ON public.user_cards_public(username);

-- [END] - Setup user_cards table, policies, and materialized view

COMMIT;
