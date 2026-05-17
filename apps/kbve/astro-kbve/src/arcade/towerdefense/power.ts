import type { Building, BatteryBuilding } from './types';

const cellKey = (c: number, r: number) => `${c},${r}`;

export interface PowerComponent {
	buildings: Building[];
	supply: number;
	demand: number;
	hasGenerator: boolean;
	totalBatteryCharge: number;
	totalBatteryCapacity: number;
}

export interface PowerResult {
	components: PowerComponent[];
	componentForBuilding: Map<number, PowerComponent>;
	totalSupply: number;
	totalDemand: number;
	totalBatteryCharge: number;
	totalBatteryCapacity: number;
}

export function buildComponents(buildings: Building[]): PowerResult {
	const tileMap = new Map<string, Building>();
	for (const b of buildings) {
		if (b.destroyed) continue;
		tileMap.set(cellKey(b.col, b.row), b);
	}

	const visited = new Set<number>();
	const components: PowerComponent[] = [];
	const componentForBuilding = new Map<number, PowerComponent>();

	for (const seed of buildings) {
		if (seed.destroyed) continue;
		if (visited.has(seed.id)) continue;
		const comp: PowerComponent = {
			buildings: [],
			supply: 0,
			demand: 0,
			hasGenerator: false,
			totalBatteryCharge: 0,
			totalBatteryCapacity: 0,
		};
		const queue: Building[] = [seed];
		visited.add(seed.id);
		while (queue.length > 0) {
			const b = queue.shift()!;
			comp.buildings.push(b);
			componentForBuilding.set(b.id, comp);
			if (b.kind === 'generator') {
				comp.hasGenerator = true;
				comp.supply += b.spec.power;
			} else if (b.kind === 'tower') {
				comp.demand += b.spec.power;
			} else if (b.kind === 'repair') {
				comp.demand += b.spec.power;
			} else if (b.kind === 'battery') {
				comp.totalBatteryCharge += b.charge;
				comp.totalBatteryCapacity += b.capacity;
			}
			const neighbors = [
				tileMap.get(cellKey(b.col + 1, b.row)),
				tileMap.get(cellKey(b.col - 1, b.row)),
				tileMap.get(cellKey(b.col, b.row + 1)),
				tileMap.get(cellKey(b.col, b.row - 1)),
			];
			for (const n of neighbors) {
				if (!n) continue;
				if (n.destroyed) continue;
				if (visited.has(n.id)) continue;
				visited.add(n.id);
				queue.push(n);
			}
		}
		components.push(comp);
	}

	let totalSupply = 0;
	let totalDemand = 0;
	let totalBatteryCharge = 0;
	let totalBatteryCapacity = 0;
	for (const c of components) {
		totalSupply += c.supply;
		totalDemand += c.demand;
		totalBatteryCharge += c.totalBatteryCharge;
		totalBatteryCapacity += c.totalBatteryCapacity;
	}

	return {
		components,
		componentForBuilding,
		totalSupply,
		totalDemand,
		totalBatteryCharge,
		totalBatteryCapacity,
	};
}

export function applyPowerTick(
	buildings: Building[],
	powerResult: PowerResult,
	dt: number,
): void {
	for (const comp of powerResult.components) {
		if (!comp.hasGenerator) {
			for (const b of comp.buildings) {
				if (b.kind === 'tower') b.online = false;
				if (b.kind === 'repair') b.online = false;
				if (b.kind === 'generator') b.online = false;
				if (b.kind === 'wire') b.powered = false;
			}
			continue;
		}

		for (const b of comp.buildings) {
			if (b.kind === 'generator') b.online = true;
			if (b.kind === 'wire') b.powered = true;
		}

		const net = comp.supply - comp.demand;
		const batteries = comp.buildings.filter(
			(b) => b.kind === 'battery',
		) as BatteryBuilding[];

		const consumers = comp.buildings.filter(
			(b) => b.kind === 'tower' || b.kind === 'repair',
		) as Array<Building & { online: boolean; spec: { power: number } }>;
		consumers.sort((a, b) => a.id - b.id);

		if (net >= 0) {
			for (const c of consumers) {
				if (c.kind === 'tower' || c.kind === 'repair') c.online = true;
			}
			let surplus = net * dt * 6;
			for (const bat of batteries) {
				if (surplus <= 0) break;
				const room = bat.capacity - bat.charge;
				const add = Math.min(room, surplus);
				bat.charge += add;
				surplus -= add;
			}
		} else {
			const deficit = -net;
			const drawPerSec = deficit;
			let drained = 0;
			const drainBudget = drawPerSec * dt;
			for (const bat of batteries) {
				if (drained >= drainBudget) break;
				const take = Math.min(bat.charge, drainBudget - drained);
				bat.charge -= take;
				drained += take;
			}
			const totalCharge = batteries.reduce((s, b) => s + b.charge, 0);
			const effectiveSupply =
				totalCharge > 0 ? comp.supply + deficit : comp.supply;
			let powerRemaining = effectiveSupply;
			for (const c of consumers) {
				const cost = (c.spec as { power: number }).power;
				if (powerRemaining >= cost) {
					if (c.kind === 'tower' || c.kind === 'repair')
						c.online = true;
					powerRemaining -= cost;
				} else {
					if (c.kind === 'tower' || c.kind === 'repair')
						c.online = false;
				}
			}
		}

		comp.totalBatteryCharge = batteries.reduce((s, b) => s + b.charge, 0);
	}

	for (const b of buildings) {
		if (b.destroyed) continue;
		const inComp = powerResult.componentForBuilding.get(b.id);
		if (!inComp) {
			if (b.kind === 'tower') b.online = false;
			if (b.kind === 'repair') b.online = false;
			if (b.kind === 'generator') b.online = false;
			if (b.kind === 'wire') b.powered = false;
		}
	}
}
