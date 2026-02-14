import { cn } from '@kbve/astro';

export function CnEdgeCaseTest() {
	const cases = [
		{ label: 'empty', result: cn() },
		{ label: 'single-class', result: cn('px-4') },
		{ label: 'undefined-input', result: cn(undefined) },
		{ label: 'null-input', result: cn(null) },
		{ label: 'false-input', result: cn(false) },
		{ label: 'empty-string', result: cn('') },
		{ label: 'mixed-falsy', result: cn('', undefined, null, false, 'text-red-500') },
		{ label: 'conditional-object', result: cn({ 'bg-blue-500': true, 'bg-red-500': false, 'text-white': true }) },
		{ label: 'array-input', result: cn(['px-4', 'py-2', 'font-bold']) },
		{ label: 'nested-array', result: cn(['px-4', ['py-2', ['font-bold']]]) },
		{ label: 'tailwind-conflict-padding', result: cn('px-4 py-2', 'px-8') },
		{ label: 'tailwind-conflict-margin', result: cn('mx-2 my-4', 'mx-6') },
		{ label: 'tailwind-conflict-text', result: cn('text-sm text-red-500', 'text-lg') },
		{ label: 'tailwind-conflict-bg', result: cn('bg-blue-500', 'bg-green-300') },
		{ label: 'responsive-classes', result: cn('text-sm md:text-lg lg:text-xl', 'text-base') },
		{ label: 'dark-mode', result: cn('bg-white dark:bg-gray-900', 'bg-gray-100') },
		{ label: 'arbitrary-value', result: cn('w-[100px]', 'w-[200px]') },
		{ label: 'hover-state', result: cn('hover:bg-blue-500', 'hover:bg-red-500') },
		{ label: 'many-classes', result: cn('flex items-center justify-between', 'p-4 m-2', 'rounded-lg shadow-md', 'bg-white text-gray-800') },
		{ label: 'duplicate-exact', result: cn('px-4 py-2', 'px-4 py-2') },
	];

	return (
		<div data-testid="cn-edge-test">
			<h2>cn() Utility Edge Cases</h2>
			{cases.map(({ label, result }) => (
				<div key={label} data-testid={`cn-${label}`} data-value={result}>
					<strong>{label}</strong>: <code>{JSON.stringify(result)}</code>
				</div>
			))}
		</div>
	);
}
