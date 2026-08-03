import professiondbRuntime from '@kbve/professiondb-data';
import mapdbData from '@kbve/mapdb-data';

// professiondb defines what an action yields; mapdb defines the world object the
// action is performed on. The two are joined by professiondb.resourceNodeRef ->
// mapdb.objectDefs[].ref, with mapdb carrying professionActionRef back the other
// way. Neither DB is authored here — both are codegen output from the MDX.

export interface ActionOutput {
	itemRef: string;
	quantity: number;
	chance?: number;
}

export interface ProfessionAction {
	ref: string;
	name: string;
	requiredLevel: number;
	xpReward: number;
	durationMs?: number;
	toolRefs?: string[];
	outputs: ActionOutput[];
	resourceNodeRef?: string;
}

export interface ResourceNode {
	ref: string;
	name: string;
	subKind: string;
	harvestYield: number;
	maxAmount: number;
	harvestTimeMs: number;
	spawnWeight: number;
	professionActionRef: string;
}

interface RuntimeProfession {
	ref: string;
	name: string;
	maxLevel: number;
	experienceCurve: {
		kind: string;
		baseXp: number;
		growthFactor?: number;
		maxLevel: number;
	};
	actions: ProfessionAction[];
}

const runtime = professiondbRuntime as { professions: RuntimeProfession[] };
const mapdb = mapdbData as {
	objectDefs?: (Partial<ResourceNode> & {
		ref?: string;
		type?: string;
		drafted?: boolean;
	})[];
};

const RESOURCE_NODE_TYPE = 'WORLD_OBJECT_RESOURCE_NODE';

export function profession(ref: string): RuntimeProfession | undefined {
	return runtime.professions.find((p) => p.ref === ref);
}

export function actionsOf(professionRef: string): ProfessionAction[] {
	return profession(professionRef)?.actions ?? [];
}

/** Resource nodes whose professionActionRef lands in the given profession. */
export function nodesOf(professionRef: string): ResourceNode[] {
	const byRef = new Map(actionsOf(professionRef).map((a) => [a.ref, a]));
	const out: ResourceNode[] = [];
	for (const def of mapdb.objectDefs ?? []) {
		if (def.drafted) continue;
		if (def.type !== RESOURCE_NODE_TYPE) continue;
		if (!def.ref || !def.professionActionRef) continue;
		if (!byRef.has(def.professionActionRef)) continue;
		out.push({
			ref: def.ref,
			name: def.name ?? def.ref,
			subKind: def.subKind ?? '',
			harvestYield: def.harvestYield ?? 1,
			maxAmount: def.maxAmount ?? 1,
			harvestTimeMs: def.harvestTimeMs ?? 0,
			spawnWeight: def.spawnWeight ?? 0,
			professionActionRef: def.professionActionRef,
		});
	}
	out.sort((a, b) => a.ref.localeCompare(b.ref));
	return out;
}

export function actionOf(
	professionRef: string,
	actionRef: string,
): ProfessionAction | undefined {
	return actionsOf(professionRef).find((a) => a.ref === actionRef);
}

/** Level cost curve, evaluated from the profession's own experienceCurve. */
export function xpForLevel(professionRef: string, level: number): number {
	const curve = profession(professionRef)?.experienceCurve;
	if (!curve || level <= 0) return 0;
	const growth = curve.growthFactor ?? 1;
	switch (curve.kind) {
		case 'CURVE_KIND_LINEAR':
			return curve.baseXp * level;
		case 'CURVE_KIND_EXPONENTIAL':
			return Math.round(curve.baseXp * Math.pow(growth, level));
		case 'CURVE_KIND_POLYNOMIAL':
		default:
			return Math.round(curve.baseXp * Math.pow(level, growth));
	}
}

export function maxLevelOf(professionRef: string): number {
	return profession(professionRef)?.maxLevel ?? 99;
}
