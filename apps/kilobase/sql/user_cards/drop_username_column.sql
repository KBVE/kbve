BEGIN;

DROP MATERIALIZED VIEW IF EXISTS public.user_cards_public;
ALTER TABLE public.user_cards
DROP COLUMN IF EXISTS username;

COMMIT;