# Descriptors — Compiled Proto Artifacts

This directory contains **compiled protobuf descriptors** (`.binpb` files) generated from the source `.proto` definitions in [`../../proto/`](../../proto/).

## Files

| File | Source Proto | Used By |
|------|-------------|---------|
| `discordsh.binpb` | `kbve/discordsh.proto` | `gen-discordsh-zod.mjs` |

## Notes

- These are **build artifacts**, not source files. They should be regenerated when their source `.proto` changes.
- The codegen scripts in the parent directory (`../`) consume these descriptors to produce typed schemas.
- To regenerate: compile the source `.proto` with `protoc` using `--descriptor_set_out`.
