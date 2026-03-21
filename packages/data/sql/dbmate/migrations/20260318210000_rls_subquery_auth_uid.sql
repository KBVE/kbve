-- migrate:up
-- ============================================================
-- RLS Performance: auth.uid() → (select auth.uid())
--
-- Wrapping auth.uid() in a subquery forces PostgreSQL to evaluate
-- it once per query instead of once per row, reducing overhead
-- from seconds to microseconds on large tables.
--
-- Ref: https://github.com/KBVE/kbve/issues/7761
-- ============================================================

-- ===========================================
-- MEME SCHEMA — meme.memes (4 policies)
-- ===========================================

ALTER POLICY "authenticated_select_published_and_own" ON meme.memes
    USING (status = 3 OR author_id = (select auth.uid()));

ALTER POLICY "authenticated_insert_own" ON meme.memes
    WITH CHECK (author_id = (select auth.uid()) AND status = 1);

ALTER POLICY "authenticated_update_own" ON meme.memes
    USING (author_id = (select auth.uid()));

ALTER POLICY "authenticated_update_own" ON meme.memes
    WITH CHECK (author_id = (select auth.uid()));

-- ===========================================
-- MEME SCHEMA — meme.meme_reactions (4 policies)
-- ===========================================

ALTER POLICY "authenticated_insert_own_reaction" ON meme.meme_reactions
    WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "authenticated_update_own_reaction" ON meme.meme_reactions
    USING (user_id = (select auth.uid()));

ALTER POLICY "authenticated_update_own_reaction" ON meme.meme_reactions
    WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "authenticated_delete_own_reaction" ON meme.meme_reactions
    USING (user_id = (select auth.uid()));

-- ===========================================
-- MEME SCHEMA — meme.meme_comments (4 policies)
-- ===========================================

ALTER POLICY "authenticated_insert_own_comment" ON meme.meme_comments
    WITH CHECK (author_id = (select auth.uid()));

ALTER POLICY "authenticated_update_own_comment" ON meme.meme_comments
    USING (author_id = (select auth.uid()));

ALTER POLICY "authenticated_update_own_comment" ON meme.meme_comments
    WITH CHECK (author_id = (select auth.uid()));

ALTER POLICY "authenticated_delete_own_comment" ON meme.meme_comments
    USING (author_id = (select auth.uid()));

-- ===========================================
-- MEME SCHEMA — meme.meme_decks (5 policy clauses)
-- ===========================================

ALTER POLICY "authenticated_select_own_decks" ON meme.meme_decks
    USING (owner_id = (select auth.uid()));

ALTER POLICY "authenticated_insert_own_deck" ON meme.meme_decks
    WITH CHECK (owner_id = (select auth.uid()));

ALTER POLICY "authenticated_update_own_deck" ON meme.meme_decks
    USING (owner_id = (select auth.uid()));

ALTER POLICY "authenticated_update_own_deck" ON meme.meme_decks
    WITH CHECK (owner_id = (select auth.uid()));

ALTER POLICY "authenticated_delete_own_deck" ON meme.meme_decks
    USING (owner_id = (select auth.uid()));

-- ===========================================
-- MEME SCHEMA — meme.meme_deck_cards (3 policies)
-- ===========================================

ALTER POLICY "authenticated_select_own_deck_cards" ON meme.meme_deck_cards
    USING (EXISTS (
        SELECT 1 FROM meme.meme_decks d
        WHERE d.id = deck_id AND d.owner_id = (select auth.uid())
    ));

ALTER POLICY "authenticated_insert_own_deck_cards" ON meme.meme_deck_cards
    WITH CHECK (EXISTS (
        SELECT 1 FROM meme.meme_decks d
        WHERE d.id = deck_id AND d.owner_id = (select auth.uid())
    ));

ALTER POLICY "authenticated_delete_own_deck_cards" ON meme.meme_deck_cards
    USING (EXISTS (
        SELECT 1 FROM meme.meme_decks d
        WHERE d.id = deck_id AND d.owner_id = (select auth.uid())
    ));

-- ===========================================
-- MEME SCHEMA — meme.battle_results (1 policy)
-- ===========================================

ALTER POLICY "authenticated_select_own_battles" ON meme.battle_results
    USING (player_a_id = (select auth.uid()) OR player_b_id = (select auth.uid()));

-- ===========================================
-- MEME SCHEMA — meme.meme_user_profiles (1 policy, 2 clauses)
-- ===========================================

ALTER POLICY "authenticated_update_own_profile" ON meme.meme_user_profiles
    USING (user_id = (select auth.uid()));

ALTER POLICY "authenticated_update_own_profile" ON meme.meme_user_profiles
    WITH CHECK (user_id = (select auth.uid()));

-- ===========================================
-- MEME SCHEMA — meme.meme_follows (2 policies)
-- ===========================================

ALTER POLICY "authenticated_insert_own_follow" ON meme.meme_follows
    WITH CHECK (follower_id = (select auth.uid()));

ALTER POLICY "authenticated_delete_own_follow" ON meme.meme_follows
    USING (follower_id = (select auth.uid()));

-- ===========================================
-- MEME SCHEMA — meme.meme_collections (4 policies, 6 clauses)
-- ===========================================

ALTER POLICY "authenticated_select_public_and_own" ON meme.meme_collections
    USING (is_public = true OR owner_id = (select auth.uid()));

ALTER POLICY "authenticated_insert_own_collection" ON meme.meme_collections
    WITH CHECK (owner_id = (select auth.uid()));

ALTER POLICY "authenticated_update_own_collection" ON meme.meme_collections
    USING (owner_id = (select auth.uid()));

ALTER POLICY "authenticated_update_own_collection" ON meme.meme_collections
    WITH CHECK (owner_id = (select auth.uid()));

ALTER POLICY "authenticated_delete_own_collection" ON meme.meme_collections
    USING (owner_id = (select auth.uid()));

-- ===========================================
-- MEME SCHEMA — meme.meme_saves (3 policies)
-- ===========================================

ALTER POLICY "authenticated_select_own_saves" ON meme.meme_saves
    USING (user_id = (select auth.uid()));

ALTER POLICY "authenticated_insert_own_save" ON meme.meme_saves
    WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "authenticated_delete_own_save" ON meme.meme_saves
    USING (user_id = (select auth.uid()));

-- ===========================================
-- MEME SCHEMA — meme.meme_reports (2 policies)
-- ===========================================

ALTER POLICY "authenticated_insert_own_report" ON meme.meme_reports
    WITH CHECK (reporter_id = (select auth.uid()));

ALTER POLICY "authenticated_select_own_reports" ON meme.meme_reports
    USING (reporter_id = (select auth.uid()));

-- ===========================================
-- DISCORDSH — discordsh.servers (1 policy)
-- ===========================================

ALTER POLICY "authenticated_select_active_and_own" ON discordsh.servers
    USING (status = 1 OR owner_id = (select auth.uid()));

-- ===========================================
-- REALTIME — public.realtime_messages (3 policies)
-- Wrapped in DO block: table only exists in Supabase-managed environments,
-- not in local dev/test postgres.
-- ===========================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'realtime_messages'
    ) THEN
        EXECUTE 'ALTER POLICY "authenticated_users_insert_messages" ON public.realtime_messages
            WITH CHECK ((select auth.uid()) = user_id)';
        EXECUTE 'ALTER POLICY "users_update_own_messages" ON public.realtime_messages
            USING ((select auth.uid()) = user_id)';
        EXECUTE 'ALTER POLICY "users_update_own_messages" ON public.realtime_messages
            WITH CHECK ((select auth.uid()) = user_id)';
        EXECUTE 'ALTER POLICY "users_delete_own_messages" ON public.realtime_messages
            USING ((select auth.uid()) = user_id)';
        RAISE NOTICE 'realtime_messages: 4 policy clauses updated';
    ELSE
        RAISE NOTICE 'realtime_messages: table not found (local env), skipping';
    END IF;
END $$;

-- migrate:down
-- Revert all policies back to bare auth.uid() calls

-- meme.memes
ALTER POLICY "authenticated_select_published_and_own" ON meme.memes
    USING (status = 3 OR author_id = auth.uid());
ALTER POLICY "authenticated_insert_own" ON meme.memes
    WITH CHECK (author_id = auth.uid() AND status = 1);
ALTER POLICY "authenticated_update_own" ON meme.memes
    USING (author_id = auth.uid());
ALTER POLICY "authenticated_update_own" ON meme.memes
    WITH CHECK (author_id = auth.uid());

-- meme.meme_reactions
ALTER POLICY "authenticated_insert_own_reaction" ON meme.meme_reactions
    WITH CHECK (user_id = auth.uid());
ALTER POLICY "authenticated_update_own_reaction" ON meme.meme_reactions
    USING (user_id = auth.uid());
ALTER POLICY "authenticated_update_own_reaction" ON meme.meme_reactions
    WITH CHECK (user_id = auth.uid());
ALTER POLICY "authenticated_delete_own_reaction" ON meme.meme_reactions
    USING (user_id = auth.uid());

-- meme.meme_comments
ALTER POLICY "authenticated_insert_own_comment" ON meme.meme_comments
    WITH CHECK (author_id = auth.uid());
ALTER POLICY "authenticated_update_own_comment" ON meme.meme_comments
    USING (author_id = auth.uid());
ALTER POLICY "authenticated_update_own_comment" ON meme.meme_comments
    WITH CHECK (author_id = auth.uid());
ALTER POLICY "authenticated_delete_own_comment" ON meme.meme_comments
    USING (author_id = auth.uid());

-- meme.meme_decks
ALTER POLICY "authenticated_select_own_decks" ON meme.meme_decks
    USING (owner_id = auth.uid());
ALTER POLICY "authenticated_insert_own_deck" ON meme.meme_decks
    WITH CHECK (owner_id = auth.uid());
ALTER POLICY "authenticated_update_own_deck" ON meme.meme_decks
    USING (owner_id = auth.uid());
ALTER POLICY "authenticated_update_own_deck" ON meme.meme_decks
    WITH CHECK (owner_id = auth.uid());
ALTER POLICY "authenticated_delete_own_deck" ON meme.meme_decks
    USING (owner_id = auth.uid());

-- meme.meme_deck_cards
ALTER POLICY "authenticated_select_own_deck_cards" ON meme.meme_deck_cards
    USING (EXISTS (
        SELECT 1 FROM meme.meme_decks d
        WHERE d.id = deck_id AND d.owner_id = auth.uid()
    ));
ALTER POLICY "authenticated_insert_own_deck_cards" ON meme.meme_deck_cards
    WITH CHECK (EXISTS (
        SELECT 1 FROM meme.meme_decks d
        WHERE d.id = deck_id AND d.owner_id = auth.uid()
    ));
ALTER POLICY "authenticated_delete_own_deck_cards" ON meme.meme_deck_cards
    USING (EXISTS (
        SELECT 1 FROM meme.meme_decks d
        WHERE d.id = deck_id AND d.owner_id = auth.uid()
    ));

-- meme.battle_results
ALTER POLICY "authenticated_select_own_battles" ON meme.battle_results
    USING (player_a_id = auth.uid() OR player_b_id = auth.uid());

-- meme.meme_user_profiles
ALTER POLICY "authenticated_update_own_profile" ON meme.meme_user_profiles
    USING (user_id = auth.uid());
ALTER POLICY "authenticated_update_own_profile" ON meme.meme_user_profiles
    WITH CHECK (user_id = auth.uid());

-- meme.meme_follows
ALTER POLICY "authenticated_insert_own_follow" ON meme.meme_follows
    WITH CHECK (follower_id = auth.uid());
ALTER POLICY "authenticated_delete_own_follow" ON meme.meme_follows
    USING (follower_id = auth.uid());

-- meme.meme_collections
ALTER POLICY "authenticated_select_public_and_own" ON meme.meme_collections
    USING (is_public = true OR owner_id = auth.uid());
ALTER POLICY "authenticated_insert_own_collection" ON meme.meme_collections
    WITH CHECK (owner_id = auth.uid());
ALTER POLICY "authenticated_update_own_collection" ON meme.meme_collections
    USING (owner_id = auth.uid());
ALTER POLICY "authenticated_update_own_collection" ON meme.meme_collections
    WITH CHECK (owner_id = auth.uid());
ALTER POLICY "authenticated_delete_own_collection" ON meme.meme_collections
    USING (owner_id = auth.uid());

-- meme.meme_saves
ALTER POLICY "authenticated_select_own_saves" ON meme.meme_saves
    USING (user_id = auth.uid());
ALTER POLICY "authenticated_insert_own_save" ON meme.meme_saves
    WITH CHECK (user_id = auth.uid());
ALTER POLICY "authenticated_delete_own_save" ON meme.meme_saves
    USING (user_id = auth.uid());

-- meme.meme_reports
ALTER POLICY "authenticated_insert_own_report" ON meme.meme_reports
    WITH CHECK (reporter_id = auth.uid());
ALTER POLICY "authenticated_select_own_reports" ON meme.meme_reports
    USING (reporter_id = auth.uid());

-- discordsh.servers
ALTER POLICY "authenticated_select_active_and_own" ON discordsh.servers
    USING (status = 1 OR owner_id = auth.uid());

-- public.realtime_messages (conditional — table only exists in Supabase)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'realtime_messages'
    ) THEN
        EXECUTE 'ALTER POLICY "authenticated_users_insert_messages" ON public.realtime_messages
            WITH CHECK (auth.uid() = user_id)';
        EXECUTE 'ALTER POLICY "users_update_own_messages" ON public.realtime_messages
            USING (auth.uid() = user_id)';
        EXECUTE 'ALTER POLICY "users_update_own_messages" ON public.realtime_messages
            WITH CHECK (auth.uid() = user_id)';
        EXECUTE 'ALTER POLICY "users_delete_own_messages" ON public.realtime_messages
            USING (auth.uid() = user_id)';
    END IF;
END $$;
