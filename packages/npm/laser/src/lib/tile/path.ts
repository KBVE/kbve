export interface TileXY {
	x: number;
	y: number;
}

/**
 * BFS shortest path over a 4-neighbour grid, mirroring the server
 * (simgrid grid.rs find_path): neighbour order up/down/left/right, capped
 * length — identical inputs and tie-breaking keep client prediction and
 * server routes in sync. Returns the steps after `from` (excluding it), or
 * an empty array when the target is blocked or unreachable.
 */
export function findTilePath(
	from: TileXY,
	to: TileXY,
	isBlocked: (x: number, y: number) => boolean,
	maxLen = 64,
): TileXY[] {
	if ((from.x === to.x && from.y === to.y) || isBlocked(to.x, to.y)) {
		return [];
	}
	const key = (x: number, y: number) => `${x},${y}`;
	const prev = new Map<string, string | null>();
	prev.set(key(from.x, from.y), null);
	const queue: TileXY[] = [from];
	const dirs = [
		[0, -1],
		[0, 1],
		[-1, 0],
		[1, 0],
	];
	// The grid is conceptually unbounded here (callers only supply a blocked
	// predicate), so cap explored nodes to the reachable diamond for maxLen —
	// otherwise an unreachable target would expand the open plane forever.
	const explorationCap = (maxLen * 2 + 1) ** 2;
	let explored = 0;
	let found = false;
	while (queue.length) {
		if (++explored > explorationCap) return [];
		const cur = queue.shift()!;
		if (cur.x === to.x && cur.y === to.y) {
			found = true;
			break;
		}
		for (const [dx, dy] of dirs) {
			const nx = cur.x + dx;
			const ny = cur.y + dy;
			const k = key(nx, ny);
			if (prev.has(k) || isBlocked(nx, ny)) continue;
			prev.set(k, key(cur.x, cur.y));
			queue.push({ x: nx, y: ny });
		}
	}
	if (!found) return [];
	const path: TileXY[] = [];
	let cur: string | null = key(to.x, to.y);
	while (cur && cur !== key(from.x, from.y)) {
		const [x, y] = cur.split(',').map(Number);
		path.push({ x, y });
		cur = prev.get(cur) ?? null;
		if (path.length > maxLen) return [];
	}
	path.reverse();
	return path;
}
