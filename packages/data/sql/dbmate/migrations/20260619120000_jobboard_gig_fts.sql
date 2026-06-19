-- migrate:up

-- Full-text search for the gig feed. A stored generated tsvector weights the
-- title (A) over the summary (B) over the description (C); the GIN index backs
-- `search_vector @@ websearch_to_tsquery('english', :q)` browse/filter queries.
-- 'english'::regconfig is required (the bare-text form is only STABLE, which a
-- generated column rejects).
alter table jobboard.gigs
    add column search_vector tsvector
    generated always as (
        setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english'::regconfig, coalesce(summary, '')), 'B') ||
        setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'C')
    ) stored;

create index jobboard_gigs_search_idx on jobboard.gigs using gin (search_vector);

-- migrate:down

drop index if exists jobboard.jobboard_gigs_search_idx;
alter table jobboard.gigs drop column if exists search_vector;
