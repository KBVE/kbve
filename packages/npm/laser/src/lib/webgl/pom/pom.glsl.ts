export const POM_MAX_STEPS = 256;

export const POM_VARYINGS = /* glsl */ `
varying vec3 vPomViewTS;
varying vec2 vPomUv;
`;

export const DERIVE_TANGENT = /* glsl */ `
void pomDeriveTangent(
	vec3 worldNormal,
	vec3 worldPos,
	vec3 cameraPos,
	vec2 uv
) {
	vec3 N = normalize(worldNormal);
	vec3 up = abs(N.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
	vec3 T = normalize(cross(up, N));
	vec3 B = cross(N, T);
	mat3 TBN = mat3(T, B, N);
	vec3 vWorld = cameraPos - worldPos;
	vPomViewTS = vWorld * TBN;
	vPomUv = uv;
}
`;

export const POM_MARCH = /* glsl */ `
#ifndef POM_MAX_STEPS
#define POM_MAX_STEPS ${POM_MAX_STEPS}
#endif

// Consumer MUST define: float pomSampleDepth(vec2 uv);
//   returns 0.0 at the top surface, 1.0 at the deepest recess.

vec2 pomMarch(
	vec2 uv,
	vec3 viewTS,
	float scale,
	float minLayers,
	float maxLayers,
	out float hitDepth
) {
	vec3 V = normalize(viewTS);
	float grazing = clamp(V.z, 0.0, 1.0);
	float layers = mix(maxLayers, minLayers, grazing);
	float layerDepth = 1.0 / layers;
	vec2 shift = (V.xy / max(V.z, 0.05)) * scale;
	vec2 dUV = shift / layers;

	float curDepth = 0.0;
	vec2 curUV = uv;
	float sampled = pomSampleDepth(curUV);

	for (int i = 0; i < POM_MAX_STEPS; i++) {
		if (curDepth >= sampled) break;
		if (float(i) >= layers) break;
		curUV -= dUV;
		sampled = pomSampleDepth(curUV);
		curDepth += layerDepth;
	}

	vec2 prevUV = curUV + dUV;
	float afterD = sampled - curDepth;
	float beforeD = pomSampleDepth(prevUV) - (curDepth - layerDepth);
	float denom = afterD - beforeD;
	float w = abs(denom) < 1e-5 ? 0.0 : afterD / denom;
	hitDepth = curDepth - layerDepth * (1.0 - w);
	return mix(curUV, prevUV, w);
}
`;

export const SPOM_SILHOUETTE = /* glsl */ `
// bounds = vec4(minU, minV, maxU, maxV). When a marched UV leaves the height
// plate, the fragment is off the relief and should be discarded to carve the
// silhouette. Consumer pairs this with material.alphaToCoverage = true.
bool pomSilhouetteClip(vec2 uv, vec4 bounds) {
	return uv.x < bounds.x || uv.y < bounds.y ||
		uv.x > bounds.z || uv.y > bounds.w;
}
`;

export const POM_SELF_SHADOW = /* glsl */ `
// Soft self-shadow: march from the hit toward the (tangent-space) light and
// accumulate occlusion from height samples that rise above the ray.
float pomSelfShadow(
	vec2 uv,
	float hitDepth,
	vec3 lightTS,
	float scale,
	float layers
) {
	vec3 L = normalize(lightTS);
	if (L.z <= 0.0) return 1.0;
	float layerDepth = hitDepth / layers;
	vec2 dUV = (L.xy / max(L.z, 0.05)) * scale / layers;
	float curDepth = hitDepth;
	vec2 curUV = uv;
	float shadow = 0.0;
	for (int i = 0; i < POM_MAX_STEPS; i++) {
		if (curDepth <= 0.0 || float(i) >= layers) break;
		curUV += dUV;
		curDepth -= layerDepth;
		float h = pomSampleDepth(curUV);
		if (h < curDepth) shadow += 1.0;
	}
	return clamp(1.0 - shadow / layers, 0.0, 1.0);
}
`;

// Height-source helpers (§3). Each satisfies the pomSampleDepth() contract:
// depth 0.0 = surface top, 1.0 = deepest recess.
export const HEIGHT_HELPERS = /* glsl */ `
// Derive depth from an albedo map's luminance: bright = raised (shallow).
float pomDepthFromLuma(sampler2D albedo, vec2 uv) {
	vec3 c = texture2D(albedo, uv).rgb;
	float luma = dot(c, vec3(0.299, 0.587, 0.114));
	return 1.0 - luma;
}

// Procedural running-bond brick: mortar grooves are deep, faces shallow.
float pomDepthBrick(vec2 uv, vec2 bricks, float mortar) {
	vec2 g = uv * bricks;
	float row = floor(g.y);
	g.x += mod(row, 2.0) * 0.5;
	vec2 f = fract(g);
	vec2 edge = smoothstep(vec2(0.0), vec2(mortar), f) *
		smoothstep(vec2(0.0), vec2(mortar), 1.0 - f);
	float face = edge.x * edge.y;
	return 1.0 - face;
}
`;
