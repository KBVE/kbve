import { useCallback, useEffect, useState } from 'react';
import {
	isWatched as readIsWatched,
	subscribe,
	toggleWatch,
	type WatchEntry,
} from './watchlist';

type Props = {
	kind: string;
	ref: string;
	className?: string;
	size?: 'sm' | 'md';
};

export function WatchToggle({ kind, ref, className, size = 'md' }: Props) {
	const [watched, setWatched] = useState(false);

	useEffect(() => {
		const entry: WatchEntry = { kind, ref };
		setWatched(readIsWatched(entry));
		const unsub = subscribe(() => setWatched(readIsWatched(entry)));
		return unsub;
	}, [kind, ref]);

	const onClick = useCallback(
		(ev: React.MouseEvent<HTMLButtonElement>) => {
			ev.preventDefault();
			ev.stopPropagation();
			toggleWatch({ kind, ref });
		},
		[kind, ref],
	);

	const label = watched ? 'Remove from watch list' : 'Add to watch list';
	const cls = [
		'kbve-market__watch',
		`kbve-market__watch--${size}`,
		watched ? 'kbve-market__watch--on' : '',
		className ?? '',
	]
		.filter(Boolean)
		.join(' ');

	return (
		<button
			type="button"
			aria-pressed={watched}
			aria-label={label}
			title={label}
			className={cls}
			onClick={onClick}>
			<span aria-hidden="true">{watched ? '★' : '☆'}</span>
		</button>
	);
}

export default WatchToggle;
