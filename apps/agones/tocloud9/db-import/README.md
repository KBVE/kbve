# tocloud9 db-import

This directory holds only a `version.toml`. The image itself is built from the
`db-import` stage of [`../gameserver/Dockerfile`](../gameserver/Dockerfile),
which produces both the worldserver and the dbimport binary from one
AzerothCore compile — splitting them into separate Dockerfiles would mean
compiling the core twice.

The two images still version independently, because they change for different
reasons: the worldserver moves when the core or the module moves, while
dbimport moves when the SQL lineage does. `ci-docker.yml` resolves one
`version_toml` per `app_name`, so each needs its own file.

Why this image exists at all, rather than upstream `acore/ac-wotlk-db-import`:
the schema it produces has to come from the same tree as the worldserver that
reads it. 3kynox's branch carries its own update chain, and applying it on top
of a database built by upstream's importer fails — a clean install is the only
path that works.

Built via `nx run agones-tocloud9:container-db-import`.
