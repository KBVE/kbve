-- Start the transaction
BEGIN;

-- 1. Create Kanban Boards Table
CREATE TABLE public.kanban_boards (
    board_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Unique identifier for each board
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE, -- Board owner
    name TEXT NOT NULL, -- Board name
    kanban_data JSONB DEFAULT '{}'::JSONB NOT NULL, -- Kanban items stored as JSON
    guest BOOLEAN DEFAULT FALSE NOT NULL, -- Determines if the board is accessible to anonymous users
    created_at TIMESTAMP DEFAULT NOW(), -- Timestamp of creation
    CONSTRAINT unique_board_name_per_user UNIQUE (user_id, name), -- Ensure unique board names per user
    CONSTRAINT valid_name_format CHECK (name ~ '^[a-zA-Z0-9 -]+$') -- Ensure name contains only a-z, A-Z, 0-9, spaces, and hyphens
);

-- Enable RLS for Kanban Boards
ALTER TABLE public.kanban_boards ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated and anon users to create boards
CREATE POLICY allow_all_create ON public.kanban_boards
TO authenticated, anon
FOR INSERT
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy: Allow authenticated and anon users to manage their boards if the board is marked as guest
CREATE POLICY allow_all_manage ON public.kanban_boards
TO authenticated, anon
FOR ALL
USING (
    (SELECT auth.uid()) = user_id OR 
    (guest = TRUE AND auth.role() = 'anon')
);

-- 2. Create Kanban Items Table
CREATE TABLE public.kanban_items (
    item_id SERIAL PRIMARY KEY, -- Unique identifier for each item
    board_id UUID NOT NULL REFERENCES public.kanban_boards (board_id) ON DELETE CASCADE, -- Associated board
    user_id UUID NOT NULL, -- User who created the item (guests and authenticated users have IDs)
    title TEXT NOT NULL CHECK (char_length(title) > 0), -- Title of the item (cannot be empty or null)
    description TEXT, -- Optional description
    status TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN-PROGRESS', 'DONE')), -- Item status
    created_at TIMESTAMP DEFAULT NOW(), -- Timestamp of creation
    CONSTRAINT valid_title_format CHECK (title ~ '^[a-zA-Z0-9 -]+$'), -- Title allows only a-z, A-Z, 0-9, spaces, and hyphens
    CONSTRAINT valid_description_format CHECK (description IS NULL OR description ~ '^[a-zA-Z0-9 .,!?-]*$') -- Description allows alphanumeric, punctuation, and spaces
);

-- Enable RLS for Kanban Items
ALTER TABLE public.kanban_items ENABLE ROW LEVEL SECURITY;

-- Helper Function for Access Control
CREATE OR REPLACE FUNCTION can_access_board(board_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.kanban_boards
        WHERE kanban_boards.board_id = board_id
        AND (
            guest = TRUE OR (SELECT auth.uid()) = kanban_boards.user_id
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Policies for Kanban Items
CREATE POLICY allow_all_insert ON public.kanban_items
TO authenticated, anon
FOR INSERT
WITH CHECK (
    (SELECT auth.uid()) = user_id AND can_access_board(board_id)
);

CREATE POLICY allow_all_select ON public.kanban_items
TO authenticated, anon
FOR SELECT
USING (
    (SELECT auth.uid()) = user_id OR can_access_board(board_id)
);

CREATE POLICY allow_all_update ON public.kanban_items
TO authenticated, anon
FOR UPDATE
USING (
    (SELECT auth.uid()) = user_id OR can_access_board(board_id)
)
WITH CHECK (
    (SELECT auth.uid()) = user_id OR can_access_board(board_id)
);

CREATE POLICY allow_all_delete ON public.kanban_items
TO authenticated, anon
FOR DELETE
USING (
    (SELECT auth.uid()) = user_id OR can_access_board(board_id)
);

-- Enforce RLS
ALTER TABLE public.kanban_items FORCE ROW LEVEL SECURITY;

-- 3. JSONB Trigger to Update Kanban Data
CREATE OR REPLACE FUNCTION update_kanban_data()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.kanban_boards
    SET kanban_data = jsonb_set(
        kanban_data,
        ARRAY[NEW.status],
        COALESCE(kanban_data->NEW.status, '[]'::JSONB) || to_jsonb(NEW)
    )
    WHERE board_id = NEW.board_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach Trigger to Kanban Items Table
CREATE TRIGGER trigger_update_kanban_data
AFTER INSERT OR UPDATE OR DELETE
ON public.kanban_items
FOR EACH ROW
EXECUTE FUNCTION update_kanban_data();

-- 4. JSONB Trigger for Validation
CREATE OR REPLACE FUNCTION validate_kanban_data()
RETURNS TRIGGER AS $$
DECLARE
    item JSONB;
BEGIN
    -- Validate all items in all statuses
    FOR item IN SELECT * FROM jsonb_array_elements(NEW.kanban_data->'TODO')
    UNION ALL SELECT * FROM jsonb_array_elements(NEW.kanban_data->'IN-PROGRESS')
    UNION ALL SELECT * FROM jsonb_array_elements(NEW.kanban_data->'DONE')
    LOOP
        -- Ensure required fields exist
        IF NOT (item ? 'id' AND item ? 'container') THEN
            RAISE EXCEPTION 'Invalid item: %', item;
        END IF;

        -- Validate field formats
        IF NOT (item->>'id' ~ '^[a-zA-Z0-9 -]+$') THEN
            RAISE EXCEPTION 'Invalid ID format: %', item->>'id';
        END IF;

        IF NOT (item->>'container' IN ('TODO', 'IN-PROGRESS', 'DONE')) THEN
            RAISE EXCEPTION 'Invalid container value: %', item->>'container';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach Validation Trigger
CREATE TRIGGER validate_kanban_data_trigger
BEFORE INSERT OR UPDATE
ON public.kanban_boards
FOR EACH ROW
EXECUTE FUNCTION validate_kanban_data();

-- Commit the transaction
COMMIT;
