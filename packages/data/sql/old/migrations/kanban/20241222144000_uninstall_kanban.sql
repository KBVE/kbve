-- Start the transaction
BEGIN;

-- Remove RLS policies from kanban_items
DROP POLICY IF EXISTS allow_all_select_items ON public.kanban_items;
DROP POLICY IF EXISTS allow_all_insert_items ON public.kanban_items;
DROP POLICY IF EXISTS allow_all_update_items ON public.kanban_items;
DROP POLICY IF EXISTS allow_all_delete_items ON public.kanban_items;

-- Remove RLS policies from kanban_boards
DROP POLICY IF EXISTS allow_all_select_boards ON public.kanban_boards;
DROP POLICY IF EXISTS allow_all_insert_boards ON public.kanban_boards;
DROP POLICY IF EXISTS allow_all_update_boards ON public.kanban_boards;
DROP POLICY IF EXISTS allow_all_delete_boards ON public.kanban_boards;

-- Disable RLS on tables
ALTER TABLE public.kanban_boards DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_items DISABLE ROW LEVEL SECURITY;

-- Drop the access control helper function with CASCADE
DROP FUNCTION IF EXISTS can_access_board CASCADE;

-- Drop the validation trigger on the kanban_boards table
DROP TRIGGER IF EXISTS validate_kanban_data_trigger ON public.kanban_boards;

-- Drop the validation function for kanban_boards JSONB data
DROP FUNCTION IF EXISTS validate_kanban_data;

-- Drop the update trigger on the kanban_items table
DROP TRIGGER IF EXISTS trigger_update_kanban_data ON public.kanban_items;

-- Drop the update function for kanban_boards JSONB data
DROP FUNCTION IF EXISTS update_kanban_data;

-- Drop tables
DROP TABLE IF EXISTS public.kanban_items CASCADE;
DROP TABLE IF EXISTS public.kanban_boards CASCADE;

-- Commit the transaction
COMMIT;
