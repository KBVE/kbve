import { describe, expect, it, vi, beforeEach } from 'vitest';

const doorwayAt = vi.fn();

vi.mock('../dungeon/collision', () => ({
	doorwayAt: (x: number, z: number) => doorwayAt(x, z),
	makeMover: () => () => {},
	registerBody: () => () => {},
}));

const { steerThroughDoorway } = await import('./goblinSim');

// TILE is 3, so a doorway tile spans 3 units but only passes within openHW
// (0.84-1.14) of its centre line. An NPC on the flow field arrives axis-aligned,
// which is what wedges it against the jamb.
const NS_DOOR = { ns: true, cx: 15, cz: 15, openHW: 0.9 };
const EW_DOOR = { ns: false, cx: 15, cz: 15, openHW: 0.9 };

describe('steerThroughDoorway', () => {
	beforeEach(() => doorwayAt.mockReset());

	it('does nothing away from a doorway', () => {
		doorwayAt.mockReturnValue(null);
		const v = { x: 2, z: 0 };
		steerThroughDoorway(0, 0, v, 2);
		expect(v).toEqual({ x: 2, z: 0 });
	});

	it('pulls toward the gap when offset past the opening', () => {
		doorwayAt.mockReturnValue(NS_DOOR);
		// Heading +x, but 1.4 north of the centre line — outside openHW 0.9,
		// i.e. aimed squarely at the frame.
		const v = { x: 2, z: 0 };
		steerThroughDoorway(15, 16.4, v, 2);
		expect(v.z).toBeLessThan(0); // steered back toward cz = 15
		expect(v.x).toBeGreaterThan(0); // still going through
	});

	it('steers on the x axis for an east/west opening', () => {
		doorwayAt.mockReturnValue(EW_DOOR);
		const v = { x: 0, z: 2 };
		steerThroughDoorway(13.6, 15, v, 2);
		expect(v.x).toBeGreaterThan(0);
	});

	it('leaves a centred NPC alone', () => {
		doorwayAt.mockReturnValue(NS_DOOR);
		const v = { x: 2, z: 0 };
		steerThroughDoorway(15, 15.05, v, 2);
		expect(v).toEqual({ x: 2, z: 0 });
	});

	it('never exceeds the speed cap', () => {
		doorwayAt.mockReturnValue(NS_DOOR);
		const v = { x: 2, z: 0 };
		steerThroughDoorway(15, 17.5, v, 2);
		expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(2 + 1e-6);
	});

	it('looks ahead so it corrects before reaching the frame', () => {
		// Not standing on a doorway, but one lies ahead along the heading.
		doorwayAt.mockImplementation((x: number) => (x > 14 ? NS_DOOR : null));
		const v = { x: 2, z: 0 };
		steerThroughDoorway(13.5, 16.4, v, 2);
		expect(v.z).toBeLessThan(0);
	});

	it('ignores a stationary NPC', () => {
		doorwayAt.mockReturnValue(NS_DOOR);
		const v = { x: 0, z: 0 };
		steerThroughDoorway(15, 16.4, v, 2);
		expect(v).toEqual({ x: 0, z: 0 });
	});
});
