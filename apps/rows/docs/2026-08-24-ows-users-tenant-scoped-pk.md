# ows.Users tenant-scoped primary key — deploy runbook

Covers migrations `20260824120000_ows_users_tenant_scoped_pk` and
`20260824120100_ows_users_tenant_fk_validate`, shipped with `rows` 0.1.39.

## What changes

`ows.Users` is re-keyed from `PRIMARY KEY (UserGUID)` to `PRIMARY KEY (CustomerGUID, UserGUID)`.

Upstream OWS assumed one deployment meant one tenant. ROWS is multi-tenant: every other table
keys on `(CustomerGUID, ...)` and every `users` lookup in the service is already scoped
`WHERE customerguid = $1 AND userguid = $2`. The global PK meant a Supabase account that had
logged into tenant A could never be provisioned into tenant B — the scoped `SELECT`s missed, the
`INSERT ... ON CONFLICT (userguid) DO NOTHING` collided on the global PK and swallowed the row,
and tenant B ended up holding a session with no `users` row behind it. Character creation then
`INSERT..SELECT`ed zero rows and the roster stayed empty forever.

`FK_Characters_UserGUID` and `FK_UserSessions_UserGUID` widen to the composite. Both child tables
already carry `CustomerGUID`, so they gain tenant integrity they never had: the old FKs
constrained `UserGUID` only and would happily let a character in tenant A point at a user owned
by tenant B.

## Deploy order — read this first

**The migrations must be applied before `rows` 0.1.39 serves traffic.**

`find_or_create_supabase_user` uses `ON CONFLICT (customerguid, userguid) DO NOTHING`. Postgres
infers that conflict target from a unique index; against the pre-migration schema no such index
exists and every call fails with:

```
42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

That is every first-login-per-tenant provisioning request, so it presents as a login outage
rather than a partial degradation.

The two pipelines are independent and neither waits for the other:

- migrations — `ci-dbmate-deploy.yml`, **manual `workflow_dispatch`**, gated on the
  `kilobase-prod` environment
- service — mdx `version:` bump → docker pipeline → post-publish PR bumps `version.toml` and the
  deployment yaml → Argo syncs the image

So the ordering is a human responsibility:

1. Merge to `dev`, then to `main`.
2. Confirm `ci-dbmate-validate` is green on the merge SHA.
3. Run the pre-flight query below.
4. Dispatch `ci-dbmate-deploy` with `confirm_sha`, approve the `kilobase-prod` gate, confirm both
   migrations report applied.
5. Only then let the `rows` image roll (approve the post-publish PR / let Argo sync).

## Pre-flight

`20260824120100` validates the widened FKs. The old FKs never checked `CustomerGUID`, so child
rows pointing at another tenant's user are possible in existing data and will refuse to validate.
Check before you deploy:

```sql
SELECT count(*) FROM ows.Characters c JOIN ows.Users u ON u.UserGUID = c.UserGUID
 WHERE c.CustomerGUID <> u.CustomerGUID;

SELECT count(*) FROM ows.UserSessions s JOIN ows.Users u ON u.UserGUID = s.UserGUID
 WHERE s.CustomerGUID <> u.CustomerGUID;
```

Both should return 0. `20260824120000` also `RAISE WARNING`s the same counts as it runs, so a
non-zero result shows up in the Job log even if the query above was skipped.

If either is non-zero, repair before dispatching `20260824120100`:

- **UserSessions** — safe to `DELETE`. Clients re-login.
- **Characters** — decide per row. Either repoint `CustomerGUID` at the owning tenant, or set
  `UserGUID = NULL` (the column is nullable and the service already tolerates ownerless legacy
  characters, see `service/instances.rs`).

Re-running the validate migration after repair is safe — validating an already-valid constraint
is a no-op.

## Why the FKs are added NOT VALID

`20260824120000` adds both FKs `NOT VALID` and `20260824120100` validates them. Adding them
pre-validated would take `ACCESS EXCLUSIVE` on `Characters` and `UserSessions` for a full scan,
and would abort the entire re-key transaction on the first bad row — with `backoffLimit: 0` on
the runner Job, that is a dead deploy with the service potentially already rolled forward.
`NOT VALID` takes a brief lock, constrains all new writes immediately, and moves the scan into a
migration where failure is diagnosable and re-runnable under `SHARE UPDATE EXCLUSIVE` (concurrent
reads and writes keep working).

## Rollback

**There is no DB rollback.** `apps/kube/kilobase/templates/dbmate-runner-job.yaml` hardcodes
`dbmate up` and never runs `down`. Reversing this in production means writing a new forward
migration.

The `migrate:down` blocks exist so `ci-dbmate-validate` can exercise them. They also cannot
succeed once the same `UserGUID` exists under more than one tenant — which is the entire point of
the change — because restoring `PRIMARY KEY (UserGUID)` would reject those rows. Drop or re-key
them first if you ever genuinely need to reverse.

Service rollback: **do not roll `rows` back past 0.1.39** once the migrations are applied. 0.1.38
uses `ON CONFLICT (userguid)`, and after the re-key the only index on `userguid` alone is
`IX_Users_UserGUID`, which is non-unique — so the old image hits the same `42P10` in the other
direction.

## Consequences to keep in mind

`IX_Users_UserGUID` is deliberately **non-unique**. After this change a `UserGUID` identifies a
row only together with its `CustomerGUID`. Any query keyed on `UserGUID` alone is a cross-tenant
query and is almost certainly a bug — this release fixed three of them in `repo/users.rs` (the
login session purge, the `create_session` purge, and the legacy bcrypt→argon2 rehash), each of
which would otherwise have reached into every other tenant holding the same account.

## Coverage

`packages/data/sql/dbmate/migration-tests/20260824120000_ows_users_tenant_scoped_pk.test.sql`
asserts the property the migration exists for: the same `UserGUID` provisioned into two tenants,
addressable independently, with within-tenant duplicates still rejected and the widened FKs
enforcing tenancy and reported `convalidated`. It runs in `ci-dbmate-validate`.
