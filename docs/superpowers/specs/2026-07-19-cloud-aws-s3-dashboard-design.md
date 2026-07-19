# Cloud > AWS > S3 dashboard panel

Date: 2026-07-19
Status: implemented (this PR)

## Goal

Surface the AWS S3 **database-backup** bucket (`s3://kilobase`, barman) inside
`kbve.com/dashboard/` as a staff-gated, proxy-only panel — matching the existing
infra panels (Argo, Grafana, ClickHouse, VM). No direct S3 access from the
browser; the IAM creds stay server-side. First step toward a hybrid-cloud
management surface (`Cloud > AWS > …`, later GCP / Cloudflare).

## Scope

Architect for full control, ship the read path first, iterate on the look.
This PR wires the already-merged pieces from #14244 into a reachable, secured
panel — it does not add mutation (upload/delete) yet.

## Architecture

```
Browser (dashboard, $isStaff gate)
  → DASH_PROXY_BASE /dashboard/kilobase/s3/{summary,objects}
    → gateway/kbve-gate
      → axum-kbve  s3backup::routes  (in-process staff gate — defense in depth)
        → aws-sdk-s3  (creds from kilobase-s3-secret; bucket kilobase, us-east-1)
          → AWS S3
```

- Backend logic: `apps/kbve/axum-kbve/src/s3backup/` (client, summary, routes).
  `summary::summarize` is a pure, unit-tested aggregation over the object list.
- Auth: handlers verify the bearer JWT (`auth_user_id`) and `forum.is_staff`
  (→ `staff.members`) before any AWS call. 403 on non-staff. This does not rely
  on the upstream gateway alone.
- Frontend: `@kbve/rn` `S3BackupPanel` + `kilobaseBackup` adapter (both from
  #14244), mounted via `AstroS3Dashboard.astro` → `ReactS3BackupRN` (clones the
  Minecraft panel: `$isStaff` gate + `getToken` + `DASH_PROXY_BASE`).
- Route: `/dashboard/cloud/aws/s3/`; nav entry `Cloud > AWS > S3` (staff).

## Follow-ups (not in this PR)

- Move the reusable S3 logic into `jedi` behind an `aws` Cargo feature so other
  services/CLI can share it; axum-kbve becomes the thin HTTP shell.
- Object browser drill-down + presigned download; later, mutation (full control).
- Generalize `Cloud` to more providers (GCP, Cloudflare/R2) and AWS services.
- Confirm gateway path coverage for `/dashboard/kilobase/s3/*` (in-process gate
  already makes this non-load-bearing for security).
