# @kbve/i18n

Translation strings for every KBVE surface, kept as plain JSON so consumers in
different languages read the same source of truth.

`locales/en` is authoritative: a key exists when English has it, and a locale is
allowed to be incomplete — anything missing falls back to English rather than
rendering blank.

```
locales/
  locales.json              # shipping locales, named in their own language
  en/
    common.json             # shared across surfaces
    game.friendslop.json    # one namespace per surface
```

## Consumers

| Surface          | How it reads this                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| godot-friendslop | `nx run godot-friendslop:i18n:sync` copies `locales/` into `assets/i18n/`, read by the `I18n` autoload |
| TypeScript       | not wired yet — `desktop-kbve` still has its own `src/i18n/en.json`                                    |

Godot only packs files that live under its own project directory, which is why
the game gets a synced copy rather than a path reference. The copy is committed
so an export never depends on the sync having been run.

## Conventions

- Nested objects, addressed with dotted keys (`settings.camera_name.first_person`).
- Interpolation is `{{name}}`, matching the existing `desktop-kbve` helper.
- Language names in `locales.json` are endonyms and are never translated: a
  picker is read by someone who cannot yet read the rest of the UI.
- No plural-bearing strings yet. Adding one means picking a plural strategy
  first — the `_one`/`_other` key-suffix convention — because retrofitting it
  later touches every call site.
