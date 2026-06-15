begin;


-- ============================================================
-- JOBBOARD DEDICATED POSTGRES ROLE
--
-- Bounds the jobboard Axum service to least-privilege DML inside
-- the jobboard schema. NOT service_role (BYPASSRLS) and NOT the
-- schema owner — a non-owner role so GRANTs + RLS actually
-- constrain it. dbmate (postgres) owns the schema and does DDL;
-- this role only reads/writes rows it is granted.
--
-- Command-scoped grants encode the invariants the DB can hold:
--   - no DELETE on historical/moderation tables
--   - reviews/messages immutable (no UPDATE/DELETE)
--   - audit_log append-only (INSERT/SELECT only)
--
-- Per-table permissive policies (FOR ALL TO jobboard) let this
-- non-owner role pass RLS/force; the real command limits are the
-- GRANTs, and row-level invariants are enforced in the service.
--
-- Password is a local-dev placeholder. Production password is
-- injected via ExternalSecret → jobboard-db sealed secret, then:
--   ALTER ROLE jobboard WITH PASSWORD '<production-password>';
-- and KBVE_PG_RW_URL points at postgres://jobboard:...@cluster.
--
-- Depends on: 20260615120000_jobboard_tables.sql
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jobboard') THEN
        CREATE ROLE jobboard LOGIN PASSWORD 'jobboard-local-dev';
    END IF;
END $$;

COMMENT ON ROLE jobboard IS
    'Dedicated jobboard service role — least-privilege DML within jobboard schema only.';

grant usage on schema jobboard to jobboard;

grant select, insert, update on jobboard.verticals to jobboard;
grant select, insert, update on jobboard.taxonomy to jobboard;

grant select, insert, update, delete on jobboard.talent_profiles to jobboard;
grant select, insert, update, delete on jobboard.client_profiles to jobboard;
grant select, insert, delete on jobboard.talent_verticals to jobboard;
grant select, insert, delete on jobboard.talent_taxonomy to jobboard;
grant select, insert, delete on jobboard.client_verticals to jobboard;

grant select, insert, update on jobboard.member_applications to jobboard;
grant select, insert, delete on jobboard.member_application_verticals to jobboard;

grant select, insert, update, delete on jobboard.portfolio_items to jobboard;
grant select, insert, delete on jobboard.portfolio_tags to jobboard;

grant select, insert, update on jobboard.gigs to jobboard;
grant select, insert, delete on jobboard.gig_taxonomy to jobboard;

grant select, insert, update on jobboard.applications to jobboard;
grant select, insert, delete on jobboard.application_portfolio_items to jobboard;

grant select, insert, update on jobboard.engagements to jobboard;
grant select, insert on jobboard.reviews to jobboard;

grant select, insert on jobboard.conversations to jobboard;
grant select, insert, update on jobboard.conversation_participants to jobboard;
grant select, insert on jobboard.messages to jobboard;

grant select, insert, update, delete on jobboard.notifications to jobboard;

grant select, insert, update on jobboard.reports to jobboard;
grant select, insert on jobboard.audit_log to jobboard;

grant execute on function jobboard.set_updated_at() to jobboard;

do $$
declare t text;
begin
    foreach t in array array[
        'verticals','taxonomy','talent_profiles','client_profiles',
        'talent_verticals','talent_taxonomy','client_verticals',
        'member_applications','member_application_verticals',
        'portfolio_items','portfolio_tags','gigs','gig_taxonomy',
        'applications','application_portfolio_items','engagements',
        'reviews','conversations','conversation_participants','messages',
        'notifications','reports','audit_log'
    ]
    loop
        execute format(
            'create policy jobboard_service on jobboard.%I for all to jobboard using (true) with check (true)',
            t
        );
    end loop;
end $$;

revoke all on schema public from jobboard;
grant usage on schema public to jobboard;
grant usage on schema extensions to jobboard;

do $$ begin
    if exists (
        select 1 from pg_proc p join pg_namespace n on p.pronamespace = n.oid
        where n.nspname = 'public' and p.proname = 'gen_ulid'
    ) then
        execute 'grant execute on function public.gen_ulid() to jobboard';
    end if;
end $$;

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'jobboard' and rolcanlogin) then
        raise exception 'jobboard role must exist with LOGIN';
    end if;
    if not has_schema_privilege('jobboard', 'jobboard', 'USAGE') then
        raise exception 'jobboard role must have USAGE on jobboard schema';
    end if;
    if has_table_privilege('jobboard', 'jobboard.audit_log', 'DELETE') then
        raise exception 'jobboard role must NOT have DELETE on audit_log';
    end if;
    raise notice 'jobboard_dedicated_role.sql: role created and verified.';
end $$;

commit;
