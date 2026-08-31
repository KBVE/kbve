# KBVE Proto

Canonical Protocol Buffer schemas for the KBVE ecosystem.

This repository is the single source of truth. Schemas are published to the
Buf Schema Registry as `buf.build/kbve/proto`; consumers depend on the
generated SDKs rather than vendoring `.proto` files or compiling them from a
sibling checkout.

## Layout

```
kbve/type/v1/       identifiers and primitive wrappers   (imports: WKT only)
kbve/common/v1/     shared messages and enums            (imports: type)
kbve/dialogue/v1/   shared domain                        (imports: type, common)
kbve/<domain>/v1/   domain schemas          (imports: type, common, shared domains)
```

Imports form a one-way graph with no cycles.

`common` holds types with no behaviour of their own: identifiers, maths,
enumerations several domains happen to share. A *shared domain* is different.
It models a real subject that other domains build on, and it is too big and too
opinionated to sit in `common` — but it imports only `type` and `common`, never
another domain, so nothing can form a cycle.

`dialogue` is the first of these. Quest steps, NPCs and map objects all present
the player with conditional choices that write state back to the world; that is
one subject, and before this it was implemented three times.

A domain never imports a peer domain. When two peers need the same thing, it
moves down: into `common` if it is a plain type, or into a shared domain if it
carries real modelling.

## Conventions

- Every package carries a version suffix (`kbve.item.v1`). A breaking change
  ships as `v2` alongside `v1` rather than mutating `v1` in place.
- Identifiers use the wrapper types in `kbve/type/v1/id.proto`. A bare
  `string id` field is not acceptable in new schemas.
- Timestamps use `google.protobuf.Timestamp`. Do not define your own.
- Durations are an integer count of a named unit, not
  `google.protobuf.Duration`. The Rust generator derives `Eq` on every message,
  and `prost-types` implements `Eq` for `Timestamp` but not for `Duration`, so a
  message holding one does not compile.
- Removed fields are always `reserved`, both the number and the name.
- File basenames are unique across the module. The C# generator flattens its
  output and names each file after the proto's basename, so two files sharing
  one basename collide even in different packages.

## Local development

```sh
buf build           # compile all modules
buf lint            # style and layout rules
buf format -w       # apply canonical formatting
buf breaking --against '.git#branch=main'
```

## Status

Migration in progress. The breaking-change check in CI is **commented out on
purpose**: nothing consumes these schemas yet, so reshaping them is the work
rather than a hazard. It must be re-enabled before the first publish, and the
publish workflow refuses to run while it is still disabled.

Domains are moved from `KBVE/kbve`
(`packages/data/proto/`) one at a time. That tree is frozen: it receives
bugfixes only, and new schema work happens here.
