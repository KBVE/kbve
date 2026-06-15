-- Runs at first DB init (before the dbmate migrate service).
-- dbmate tracks applied migrations in dbmate.schema_migrations; the schema
-- must exist because DATABASE_URL pins search_path=dbmate,public.
create schema if not exists dbmate;
