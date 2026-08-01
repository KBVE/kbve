// React Three Fiber subpath: every laser module that imports three,
// @react-three/fiber or @react-three/drei. Kept out of the main barrel so a
// consumer that never renders with three (arpg, cryptothrone) does not drag
// those optional peers into its module graph.

export { Stage } from './lib/r3f/components/Stage';
export type { StageProps } from './lib/r3f/components/Stage';
export { useGameLoop } from './lib/r3f/hooks/use-game-loop';

export {
	createPomUniforms,
	toThreeUniforms,
	POM_DEFAULTS,
	POM_MAX_STEPS,
	POM_VARYINGS,
	DERIVE_TANGENT,
	POM_MARCH,
	SPOM_SILHOUETTE,
	POM_SELF_SHADOW,
	HEIGHT_HELPERS,
	POM_SOURCE_BRICK,
	POM_SOURCE_LUMA,
	POM_SOURCE_MAP,
	POM_WGSL_STUB,
} from './lib/webgl/pom';
export type {
	PomUniformValues,
	PomConfig,
	PomMaterialType,
} from './lib/webgl/pom';
