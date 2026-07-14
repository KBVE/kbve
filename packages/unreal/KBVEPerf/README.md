# KBVEPerf

Lightweight, runtime-toggleable performance instrumentation for KBVE Unreal plugins. Scoped timers and counters feed per-name aggregates that drain to three sinks: the log, an on-screen overlay, and a live HTTP `/perf` JSON readout that external tooling (CLI/agent) can poll instead of a human relaying `stat unit` numbers by hand.

Compiles out of shipping builds; one atomic load + branch when disabled at runtime.

## Macros

```cpp
#include "KBVEPerf.h"

void UMyThing::HotPath()
{
    KBVEPERF_SCOPE("Grass.AddChunk");      // RAII scoped timer
    // ... work ...
    KBVEPERF_COUNT("Grass.Instances", 72627); // counter / gauge sample
}
```

- The name's prefix before the first `.` is the **category** (`Grass.AddChunk` → `Grass`).
- In a Shipping build (`KBVEPERF_ENABLED=0`) both macros expand to nothing.
- When compiled in but `kbve.perf 0`, the scope ctor returns after a single atomic check — no timing, no allocation.

Add `KBVEPerf` to your module's `PrivateDependencyModuleNames` and the plugin to your `.uplugin` `Plugins` list.

## CVars

| CVar                   | Default | Purpose                                                             |
| ---------------------- | ------- | ------------------------------------------------------------------- |
| `kbve.perf`            | `0`     | Master switch. `1` turns collection + `/perf` on, `0` off.          |
| `kbve.perf.categories` | `""`    | Comma-separated allow-list, e.g. `"Grass,Terrain"`. Empty = all.    |
| `kbve.perf.port`       | `8099`  | Port for the HTTP `/perf` endpoint.                                 |
| `kbve.perf.overlay`    | `0`     | On-screen overlay of the worst ops this frame.                      |
| `kbve.perf.threshold`  | `3.0`   | Log-sink threshold (ms); slower scopes emit a `[KBVEPerf]` warning. |

Flip any of these live in the console — no rebuild.

## HTTP readout

```
kbve.perf 1
curl http://localhost:8099/perf
```

```json
{
	"frame": 12345,
	"fps": 58.2,
	"ops": [
		{
			"name": "Grass.AddChunk",
			"count": 412,
			"lastMs": 3.1,
			"maxMs": 10.9,
			"avgMs": 3.4,
			"p95Ms": 7.2
		},
		{
			"name": "Terrain.GenerateMeshData",
			"count": 380,
			"lastMs": 0.6,
			"maxMs": 1.1,
			"avgMs": 0.7,
			"p95Ms": 0.9
		}
	],
	"counts": [
		{ "name": "Grass.ResidentChunks", "value": 25 },
		{ "name": "Grass.Instances", "value": 72627 }
	]
}
```

## License

Part of the KBVE monorepo — see repo root.
