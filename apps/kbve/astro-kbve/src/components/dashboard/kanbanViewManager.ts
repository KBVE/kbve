import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const KEEP_WARM = 2;

export function initKanbanViewManager(): () => void {
	const sections = Array.from(
		document.querySelectorAll<HTMLElement>('.kb-section'),
	);
	if (sections.length === 0) return () => {};

	const total = sections.length;
	let centered = -1;

	const publishLive = (center: number) => {
		if (center === centered) return;
		centered = center;
		const live: number[] = [];
		for (let i = 0; i < total; i++) {
			if (Math.abs(i - center) <= KEEP_WARM) live.push(i);
		}
		document.documentElement.dataset.liveSections = live.join(',');
	};

	const reveal = (el: HTMLElement) =>
		gsap.to(el, {
			opacity: 1,
			y: 0,
			duration: 0.5,
			ease: 'power1.out',
			overwrite: 'auto',
		});

	gsap.set(sections, { y: 12 });

	const triggers = sections.map((section, i) =>
		ScrollTrigger.create({
			trigger: section,
			start: 'top 85%',
			end: 'bottom 15%',
			onEnter: () => reveal(section),
			onEnterBack: () => reveal(section),
			onToggle: (self) => {
				if (self.isActive) publishLive(i);
			},
		}),
	);

	// Seed the initial live-set from whichever section is nearest the top.
	const firstActive = triggers.findIndex((t) => t.isActive);
	publishLive(firstActive >= 0 ? firstActive : 0);
	ScrollTrigger.refresh();

	return () => {
		triggers.forEach((t) => t.kill());
		delete document.documentElement.dataset.liveSections;
	};
}
