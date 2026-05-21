import { Position } from '../components';

export interface SpatialGridConfig {
	cellSize: number;
	worldWidth: number;
	worldHeight: number;
}

export class EnemySpatialGrid {
	private readonly cellSize: number;
	private readonly cols: number;
	private readonly rows: number;
	private readonly buckets: number[][];

	constructor({ cellSize, worldWidth, worldHeight }: SpatialGridConfig) {
		this.cellSize = cellSize;
		this.cols = Math.ceil(worldWidth / cellSize);
		this.rows = Math.ceil(worldHeight / cellSize);
		this.buckets = new Array(this.cols * this.rows);
		for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
	}

	rebuild(eids: ArrayLike<number>, isAlive: (eid: number) => boolean): void {
		const buckets = this.buckets;
		for (let i = 0; i < buckets.length; i++) buckets[i].length = 0;
		const { cellSize, cols, rows } = this;
		for (let i = 0; i < eids.length; i++) {
			const eid = eids[i];
			if (!isAlive(eid)) continue;
			let col = Math.floor(Position.x[eid] / cellSize);
			let row = Math.floor(Position.y[eid] / cellSize);
			if (col < 0) col = 0;
			else if (col >= cols) col = cols - 1;
			if (row < 0) row = 0;
			else if (row >= rows) row = rows - 1;
			buckets[row * cols + col].push(eid);
		}
	}

	forEachInRange(
		cx: number,
		cy: number,
		range: number,
		isAlive: (eid: number) => boolean,
		fn: (eid: number) => void,
	): void {
		const { cellSize, cols, rows, buckets } = this;
		let minCol = Math.floor((cx - range) / cellSize);
		let maxCol = Math.floor((cx + range) / cellSize);
		let minRow = Math.floor((cy - range) / cellSize);
		let maxRow = Math.floor((cy + range) / cellSize);
		if (minCol < 0) minCol = 0;
		if (minRow < 0) minRow = 0;
		if (maxCol >= cols) maxCol = cols - 1;
		if (maxRow >= rows) maxRow = rows - 1;
		const rangeSq = range * range;
		for (let r = minRow; r <= maxRow; r++) {
			const rowOff = r * cols;
			for (let c = minCol; c <= maxCol; c++) {
				const bucket = buckets[rowOff + c];
				for (let i = 0; i < bucket.length; i++) {
					const eid = bucket[i];
					if (!isAlive(eid)) continue;
					const dx = Position.x[eid] - cx;
					const dy = Position.y[eid] - cy;
					if (dx * dx + dy * dy > rangeSq) continue;
					fn(eid);
				}
			}
		}
	}
}
