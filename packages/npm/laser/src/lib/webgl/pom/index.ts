export {
	createPomUniforms,
	toThreeUniforms,
	POM_DEFAULTS,
} from './uniforms';
export type { PomUniformValues, PomConfig } from './uniforms';

export {
	POM_MAX_STEPS,
	POM_VARYINGS,
	DERIVE_TANGENT,
	POM_MARCH,
	SPOM_SILHOUETTE,
	POM_SELF_SHADOW,
	HEIGHT_HELPERS,
} from './pom.glsl';

export {
	POM_SOURCE_BRICK,
	POM_SOURCE_LUMA,
	POM_SOURCE_MAP,
} from './PomMaterial';
export type { PomMaterialType } from './PomMaterial';

export { POM_WGSL_STUB } from './pom.wgsl';
