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

## 3. Place a flat terminal

Drop `AKBVEWebSurfaceActor` into the world. In the details panel:

- Set `Initial URL` (must pass the allowlist).
- Set `Draw Size` for screen pixel resolution.

The actor's child `KBVEWebSurfaceComponent` resolves the embedded `UWebBrowser` named `WebBrowser` inside its `Widget Class` (provide a `WBP_DemoBrowser`-style UMG with a `WebBrowser` widget).

## 4. Place a curved screen

Use `UKBVEWebRenderSurfaceComponent` on a curved `StaticMesh`. Assign a material that reads a texture parameter named `ScreenTexture` (override `ScreenTextureParam` to rename). The component creates a render target, binds it to a dynamic material instance, and pipes the embedded browser through it.

## 5. Player interaction

```cpp
FHitResult Hit;
if (UKBVEWebInputRouter::TraceForSurface(Player, 500.f, Hit))
{
    const FVector2D Pixel = UKBVEWebInputRouter::HitToWidgetCoord(Hit, FIntPoint(1024, 768));
    // Forward Pixel to the WebBrowser slot input
}
```

For UV mapping to work on curved meshes, enable `Project Settings → Physics → Support UV From Hit Results`.

## 6. JS↔UE bridge

From the web page:

```js
window.kbveBridge.send('inventory.use', JSON.stringify({ slot: 3 }));
```

In UE:

```cpp
Bridge->OnMessage.AddDynamic(this, &AMyActor::HandleBridge);
```
