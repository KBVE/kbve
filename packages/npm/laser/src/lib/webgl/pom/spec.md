# POM / SPOM — algorithm & uniform contract

Single source of truth for the parallax occlusion mapping primitives. Two
hand-written emit targets share this contract: `pom.glsl.ts` (WebGL, shipped)
and `pom.wgsl.ts` (WebGPU, scaffold).

## Depth convention

`pomSampleDepth(uv) -> float` — the required consumer hook.
`0.0` = top surface (closest to viewer), `1.0` = deepest recess. Height helpers
(`pomDepthFromLuma`, `pomDepthBrick`) already return depth in this convention;
a raw height map (white = raised) is inverted by the consumer as `1.0 - h`.

## Vertex stage

`pomDeriveTangent(worldNormal, worldPos, cameraPos, uv)` builds a tangent basis
for an **axis-aligned** surface (no tangent attribute) and writes varyings:

- `vPomViewTS` — view direction (frag → camera) in tangent space
- `vPomUv` — base UV

Non-axis-aligned geometry must supply its own TBN; documented limitation.

## Fragment stage

`pomMarch(uv, viewTS, scale, minLayers, maxLayers, out hitDepth) -> vec2`
Linear layer march (steps lerp `maxLayers`→`minLayers` by view grazing angle)
then a single binary-search refine. Returns the parallaxed UV; all albedo /
lighting samples use it. `hitDepth` feeds shading and self-shadow.

`pomSilhouetteClip(uv, bounds) -> bool` — true when the marched UV left the
height plate `bounds = vec4(minU, minV, maxU, maxV)`. Consumer `discard`s and
sets `material.alphaToCoverage = true` (requires MSAA). This carves the
silhouette past the quad edge; no extruded geometry required.

`pomSelfShadow(uv, hitDepth, lightTS, scale, layers) -> float` — optional soft
relief shadow, a second march toward a tangent-space light.

## Uniform contract

| Uniform       | Type        | Meaning |
|---------------|-------------|---------|
| `uHeightMap`  | `sampler2D` | height field (consumer-supplied) |
| `uPomScale`   | `float`     | relief depth in UV units |
| `uMinLayers`  | `float`     | march steps head-on |
| `uMaxLayers`  | `float`     | march steps at grazing angle |
| `uSilhouette` | `float`     | 0/1 edge discard |
| `uShadow`     | `float`     | 0/1 self-shadow march |

`uniforms.ts` `createPomUniforms()` produces these with clamping
(`scale >= 0`, `layers >= 1`, `maxLayers >= minLayers`); `toThreeUniforms()`
wraps them in `{ value }` cells for a raw `THREE.ShaderMaterial`.

## Consumer wiring order (GLSL)

1. Splice `POM_VARYINGS` into vertex + fragment.
2. Vertex: call `pomDeriveTangent(...)`.
3. Fragment: `HEIGHT_HELPERS`, then define `pomSampleDepth`, then `POM_MARCH`,
   `SPOM_SILHOUETTE`, optional `POM_SELF_SHADOW`.
4. In `main`: `pomMarch` → optional `pomSilhouetteClip`/`discard` → sample at
   the returned UV.

## Integration notes

- Run POM on **perspective-correct** UV. Affine UV warp + parallax offset =
  texture swim; disable affine on POM surfaces (herbmail PsxMaterial).
- Distance-LOD: ramp `maxLayers`→`minLayers`→0 with depth/fog to bound cost.
- `pomSampleDepth` is the injection seam — swap brick / luma / authored map
  without touching the marcher.
