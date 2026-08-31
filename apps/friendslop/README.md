# Friendslop

3D game built with Godot 4.7 (Forward+), targeting Windows, macOS, and Linux.

## Layout

- `godot-friendslop/` — Godot project (Nx project `godot-friendslop`)

## Requirements

- Godot 4.7 with export templates installed (`godot` on PATH)

## Commands

```bash
moon run godot-friendslop:editor
moon run godot-friendslop:run
moon run godot-friendslop:export-windows
moon run godot-friendslop:export-macos
moon run godot-friendslop:export-linux
moon run godot-friendslop:export
```

Exports land in `dist/apps/friendslop/<platform>/`.

macOS preset exports an unsigned zip (ad-hoc signing). Wire codesign/notarization before shipping.
