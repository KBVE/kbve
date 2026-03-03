import type { Bounds2D, Point2D, Range } from '../core/types';

export class Quadtree {
	private bounds: Bounds2D;
	private capacity: number;
	private points: Range[];
	private divided: boolean;
	private cache: Map<string, Range[]>;
	private northeast?: Quadtree;
	private northwest?: Quadtree;
	private southeast?: Quadtree;
	private southwest?: Quadtree;

	constructor(bounds: Bounds2D, capacity = 4) {
		this.bounds = bounds;
		this.capacity = capacity;
		this.points = [];
		this.divided = false;
		this.cache = new Map();
	}

	private subdivide(): void {
		const { xMin, yMin, xMax, yMax } = this.bounds;
		const w = (xMax - xMin) / 2;
		const h = (yMax - yMin) / 2;
		const x = xMin;
		const y = yMin;

		this.northeast = new Quadtree(
			{ xMin: x + w, xMax: x + 2 * w, yMin, yMax: y + h },
			this.capacity,
		);
		this.northwest = new Quadtree(
			{ xMin, xMax: x + w, yMin, yMax: y + h },
			this.capacity,
		);
		this.southeast = new Quadtree(
			{ xMin: x + w, xMax: x + 2 * w, yMin: y + h, yMax: y + 2 * h },
			this.capacity,
		);
		this.southwest = new Quadtree(
			{ xMin, xMax: x + w, yMin: y + h, yMax: y + 2 * h },
			this.capacity,
		);

		this.divided = true;
	}

	public insert(range: Range): boolean {
		if (!this.contains(range.bounds)) {
			return false;
		}

		if (this.points.length < this.capacity) {
			this.points.push(range);
			return true;
		}

		if (!this.divided) {
			this.subdivide();
		}

		if (this.northeast?.insert(range)) return true;
		if (this.northwest?.insert(range)) return true;
		if (this.southeast?.insert(range)) return true;
		if (this.southwest?.insert(range)) return true;

		return false;
	}

	private contains(bounds: Bounds2D): boolean {
		const { xMin, yMin, xMax, yMax } = this.bounds;
		return (
			bounds.xMin >= xMin &&
			bounds.xMax <= xMax &&
			bounds.yMin >= yMin &&
			bounds.yMax <= yMax
		);
	}

	public queryRange(range: Bounds2D, found: Range[] = []): Range[] {
		if (!this.intersects(range)) {
			return found;
		}

		for (const p of this.points) {
			if (this.isWithinBounds(p.bounds, range)) {
				found.push(p);
			}
		}

		if (this.divided) {
			this.northwest?.queryRange(range, found);
			this.northeast?.queryRange(range, found);
			this.southwest?.queryRange(range, found);
			this.southeast?.queryRange(range, found);
		}

		return found;
	}

	public query(point: Point2D, found: Range[] = []): Range[] {
		const cacheKey = `${point.x},${point.y}`;

		const cachedResult = this.cache.get(cacheKey);
		if (cachedResult) {
			return cachedResult;
		}

		if (
			!this.intersects({
				xMin: point.x,
				xMax: point.x,
				yMin: point.y,
				yMax: point.y,
			})
		) {
			return found;
		}

		for (const p of this.points) {
			if (this.isWithinRange(point, p.bounds)) {
				found.push(p);
			}
		}

		if (this.divided) {
			this.northwest?.query(point, found);
			this.northeast?.query(point, found);
			this.southwest?.query(point, found);
			this.southeast?.query(point, found);
		}

		this.cache.set(cacheKey, found);

		return found;
	}

	private intersects(range: Bounds2D): boolean {
		const { xMin, yMin, xMax, yMax } = this.bounds;
		return !(
			range.xMin > xMax ||
			range.xMax < xMin ||
			range.yMin > yMax ||
			range.yMax < yMin
		);
	}

	private isWithinBounds(
		pointBounds: Bounds2D,
		queryBounds: Bounds2D,
	): boolean {
		return (
			pointBounds.xMax >= queryBounds.xMin &&
			pointBounds.xMin <= queryBounds.xMax &&
			pointBounds.yMax >= queryBounds.yMin &&
			pointBounds.yMin <= queryBounds.yMax
		);
	}

	private isWithinRange(point: Point2D, bounds: Bounds2D): boolean {
		return (
			point.x >= bounds.xMin &&
			point.x <= bounds.xMax &&
			point.y >= bounds.yMin &&
			point.y <= bounds.yMax
		);
	}
}
