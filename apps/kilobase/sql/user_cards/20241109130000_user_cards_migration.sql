BEGIN;

--  Drop older trigger and function
DROP TRIGGER IF EXISTS on_auth_new_card_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_user_card_update();
DROP FUNCTION IF EXISTS public.handle_new_user_card();
DROP TRIGGER IF EXISTS handle_user_card_update ON public.user_cards;

COMMIT;