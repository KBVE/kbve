# Friendslop

3D game built with Godot 4.7 (Forward+), targeting Windows, macOS, and Linux.

## Layout

- `godot-friendslop/` — Godot project (Nx project `godot-friendslop`)

## Requirements

- Godot 4.7 with export templates installed (`godot` on PATH)

## Commands

```bash
pnpm nx run godot-friendslop:editor
pnpm nx run godot-friendslop:run
pnpm nx run godot-friendslop:export:windows
pnpm nx run godot-friendslop:export:macos
pnpm nx run godot-friendslop:export:linux
pnpm nx run godot-friendslop:export
```

Exports land in `dist/apps/friendslop/<platform>/`.

macOS preset exports an unsigned zip (ad-hoc signing). Wire codesign/notarization before shipping.
