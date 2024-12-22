-- Start the transaction
BEGIN;

-- 1. Create Kanban Boards Table
CREATE TABLE public.kanban_boards (
    board_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Unique identifier for each board
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE, -- Board owner
    name TEXT NOT NULL, -- Board name
    created_at TIMESTAMP DEFAULT NOW(), -- Timestamp of creation
    CONSTRAINT unique_board_name_per_user UNIQUE (user_id, name), -- Ensure unique board names per user
    CONSTRAINT valid_name_format CHECK (name ~ '^[a-zA-Z0-9 -]+$') -- Ensure name contains only a-z, A-Z, 0-9, spaces, and hyphens

);

-- Enable RLS for Kanban Boards
ALTER TABLE public.kanban_boards ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users can create boards
CREATE POLICY allow_authenticated_create ON public.kanban_boards
    FOR INSERT
    USING (auth.role() = 'authenticated');

-- Policy: Only the owner can manage their boards
CREATE POLICY allow_board_owner ON public.kanban_boards
    FOR ALL
    USING (auth.role() = 'authenticated' AND user_id = auth.uid());

-- 2. Create Kanban Items Table
CREATE TABLE public.kanban_items (
    item_id SERIAL PRIMARY KEY, -- Unique identifier for each item
    board_id UUID NOT NULL REFERENCES public.kanban_boards (board_id) ON DELETE CASCADE, -- Associated board
    user_id UUID, -- Optional: User who created the item (NULL for anonymous users)
    title TEXT NOT NULL CHECK (char_length(title) > 0), -- Title of the item (cannot be empty or null)
    description TEXT, -- Optional description
    status TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN-PROGRESS', 'DONE')), -- Item status
    created_at TIMESTAMP DEFAULT NOW(), -- Timestamp of creation
    CONSTRAINT valid_title_format CHECK (title ~ '^[a-zA-Z0-9 -]+$'), -- Title allows only a-z, A-Z, 0-9, spaces, and hyphens
    CONSTRAINT valid_description_format CHECK (description IS NULL OR description ~ '^[a-zA-Z0-9 .,!?-]*$') -- Description allows alphanumeric, punctuation, and spaces
);

-- Enable RLS for Kanban Items
ALTER TABLE public.kanban_items ENABLE ROW LEVEL SECURITY;

-- Add additional constraints for Kanban Items
-- Policy: Allow anyone to insert items
CREATE POLICY allow_anon_insert ON public.kanban_items
    FOR INSERT
    USING (true);

-- Policy: Allow anyone to view items
CREATE POLICY allow_anon_select ON public.kanban_items
    FOR SELECT
    USING (true);

-- Policy: Allow only the item owner or board owner to update items
CREATE POLICY allow_owner_update ON public.kanban_items
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM public.kanban_boards WHERE public.kanban_boards.board_id = public.kanban_items.board_id))
    );

-- Policy: Allow only the item owner or board owner to delete items
CREATE POLICY allow_owner_delete ON public.kanban_items
    FOR DELETE
    USING (
        auth.role() = 'authenticated' AND (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM public.kanban_boards WHERE public.kanban_boards.board_id = public.kanban_items.board_id))
    );

-- Enforce RLS
ALTER TABLE public.kanban_items FORCE ROW LEVEL SECURITY;


-- 3. Additional Indexes (Optional but Recommended)
CREATE INDEX idx_board_id ON public.kanban_items (board_id);
CREATE INDEX idx_user_id ON public.kanban_items (user_id);


-- Commit the transaction
COMMIT;
