-- Start the transaction
BEGIN;

-- 1. Create Kanban Boards Table
CREATE TABLE kanban_boards (
    board_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Unique identifier for each board
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE, -- Board owner
    name TEXT NOT NULL, -- Board name
    created_at TIMESTAMP DEFAULT NOW() -- Timestamp of creation
);

-- Enable RLS for Kanban Boards
ALTER TABLE kanban_boards ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users can create boards
CREATE POLICY allow_authenticated_create ON kanban_boards
    FOR INSERT
    USING (auth.role() = 'authenticated');

-- Policy: Only the owner can manage their boards
CREATE POLICY allow_board_owner ON kanban_boards
    FOR ALL
    USING (auth.role() = 'authenticated' AND user_id = auth.uid());

-- Enforce RLS
ALTER TABLE kanban_boards FORCE ROW LEVEL SECURITY;


-- 2. Create Kanban Items Table
CREATE TABLE kanban_items (
    item_id SERIAL PRIMARY KEY, -- Unique identifier for each item
    board_id UUID NOT NULL REFERENCES kanban_boards (board_id) ON DELETE CASCADE, -- Associated board
    user_id UUID, -- Optional: User who created the item (NULL for anonymous users)
    title TEXT NOT NULL, -- Title of the item
    description TEXT, -- Optional description
    status TEXT NOT NULL DEFAULT 'TODO', -- Item status (e.g., TODO, IN-PROGRESS, DONE)
    created_at TIMESTAMP DEFAULT NOW() -- Timestamp of creation
);

-- Enable RLS for Kanban Items
ALTER TABLE kanban_items ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to insert items
CREATE POLICY allow_anon_insert ON kanban_items
    FOR INSERT
    USING (true);

-- Policy: Allow anyone to view items
CREATE POLICY allow_anon_select ON kanban_items
    FOR SELECT
    USING (true);

-- Policy: Allow only the item owner or board owner to update items
CREATE POLICY allow_owner_update ON kanban_items
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM kanban_boards WHERE kanban_boards.board_id = kanban_items.board_id))
    );

-- Policy: Allow only the item owner or board owner to delete items
CREATE POLICY allow_owner_delete ON kanban_items
    FOR DELETE
    USING (
        auth.role() = 'authenticated' AND (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM kanban_boards WHERE kanban_boards.board_id = kanban_items.board_id))
    );

-- Enforce RLS
ALTER TABLE kanban_items FORCE ROW LEVEL SECURITY;


-- 3. Additional Indexes (Optional but Recommended)
CREATE INDEX idx_board_id ON kanban_items (board_id);
CREATE INDEX idx_user_id ON kanban_items (user_id);


-- Commit the transaction
COMMIT;
