-- Dev seed: a few verticals so the SPA listing isn't empty.
-- Runs after dbmate creates jobboard.verticals.
insert into jobboard.verticals (slug, label, description, sort_order) values
    ('engineering', 'Engineering', 'Backend, frontend, infra, embedded.', 1),
    ('design', 'Design', 'Product, brand, motion, illustration.', 2),
    ('writing', 'Writing', 'Docs, copy, technical writing.', 3)
on conflict (slug) do nothing;
