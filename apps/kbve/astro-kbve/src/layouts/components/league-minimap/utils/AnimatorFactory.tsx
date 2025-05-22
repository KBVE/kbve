/** @jsxImportSource react */
import gsap from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import type { Stage } from './StageTypes';
import { stageDefinitions } from './StageStore';

gsap.registerPlugin(DrawSVGPlugin);

export type AnimatorContext = {
  shapeRefs: SVGPathElement[];
  textEl?: HTMLDivElement;
  bgContainerEl?: HTMLDivElement;
};

export class MapAnimator {
  constructor(private ctx: AnimatorContext) {}

  animate(stage: Stage): gsap.core.Timeline {
    return createStageTimeline(stage, this.ctx);
  }
}

export function createStageTimeline(stage: Stage, ctx: AnimatorContext): gsap.core.Timeline {
  const { shapeRefs, textEl, bgContainerEl } = ctx;
  const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

  shapeRefs.forEach((path, i) => {
    tl.set(path, {
      drawSVG: '0% 0%',
      opacity: 0,
    });
    tl.to(path, {
      drawSVG: '0% 100%',
      opacity: 1,
      duration: 1.2,
    }, `start+=${i * 0.06}`);
  });

  if (textEl) {
    tl.fromTo(
      textEl,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 1 },
      'start+=0.3'
    );
  }

  if (bgContainerEl) {
    const bg = createBGImage(stage, bgContainerEl);
    tl.to(
      bg,
      {
        opacity: 0.12,
        scale: 1.05,
        duration: 1.4,
        ease: 'power2.out',
        onComplete: () => cleanBGChildren(bgContainerEl),
      },
      'start+=0.1'
    );
  }

  return tl;
}

// [Helpers]

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
