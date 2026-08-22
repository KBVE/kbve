import { WorkflowDefSchema } from './generated/workflow-schema';
import type { WorkflowDef } from './generated/workflow-schema';

export const WORKFLOWS: readonly WorkflowDef[] = [
	{
		key: 'poem',
		backend: 'windmill',
		path: 'f/web/poem',
		tier: 'user',
		surface: 'web',
		label: 'Poem',
	},
	{
		key: 'joke',
		backend: 'windmill',
		path: 'f/web/joke',
		tier: 'user',
		surface: 'web',
		label: 'Joke',
	},
	{
		key: 'urban',
		backend: 'windmill',
		path: 'f/web/urban',
		tier: 'user',
		surface: 'web',
		label: 'Urban Dictionary',
	},
	{
		key: 'advice',
		backend: 'windmill',
		path: 'f/web/advice',
		tier: 'user',
		surface: 'web',
		label: 'Advice',
	},
].map((w) => WorkflowDefSchema.parse(w));

export function workflowByKey(key: string): WorkflowDef | undefined {
	return WORKFLOWS.find((w) => w.key === key);
}
