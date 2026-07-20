import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface LabelItem {
	id: string;
	x: number;
	y: number;
	text: string;
	tier: 'dir' | 'file';
	priority: number;
}

interface Props {
	host: HTMLDivElement | null;
	items: LabelItem[];
	maxVisible: number;
	/** Current opacity of the tier these labels belong to (0 hides them). */
	opacityRef: React.MutableRefObject<number>;
}

/**
 * Projects a set of world-space label anchors to screen space every frame and
 * positions pooled DOM spans imperatively — crisp, camera-facing text with no
 * per-frame React re-render. Culls to the viewport and shows only the
 * highest-priority `maxVisible` labels so dense tiers stay readable.
 */
export default function GraphLabels({
	host,
	items,
	maxVisible,
	opacityRef,
}: Props) {
	const { camera, size } = useThree();
	const spans = useRef<HTMLSpanElement[]>([]);
	const v = useRef(new THREE.Vector3());

	// Pool spans to the number we may show at once.
	useEffect(() => {
		if (!host) return;
		const need = maxVisible;
		while (spans.current.length < need) {
			const el = document.createElement('span');
			el.className = 'mgx__label';
			el.style.display = 'none';
			host.appendChild(el);
			spans.current.push(el);
		}
		return () => {
			for (const el of spans.current) el.remove();
			spans.current = [];
		};
	}, [host, maxVisible]);

	useFrame(() => {
		const pool = spans.current;
		if (!pool.length) return;
		const op = opacityRef.current;
		if (op < 0.05) {
			for (const el of pool) el.style.display = 'none';
			return;
		}
		const cx = size.width / 2;
		const cy = size.height / 2;
		const cand: { px: number; py: number; text: string; pr: number }[] = [];
		for (const it of items) {
			v.current.set(it.x, it.y, 0).project(camera);
			if (Math.abs(v.current.x) > 1 || Math.abs(v.current.y) > 1) continue;
			const px = (v.current.x * 0.5 + 0.5) * size.width;
			const py = (-v.current.y * 0.5 + 0.5) * size.height;
			// Prefer higher tier priority, then proximity to viewport centre.
			const dist = Math.hypot(px - cx, py - cy);
			cand.push({ px, py, text: it.text, pr: it.priority * 1e6 - dist });
		}
		cand.sort((a, b) => b.pr - a.pr);
		const n = Math.min(cand.length, pool.length);
		for (let i = 0; i < n; i++) {
			const el = pool[i];
			const c = cand[i];
			el.textContent = c.text;
			el.style.display = 'block';
			el.style.opacity = String(op);
			el.style.transform = `translate(-50%, -140%) translate(${c.px}px, ${c.py}px)`;
		}
		for (let i = n; i < pool.length; i++) pool[i].style.display = 'none';
	});

	return null;
}
