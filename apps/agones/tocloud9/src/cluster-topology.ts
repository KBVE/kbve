export const ROUTABLE_ADDRESS = /^\d{1,3}(\.\d{1,3}){3}:\d+$/;

export const ADDRESS_FIELDS = [
	'Address',
	'GRPCAddress',
	'HealthCheckAddr',
] as const;

export interface WorldServer {
	Address?: string;
	GRPCAddress?: string;
	HealthCheckAddr?: string;
	RealmID?: number;
	AssignedMapsToHandle?: number[];
}

export interface MapConflict {
	map: number;
	owners: string[];
}

export function isRoutableAddress(value: string | undefined): boolean {
	return (
		typeof value === 'string' &&
		ROUTABLE_ADDRESS.test(value) &&
		!value.startsWith('127.')
	);
}

// A map handled by two worldservers means the registry handed the same shard
// out twice, which is the failure the whole bin-packing scheme exists to avoid.
export function mapOwnerConflicts(
	servers: Record<string, WorldServer>,
): MapConflict[] {
	const owners = new Map<number, string[]>();
	for (const [key, server] of Object.entries(servers)) {
		for (const map of server.AssignedMapsToHandle ?? []) {
			const held = owners.get(map);
			held ? held.push(key) : owners.set(map, [key]);
		}
	}
	return [...owners]
		.filter(([, held]) => held.length > 1)
		.map(([map, held]) => ({ map, owners: held }));
}

export function assignedMapCount(servers: Record<string, WorldServer>): number {
	const maps = new Set<number>();
	for (const server of Object.values(servers)) {
		for (const map of server.AssignedMapsToHandle ?? []) maps.add(map);
	}
	return maps.size;
}
