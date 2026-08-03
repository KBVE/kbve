import { describe, expect, it } from 'vitest';
import {
	CharacterMotor,
	DEFAULT_MOTOR,
	FixedStep,
	MOTOR_DT,
	MOTOR_MAX_STEPS,
} from './CharacterMotor';

// Drives a motor through FixedStep over an explicit list of frame deltas, so
// every case simulates exactly the same total time — deriving the frame count
// from a duration would let one rate sneak in an extra frame and fail for a
// reason that has nothing to do with the stepper.
function travel(frameDts: number[]): number {
	const motor = new CharacterMotor(DEFAULT_MOTOR);
	const stepper = new FixedStep();
	motor.setDesiredVelocity(0, DEFAULT_MOTOR.walkSpeed);
	for (const frame of frameDts) stepper.run(frame, (dt) => motor.update(dt));
	return motor.position.z;
}

/** `count` frames of `dt`, i.e. exactly count*dt seconds of wall time. */
function steady(count: number, dt: number): number[] {
	return Array.from({ length: count }, () => dt);
}

describe('FixedStep', () => {
	it('runs whole steps and carries the remainder', () => {
		const s = new FixedStep(0.1, 100);
		const seen: number[] = [];
		expect(s.run(0.25, (dt) => seen.push(dt))).toBe(2);
		expect(seen).toEqual([0.1, 0.1]);
		expect(s.pending).toBeCloseTo(0.05, 10);
		// The carried 0.05 plus 0.06 is one more whole step, not zero.
		expect(s.run(0.06, () => {})).toBe(1);
	});

	it('drops the backlog instead of repaying a long stall at once', () => {
		const s = new FixedStep(0.1, 3);
		expect(s.run(10, () => {})).toBe(3);
		expect(s.pending).toBe(0);
	});

	it('never advances on a frame shorter than one step', () => {
		const s = new FixedStep(0.1, 8);
		expect(s.run(0.04, () => {})).toBe(0);
		expect(s.run(0.04, () => {})).toBe(0);
		expect(s.run(0.04, () => {})).toBe(1);
	});

	// The reason this exists: the same input held for the same wall time has to
	// move the player the same distance regardless of frame rate, or prediction
	// and server reconciliation have nothing stable to agree on.
	it('travels the same distance at 30, 60 and 144Hz', () => {
		// All three cover exactly 4 seconds.
		const at30 = travel(steady(120, 1 / 30));
		const at60 = travel(steady(240, 1 / 60));
		const at144 = travel(steady(576, 1 / 144));
		expect(at60).toBeCloseTo(at30, 1);
		expect(at144).toBeCloseTo(at30, 1);
	});

	it('travels the same distance on a stuttering frame pattern', () => {
		const pattern = [1 / 120, 1 / 30, 1 / 90, 1 / 45, 1 / 240];
		const jitterFrames = Array.from(
			{ length: 275 },
			(_, i) => pattern[i % pattern.length],
		);
		// Match the even run to the jittery run's exact total, rather than to a
		// nominal 4s — an uneven cycle length would otherwise hand one run more
		// simulated time and fail for that reason alone.
		const total = jitterFrames.reduce((a, b) => a + b, 0);
		const even = travel(steady(240, total / 240));
		const jittery = travel(jitterFrames);
		expect(jittery).toBeCloseTo(even, 1);
	});

	it('exposes a step no longer than a display frame at 60Hz', () => {
		// Guards the choice of MOTOR_DT: at 1/60 a 60Hz frame straddles the step
		// boundary and takes 0 or 2 steps, which reads as judder.
		expect(MOTOR_DT).toBeLessThan(1 / 60);
		expect(MOTOR_MAX_STEPS * MOTOR_DT).toBeGreaterThanOrEqual(0.05);
	});
});
