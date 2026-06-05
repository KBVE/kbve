# Quickstart

## 1. Enable the plugin

Drop `KBVEWebSurface` into your project's `Plugins/` folder, or reference it via `AdditionalPluginDirectories` in `.uproject`:

```json
{
	"Plugins": [{ "Name": "KBVEWebSurface", "Enabled": true }],
	"AdditionalPluginDirectories": ["../path/to/packages/unreal"]
}
```

Regenerate project files. Restart the editor.

## 2. Configure the URL allowlist

`Project Settings → Plugins → KBVE Web Surface`:

- `Allowed URL Prefixes`: e.g. `https://kbve.com/`, `http://127.0.0.1:3000/`
- `Blocked URL Prefixes`: e.g. `file://`, `chrome://`

Empty allowlist = allow everything (not recommended).

## 3. Drop a terminal

Place `AKBVEWebTerminalActor` in the world. In the details panel:

- `Initial URL` — must pass the allowlist.
- `Auth Token` (optional) — appended as `#kbve_token=<token>` so the page can hydrate without a separate login round-trip.
- `Surface → Draw Size` — pixel resolution of the surface.

No UMG `.uasset` required. The plugin's `UKBVEWebSurfaceUserWidget` constructs its `UWebBrowser` root programmatically.

## 4. Player interaction

Attach `UKBVEWebInteractionComponent` to the player pawn or controller. Hover, click, and scroll work out of the box for flat surfaces via Unreal's standard `WidgetInteractionComponent` pipeline. Defaults: 1000 unit reach, world trace, `ECC_Visibility`.

```cpp
Interaction = CreateDefaultSubobject<UKBVEWebInteractionComponent>(TEXT("WebInteraction"));
Interaction->SetupAttachment(FollowCamera);
```

Bind input actions to `PressPointerKey(EKeys::LeftMouseButton)` / `ReleasePointerKey(...)` / `SendKeyChar(...)` per the standard `UWidgetInteractionComponent` API.

## 5. Curved screen

`UKBVEWebRenderSurfaceComponent` on a curved `StaticMesh`. Assign a material that reads a texture parameter named `ScreenTexture` (override `ScreenTextureParam` to rename). The component creates a render target, binds it to a dynamic material instance, and pipes the embedded browser through it.

For curved-mesh trace input enable `Project Settings → Physics → Support UV From Hit Results` and use `UKBVEWebInputRouter::HitToWidgetCoord` (still available, but flagged deprecated for flat surfaces).

## 6. JS↔UE bridge

The bridge is auto-attached when `LoadURL` runs. UFUNCTIONs on `UKBVEWebBridge` become callable from JS as `window.<BridgeName>.<func>`.

From a page:

```js
window.kbveBridge.Dispatch('inventory.use', JSON.stringify({ slot: 3 }));
```

In UE:

```cpp
Surface->GetBridge()->OnMessage.AddDynamic(this, &AMyActor::HandleBridge);

void AMyActor::HandleBridge(FName Channel, const FString& Payload)
{
	// Channel = "inventory.use", Payload = the JSON string
}
```

Push UE → JS:

```cpp
Surface->GetBridge()->Push(TEXT("market.update"), TEXT("{\"orders\":3}"));
```

The web page listens via `window.kbveBridge.onPush = (channel, payload) => { ... }`.

## 7. Performance rails

All wired into the component by default; tune in the details panel:

- `Max Frame Rate` (default 30) — accumulator-driven `RequestRedraw` cadence.
- `Pause When Offscreen` (default true) — gates redraw on `WasRecentlyRendered`.
- `Snapshot Distance` (default 0 / off) — past this distance the surface freezes its last rendered frame and stops ticking the browser.

`UKBVEWebLODManager` auto-registers surfaces on `BeginPlay`. `UKBVEWebSurfacePool` caps concurrent live surfaces (default 8).
