import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

const ROUTE = '/api/v1/yuki/chat';
const READ_DEADLINE_MS = 10_000;

interface SseEvent {
	event?: string;
	data: string;
}

async function readSseStream(
	body: ReadableStream<Uint8Array>,
	maxMs = READ_DEADLINE_MS,
): Promise<SseEvent[]> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	const events: SseEvent[] = [];
	let buffer = '';
	const deadline = Date.now() + maxMs;
	let pendingEvent: string | undefined;
	let pendingData = '';

	const flushPending = () => {
		if (pendingData || pendingEvent) {
			events.push({ event: pendingEvent, data: pendingData });
		}
		pendingEvent = undefined;
		pendingData = '';
	};

	while (Date.now() < deadline) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let nl;
		while ((nl = buffer.indexOf('\n')) !== -1) {
			const line = buffer.slice(0, nl).replace(/\r$/, '');
			buffer = buffer.slice(nl + 1);
			if (line === '') {
				flushPending();
				continue;
			}
			if (line.startsWith(':')) continue;
			if (line.startsWith('event:')) {
				pendingEvent = line.slice(6).trim();
			} else if (line.startsWith('data:')) {
				const chunk = line.slice(5).replace(/^ /, '');
				pendingData = pendingData ? `${pendingData}\n${chunk}` : chunk;
			}
		}
		if (events.some((e) => e.event === 'done')) break;
	}
	flushPending();
	try {
		await reader.cancel();
	} catch {
		void 0;
	}
	return events;
}

describe('Yuki SSE chat stream', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('returns text/event-stream for a non-empty prompt', async () => {
		const res = await fetch(`${BASE_URL}${ROUTE}?q=hello`);
		expect(res.status).toBe(200);
		const ct = (res.headers.get('content-type') ?? '').toLowerCase();
		expect(ct).toMatch(/text\/event-stream/);
		await res.body?.cancel();
	});

	it('rejects empty prompts with 400', async () => {
		const res = await fetch(`${BASE_URL}${ROUTE}?q=`);
		expect(res.status).toBe(400);
	});

	it('rejects whitespace-only prompts with 400', async () => {
		const res = await fetch(`${BASE_URL}${ROUTE}?q=%20%20%20`);
		expect(res.status).toBe(400);
	});

	it('rejects missing prompt with 4xx', async () => {
		const res = await fetch(`${BASE_URL}${ROUTE}`);
		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(res.status).toBeLessThan(500);
	});

	it('streams data chunks then terminates with event: done', async () => {
		const res = await fetch(`${BASE_URL}${ROUTE}?q=ping`);
		expect(res.status).toBe(200);
		expect(res.body).not.toBeNull();
		const events = await readSseStream(res.body!);

		const data = events.filter((e) => !e.event && e.data.length > 0);
		expect(data.length).toBeGreaterThan(0);

		const terminator = events.find((e) => e.event === 'done');
		expect(terminator).toBeDefined();

		const assembled = data.map((e) => e.data).join(' ');
		expect(assembled.length).toBeGreaterThan(0);
		expect(assembled).toMatch(/^[\x09\x0a\x0d\x20-\x7e -￿]+$/);
	});

	it('echoes the trimmed prompt in the assembled reply (Phase C canned)', async () => {
		const prompt = 'sse-smoke-1234';
		const res = await fetch(
			`${BASE_URL}${ROUTE}?q=${encodeURIComponent(prompt)}`,
		);
		expect(res.status).toBe(200);
		const events = await readSseStream(res.body!);
		const assembled = events
			.filter((e) => !e.event)
			.map((e) => e.data)
			.join(' ');
		expect(assembled).toContain(prompt);
	});
});
