DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'user_cards_public') THEN
        REFRESH MATERIALIZED VIEW public.user_cards_public;
    END IF;
END $$;
