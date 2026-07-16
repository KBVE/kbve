// WGSL / TSL scaffold for the WebGPU path (future). The GLSL chunks in
// pom.glsl.ts are the shipped implementation; this mirrors the same algorithm
// and uniform contract for three.js WebGPURenderer + TSL, matching
// SkyeShark/threejs-silhouette-pom. Not wired into any consumer yet.
//
// Parity contract (see spec.md):
//   pomSampleDepth(uv) -> f32   0.0 top surface, 1.0 deepest recess
//   pomMarch(uv, viewTS, scale, minLayers, maxLayers) -> (uv, hitDepth)
//   pomSilhouetteClip(uv, bounds) -> bool
//
// When a WebGPU consumer lands, port pomMarch here as a TSL Fn node (or raw
// WGSL) and validate against the GLSL reference with the shared demo scene.

export const POM_WGSL_STUB = /* wgsl */ `
// TODO(webgpu): port pomMarch / pomSilhouetteClip as TSL nodes.
// Placeholder kept so the module + uniform contract exist for the WebGPU path.
fn pomSampleDepth(uv: vec2<f32>) -> f32 {
	return 0.0;
}
`;
