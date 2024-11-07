BEGIN;

--  Drop older trigger and function
DROP TRIGGER IF EXISTS on_auth_new_card_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_user_card_update();

COMMIT;