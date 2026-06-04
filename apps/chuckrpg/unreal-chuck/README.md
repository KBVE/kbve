# unreal-chuck

Unreal Engine 5.7 project for ChuckRPG. See [AGENTS.md](./AGENTS.md) for
layout, LFS routing, and CI conventions.

This README documents the runtime systems that aren't obvious from the
file tree — start with **UI**.

---

## UI

ChuckRPG runs its menu and HUD layer in **pure C++ Slate** (no UMG
asset, no Blueprint). All visual constants — fonts, paddings, brushes,
colors, design canvas size — live in a single `FSlateStyleSet`
registered at module startup, and every Slate widget reads from it.
Adding screens later (login, settings, market, inventory) is therefore
a matter of declaring keys and constructing widgets, never copy-pasting
literals.

### Key files

| File                                                                                                                                                       | Role                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`Source/chuck/UI/ChuckUIStyle.h`](./Source/chuck/UI/ChuckUIStyle.h) / [`.cpp`](./Source/chuck/UI/ChuckUIStyle.cpp)                                        | `FChuckUIStyle` style-set singleton + `FKeys` constants     |
| [`Source/chuck/UI/SchuckMainMenu.h`](./Source/chuck/UI/SchuckMainMenu.h) / [`.cpp`](./Source/chuck/UI/SchuckMainMenu.cpp)                                  | `SchuckMainMenu` Slate widget (title + Play + Quit)         |
| [`Source/chuck/UI/chuckMenuPlayerController.h`](./Source/chuck/UI/chuckMenuPlayerController.h) / [`.cpp`](./Source/chuck/UI/chuckMenuPlayerController.cpp) | Spawns the widget on `BeginPlay`, owns input mode           |
| [`Source/chuck/UI/chuckMainMenuGameMode.h`](./Source/chuck/UI/chuckMainMenuGameMode.h) / [`.cpp`](./Source/chuck/UI/chuckMainMenuGameMode.cpp)             | `AchuckMainMenuGameMode` — sets PC class, no character pawn |
| [`Source/chuck/chuck.cpp`](./Source/chuck/chuck.cpp)                                                                                                       | `FChuckModule` — calls `FChuckUIStyle::Initialize/Shutdown` |
| [`Config/DefaultEngine.ini`](./Config/DefaultEngine.ini)                                                                                                   | `GlobalDefaultGameMode=/Script/chuck.chuckMainMenuGameMode` |

### Architecture

```
FChuckModule (StartupModule)
    └─ FChuckUIStyle::Initialize()
            └─ FSlateStyleSet "ChuckUI" registered with FSlateStyleRegistry
                    ├─ design canvas (1920×1080)
                    ├─ fonts (title 64 Bold, button 28 Regular)
                    ├─ margins (title padding, button slot, button content)
                    ├─ floats (column width, design size)
                    └─ brushes / colors (added as art lands)

AchuckMainMenuGameMode (auto-loaded at startup)
    └─ PlayerControllerClass = AchuckMenuPlayerController
    └─ DefaultPawnClass     = ASpectatorPawn (no character)

AchuckMenuPlayerController::BeginPlay
    ├─ SNew(SchuckMainMenu).OnPlayClicked(...).OnQuitClicked(...)
    ├─ Viewport->AddViewportWidgetForPlayer
    └─ SetInputMode(FInputModeUIOnly)
```

The menu sits on top of whatever level `GameDefaultMap` points to —
currently `Lvl_ThirdPerson`. The background world ticks normally; the
input mode keeps the camera frozen and mouse-cursor-visible.

### Responsive scaling

`SchuckMainMenu` wraps its content in `SScaleBox` with `ScaleToFit`
and a fixed inner `SBox(1920×1080)`. The design canvas is therefore
device-independent: any viewport size scales the canvas uniformly,
aspect ratio is preserved, and there's no per-widget resize math.
Letterboxing happens automatically on non-16:9 windows.

Reference dimensions are exposed via
`FChuckUIStyle::FKeys::Design_Width` / `Design_Height`. Change those
values in `ChuckUIStyle.cpp` to retarget the canvas; every widget
pulls the new numbers next frame.

### Adding a new screen

1. Declare new keys in `ChuckUIStyle.h::FKeys` (e.g. `Login_Field_Width`).
2. Define values in `ChuckUIStyle.cpp::Create()`:
    ```cpp
    Style->Set(FKeys::Login_Field_Width, 320.f);
    ```
3. Create a new `S<Screen>Widget : SCompoundWidget` under
   `Source/chuck/UI/`. Read constants via
   `FChuckUIStyle::Get().GetFloat/Margin/FontStyle/Color/Brush(FKeys::…)`.
4. Mount from a controller (or transition from the existing menu):
    ```cpp
    Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), SNew(SLoginMenu), 10);
    ```
5. Use `LOCTEXT_NAMESPACE` per file for label localization.

### Adding brushes / images

1. Drop PNG/SVG into `Content/UI/` (or a subfolder).
2. In `ChuckUIStyle.cpp::Create()`:
    ```cpp
    Style->Set(FKeys::MainMenu_Background,
        new FSlateImageBrush(
            Style->RootToContentDir(TEXT("Backgrounds/MainMenu.png")),
            FVector2D(1920.f, 1080.f)));
    ```
    `RootToContentDir` is rooted at `apps/chuckrpg/unreal-chuck/Content/UI/`
    per the `SetContentRoot` call in `Create()`.
3. Consume in a widget:
    ```cpp
    SNew(SImage).Image(Style.GetBrush(FKeys::MainMenu_Background))
    ```
4. New PNGs auto-land in LFS via the repo-root `.gitattributes` rule
   for `apps/chuckrpg/unreal-chuck/**/*.png`. Push with
   `./kbve.sh -lfs chuck register` (or `npx nx run unreal-chuck:sync`)
   to claim chuck-repo ownership of the OIDs.

### Conventions

- Slate widgets use the `S` prefix matching UE house style
  (`SchuckMainMenu`, not `UChuckMainMenuWidget`).
- Style set keys live in `FChuckUIStyle::FKeys` as `static const FName`
  so the compiler catches typos at link time, not via string match.
- Naming pattern: `Chuck.<Section>.<Element>.<Property>`
  (e.g. `Chuck.MainMenu.Title.Padding`, `Chuck.Button.Font`).
- Widget logic stays in the `S…` widget. Game-state side-effects
  (OpenLevel, QuitGame, ServerTravel) live in the owning controller,
  bridged via `FSimpleDelegate` events the widget exposes.
- No UMG widget blueprints, no `.uasset` widget files. Adding either
  starts to mix the two systems and breaks the source-controlled-only
  invariant we set early.

### Future upgrade paths

- **Brushes / colors / runtime theming**: `FChuckUIStyle` is already a
  full `FSlateStyleSet`, so adding `SetColor` / `Set(brush)` is a
  one-liner. Theme swap = build a second style set + flip the singleton
  ptr in `Initialize()`.
- **CommonUI plugin**: defer until controller focus / activatable
  widget stacks become painful. Slate alone handles the current scope
  fine.
- **Animation**: `FCurveSequence` for fade-ins, `FActiveTimerHandle`
  for periodic state, or `SBorder` + render transform for slide-ins.
  All Slate-native; no UMG dependency.
- **Localization**: `LOCTEXT` namespaces are already per-widget;
  gather strings with the standard UE localization dashboard when
  shipping.
