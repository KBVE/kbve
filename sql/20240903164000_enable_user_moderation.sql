-- NOT DONE!
-- Extension Check
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

CREATE TABLE user_moderation (
    ID UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    NOTES TEXT,
    WARNINGS TEXT,
    UPDATED_AT TIMESTAMP WITH TIME ZONE
);

ALTER TABLE user_moderation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only the user can view their own moderation record." ON user_moderation
    FOR SELECT
    USING ((SELECT auth.uid()) = ID);

CREATE TRIGGER handle_last_updated
    BEFORE UPDATE ON user_moderation
    FOR EACH ROW
    EXECUTE PROCEDURE moddatetime(updated_at);

-- inserts a row into public user moderation
CREATE FUNCTION public.handle_new_user_moderation_table()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Insert into user_moderation table
        INSERT INTO public.user_moderation (ID)
        VALUES (NEW.ID);

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

