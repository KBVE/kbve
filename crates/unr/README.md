# unr

C FFI bridge from KBVE game logic crates to Unreal Engine via [`cbindgen`].

Sibling of [`uniti`], which does the same job for Unity. Builds as a
`staticlib` (`libunr.a`) that UnrealBuildTool links through
`PublicAdditionalLibraries`, plus a `cdylib` for hosts that load at runtime and
an `rlib` so `tests/` link the crate directly.

## Threading

This crate owns **work**, not **scheduling**. Bulk jobs are driven by whatever
scheduler the host already runs — Unreal's task graph in the client, tokio's
blocking pool on the server — so neither host gains a second thread pool
competing with its renderer for cores.

`src/runtime.rs` is the deliberate exception: one worker, blocking pool capped
at four, for internal tickers and transports that have nowhere else to live.

## Bindings

`build.rs` runs `cbindgen` and writes the checked-in header:

```
crates/unr/include/unr.h
```

It is committed so the Unreal build never needs cargo to have run. Regenerate
with `moon run unr:bindgen`.

## Checks

```sh
moon run unr:link-probe   # links libunr.a with the PLATFORM linker, then runs it
cargo test -p unr
```

`link-probe` is the one that matters for Unreal. `cargo test` links through
rustc's own toolchain and stays green even when the platform linker cannot read
the archive UBT is handed — which is a real failure mode when the Rust
toolchain's LLVM drifts past Xcode's.

## License

MIT

[`cbindgen`]: https://github.com/mozilla/cbindgen
[`uniti`]: ../uniti
