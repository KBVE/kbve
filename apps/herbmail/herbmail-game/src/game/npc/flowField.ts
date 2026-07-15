import { TILE } from '../config';
import { solidAtWorld, pitAtWorld } from '../dungeon/collision';

const R = 16;
const SIZE = R * 2 + 1;
const AREA = SIZE * SIZE;

const cost = new Int16Array(AREA);
const dirX = new Float32Array(AREA);
const dirZ = new Float32Array(AREA);
const queue = new Int32Array(AREA);

let cornerC = 0;
let cornerR = 0;
let centerC = Number.POSITIVE_INFINITY;
let centerR = Number.POSITIVE_INFINITY;

const STEPS: [number, number][] = [
	[0, -1],
	[0, 1],
	[-1, 0],
	[1, 0],
];

function walkable(wc: number, wr: number): boolean {
	const x = (wc + 0.5) * TILE;
	const z = (wr + 0.5) * TILE;
	return !solidAtWorld(x, z) && !pitAtWorld(x, z);
}

export function invalidateFlowField(): void {
	centerC = Number.POSITIVE_INFINITY;
	centerR = Number.POSITIVE_INFINITY;
}

export function updateFlowField(px: number, pz: number): void {
	const pc = Math.floor(px / TILE);
	const pr = Math.floor(pz / TILE);
	if (pc === centerC && pr === centerR) return;
	centerC = pc;
	centerR = pr;
	cornerC = pc - R;
	cornerR = pr - R;
	cost.fill(-1);
	let head = 0;
	let tail = 0;
	const ci = R * SIZE + R;
	cost[ci] = 0;
	dirX[ci] = 0;
	dirZ[ci] = 0;
	queue[tail++] = ci;
	while (head < tail) {
		const i = queue[head++];
		const lc = i % SIZE;
		const lr = (i - lc) / SIZE;
		const next = cost[i] + 1;
		for (const [sc, sr] of STEPS) {
			const nc = lc + sc;
			const nr = lr + sr;
			if (nc < 0 || nc >= SIZE || nr < 0 || nr >= SIZE) continue;
			const ni = nr * SIZE + nc;
			if (cost[ni] !== -1) continue;
			if (!walkable(cornerC + nc, cornerR + nr)) {
				cost[ni] = -2;
				continue;
			}
			cost[ni] = next;
			dirX[ni] = -sc;
			dirZ[ni] = -sr;
			queue[tail++] = ni;
		}
	}
}

export interface FlowSample {
	x: number;
	z: number;
	cost: number;
}

const sampleOut: FlowSample = { x: 0, z: 0, cost: 0 };

export function sampleFlow(x: number, z: number): FlowSample | null {
	const lc = Math.floor(x / TILE) - cornerC;
	const lr = Math.floor(z / TILE) - cornerR;
	if (lc < 0 || lc >= SIZE || lr < 0 || lr >= SIZE) return null;
	const i = lr * SIZE + lc;
	if (cost[i] < 0) return null;
	sampleOut.x = dirX[i];
	sampleOut.z = dirZ[i];
	sampleOut.cost = cost[i];
	return sampleOut;
}
