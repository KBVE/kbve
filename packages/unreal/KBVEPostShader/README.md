# KBVEPostShader

Stylized post-process pipeline for a **Breath of the Wild / Studio Ghibli** painterly look — anisotropic Kuwahara oil-paint smear, cel banding, and depth-driven ink outlines. Runs as chained RDG passes from a `FSceneViewExtension`, gated by CVars, off by default.

## Pipeline

Inserted after the tonemapper (operates on display-space scene color), three full-screen passes:

1. **Structure tensor** (`KBVEPostStructureTensor.usf`) — RGB Sobel → local flow tangent + anisotropy. Drives the smear direction.
2. **Anisotropic Kuwahara** (`KBVEPostKuwahara.usf`) — 8-sector generalized Kuwahara over a flow-oriented ellipse; keeps the lowest-variance sector mean. This is the oil-paint base.
3. **Composite** (`KBVEPostComposite.usf`) — ink outlines from scene-**depth** + painted-luma discontinuities, cel luminance banding (hue preserved), warm saturation, then darken by the ink mask.

## CVars

| CVar                       | Default | Purpose                                        |
| -------------------------- | ------- | ---------------------------------------------- |
| `r.KBVEPost.Enable`        | `0`     | Master on/off.                                 |
| `r.KBVEPost.Radius`        | `6`     | Kuwahara sample radius (oil smear size, 1–16). |
| `r.KBVEPost.OilStrength`   | `0.85`  | Blend original → Kuwahara result.              |
| `r.KBVEPost.Bands`         | `5`     | Cel luminance bands.                           |
| `r.KBVEPost.EdgeStrength`  | `1.4`   | Ink outline darkening.                         |
| `r.KBVEPost.EdgeThreshold` | `0.15`  | Discontinuity threshold for outlines.          |
| `r.KBVEPost.Saturation`    | `1.15`  | Painterly saturation pop.                      |

Defaults are also exposed in **Project Settings → KBVE → KBVE Post Shader** (`UKBVEPostShaderSettings`).

```
r.KBVEPost.Enable 1
r.KBVEPost.Radius 8
r.KBVEPost.OilStrength 0.9
```

## Status

P1 (this drop): the core trio — structure tensor + anisotropic Kuwahara + cel/ink composite, BotW-tuned defaults, desktop SM5+.

Planned P2: GBuffer **normal**-based outlines (crisper geometry edges), warm palette LUT, canvas/paper texture overlay, subtle flow warp, Ghibli/BotW presets, and per-area control via a settings volume.

## Notes

- Targets UE 5.7, SM5 minimum. Builds in `ci-unreal`.
- The composite pass reads scene depth via the SceneTextures uniform buffer bound from `FPostProcessMaterialInputs`; insertion point + that binding are the two things to confirm on first in-engine compile.

## License

Part of the KBVE monorepo — see repo root.
