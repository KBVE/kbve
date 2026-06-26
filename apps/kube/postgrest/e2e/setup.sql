ALTER ROLE authenticator WITH LOGIN PASSWORD 'e2e';
GRANT anon TO authenticator;

CREATE TABLE IF NOT EXISTS public.e2e_items (
    id   int PRIMARY KEY,
    name text NOT NULL
);
TRUNCATE public.e2e_items;
INSERT INTO public.e2e_items (id, name) VALUES (1, 'alpha'), (2, 'beta');

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.e2e_items TO anon;
GRANT INSERT ON public.e2e_items TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;
