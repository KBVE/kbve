import { ci } from './ci-failure';
import { issues } from './issues';
import { actions } from './actions';
import { pulls } from './pulls';
import { docker } from './docker';
import { context } from './types';
import { withGitHubRetry } from './retry';

export const gha = {
	ci,
	issues,
	actions,
	pulls,
	docker,
	context,
	withRetry: withGitHubRetry,
};
