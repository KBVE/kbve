import {
	addEntity,
	addComponent,
	registerOwner,
	Prop,
	Transform3,
	type World,
} from '../mecs/props';

// Shared spawn prologue for every prop: allocate the entity, write its Prop link and
// Transform3, then commit the two components. Fields are written BEFORE the
// components are added, so a cross-thread reader (the sim worker) only ever matches
// a fully-populated entity. Callers add their type-specific components after.
export function spawnPropBase(
	world: World,
	kind: number,
	ownerEid: number,
	pos: [number, number, number],
	dir: [number, number, number],
): number {
	const eid = addEntity(world);
	Prop.kind[eid] = kind;
	Prop.ownerEid[eid] = ownerEid;
	Transform3.px[eid] = pos[0];
	Transform3.py[eid] = pos[1];
	Transform3.pz[eid] = pos[2];
	Transform3.dx[eid] = dir[0];
	Transform3.dy[eid] = dir[1];
	Transform3.dz[eid] = dir[2];
	addComponent(world, eid, Prop);
	addComponent(world, eid, Transform3);
	registerOwner(eid, ownerEid);
	return eid;
}
