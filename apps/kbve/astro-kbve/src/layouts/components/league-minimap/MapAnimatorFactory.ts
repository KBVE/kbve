import gsap from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import type { Stage } from './utils/StageTypes';
import { stageDefinitions } from './utils/StageStore';

gsap.registerPlugin(DrawSVGPlugin);


export type AnimatorContext = {
	shapeRefs: Record<'g1' | 'g2' | 'g3' | 'g4', SVGPathElement[]>;
	textEl?: HTMLDivElement;
	bgContainerEl?: HTMLDivElement;
};

export function createStageTimeline(stage: Stage, ctx: AnimatorContext): gsap.core.Timeline {
	switch (stage) {
		case 'read': return animateRead(ctx);
		case 'map': return animateMap(ctx);
		case 'home': return animateHome(ctx);
		case 'about': return animateHome(ctx);
	}
}

function animateRead({ shapeRefs, textEl, bgContainerEl }: AnimatorContext) {
	const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

	Object.values(shapeRefs).forEach((paths, i) => {
		tl.set(paths, {
			drawSVG: i % 2 === 0 ? '75% 100%' : '25% 0%',
		});
		tl.to(paths, {
			drawSVG: '0% 100%',
			duration: 1.3,
			stagger: 0.04,
		}, 'start');
	});

	if (textEl) {
		tl.to(textEl, {
			y: 0,
			opacity: 1,
			duration: 0.8,
		}, 'start');
	}

	if (bgContainerEl) {
		const bg = createBGImage('read', bgContainerEl);
		tl.to(bg, {
			opacity: 0.1,
			scale: 1,
			duration: 1.4,
			ease: 'power4.out',
			onComplete: () => cleanBGChildren(bgContainerEl)
		}, 'start+=0.1');
	}

	return tl;
}

function animateMap({ shapeRefs, textEl, bgContainerEl }: AnimatorContext) {
	const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

	Object.values(shapeRefs).forEach((paths, i) => {
		tl.set(paths, {
			drawSVG: i % 2 === 0 ? '0% 100%' : '100% 100%',
		});
		tl.fromTo(paths, {
			opacity: 0,
			scale: 0.8,
		}, {
			opacity: 1,
			scale: 1,
			drawSVG: '0% 100%',
			duration: 1.2,
			stagger: 0.05,
			transformOrigin: 'center center'
		}, 'start');
	});

	if (textEl) {
		tl.to(textEl, {
			y: -50,
			opacity: 1,
			duration: 0.8,
		}, 'start');
	}

	if (bgContainerEl) {
		const bg = createBGImage('map', bgContainerEl);
		tl.to(bg, {
			opacity: 0.15,
			scale: 1.1,
			rotateY: 10,
			duration: 1.5,
			ease: 'power3.out',
			transformOrigin: 'center',
			onComplete: () => cleanBGChildren(bgContainerEl)
		}, 'start+=0.1');
	}

	return tl;
}

function animateHome({ shapeRefs, textEl, bgContainerEl }: AnimatorContext) {
	const tl = gsap.timeline({ defaults: { ease: 'sine.out' } });

	Object.values(shapeRefs).forEach((paths) => {
		tl.set(paths, {
			drawSVG: '0% 0%',
			opacity: 0,
		});
		tl.to(paths, {
			drawSVG: '0% 100%',
			opacity: 1,
			duration: 1.2,
			stagger: 0.06,
		}, 'start');
	});

	if (textEl) {
		tl.fromTo(textEl, {
			y: 30,
			opacity: 0,
		}, {
			y: 0,
			opacity: 1,
			duration: 1,
		}, 'start+=0.3');
	}

	if (bgContainerEl) {
		const bg = createBGImage('home', bgContainerEl);
		tl.to(bg, {
			opacity: 0.12,
			scale: 1.05,
			duration: 1.4,
			ease: 'power2.out',
			onComplete: () => cleanBGChildren(bgContainerEl)
		}, 'start+=0.1');
	}

	return tl;
}

function createBGImage(stage: Stage, container: HTMLDivElement): HTMLImageElement {
	const img = document.createElement('img');
	img.src = stageDefinitions[stage].bg;
	img.className = 'absolute inset-0 w-full h-full object-cover';
	img.style.opacity = '0';
	container.appendChild(img);
	return img;
}

function cleanBGChildren(container: HTMLDivElement) {
	const children = Array.from(container.children);
	children.slice(0, -1).forEach((el) => el.remove());
}

