import { cn } from '@kbve/astro';

export function CnTest() {
	const merged = cn('px-4 py-2', 'px-8', 'font-bold');

	return (
		<div data-testid="cn-test">
			<div data-testid="cn-result" data-value={merged}>
				Merged classes: {merged}
			</div>
		</div>
	);
}
