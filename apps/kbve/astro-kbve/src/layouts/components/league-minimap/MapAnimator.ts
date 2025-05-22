import type { Stage } from './utils/StageTypes';
import type { AnimatorContext } from './MapAnimatorFactory';
import { createStageTimeline } from './MapAnimatorFactory';

export class MapAnimator {
	constructor(private ctx: AnimatorContext) {}

	animate(stage: Stage) {
		return createStageTimeline(stage, this.ctx);
	}
}