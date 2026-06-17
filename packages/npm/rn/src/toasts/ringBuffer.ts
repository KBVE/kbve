export class RingBuffer<T> {
	private readonly items: (T | undefined)[];
	private head = 0;
	private count = 0;

	constructor(public readonly capacity: number) {
		if (capacity < 1) {
			throw new Error('RingBuffer capacity must be >= 1');
		}
		this.items = new Array(capacity);
	}

	get size(): number {
		return this.count;
	}

	get isFull(): boolean {
		return this.count === this.capacity;
	}

	push(item: T): T | undefined {
		const tail = (this.head + this.count) % this.capacity;
		let evicted: T | undefined;
		if (this.count === this.capacity) {
			evicted = this.items[this.head];
			this.head = (this.head + 1) % this.capacity;
		} else {
			this.count++;
		}
		this.items[tail] = item;
		return evicted;
	}

	last(n: number): T[] {
		const take = Math.min(n, this.count);
		const out: T[] = [];
		for (let i = this.count - take; i < this.count; i++) {
			out.push(this.items[(this.head + i) % this.capacity] as T);
		}
		return out;
	}

	toArray(): T[] {
		const out: T[] = [];
		for (let i = 0; i < this.count; i++) {
			out.push(this.items[(this.head + i) % this.capacity] as T);
		}
		return out;
	}

	clear(): void {
		this.head = 0;
		this.count = 0;
		this.items.fill(undefined);
	}
}
