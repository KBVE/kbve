import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { autoQuality, reapplyPom, stepDown, stepUp } from './qualityStore';

// Drop a tier after DOWN_HOLD seconds under DOWN_FPS; climb back only after
// UP_HOLD seconds clear of UP_FPS. Asymmetric holds (fall fast, rise slow) keep
// it from oscillating around a threshold. UP_FPS sits above DOWN_FPS so a tier
// that lands between them is stable.
const DOWN_FPS = 45;
const UP_FPS = 57;
const DOWN_HOLD = 2;
const UP_HOLD = 8;

export function AdaptiveQuality() {
	const ms = useRef(16.7);
	const acc = useRef(0);
	const low = useRef(0);
	const high = useRef(0);

	useFrame((_, delta) => {
		ms.current += (delta * 1000 - ms.current) * 0.1;
		acc.current += delta;
		if (acc.current < 1) return;
		acc.current = 0;

		reapplyPom();
		if (!autoQuality()) return;

		const fps = 1000 / ms.current;
		if (fps < DOWN_FPS) {
			low.current++;
			high.current = 0;
		} else if (fps > UP_FPS) {
			high.current++;
			low.current = 0;
		} else {
			low.current = 0;
			high.current = 0;
		}

		if (low.current >= DOWN_HOLD) {
			if (stepDown()) low.current = 0;
		} else if (high.current >= UP_HOLD) {
			if (stepUp()) high.current = 0;
		}
	});

	return null;
}
