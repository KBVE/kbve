import type { Stage } from './stageTypes';
import type { AnimatorContext } from './MapAnimatorFactory';
import { createStageTimeline } from './MapAnimatorFactory';

export class MapAnimator {
	constructor(private ctx: AnimatorContext) {}

	animate(stage: Stage) {
		return createStageTimeline(stage, this.ctx);
	}
}