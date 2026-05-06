import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { AlertCircle, CheckCircle2, Globe, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
	DOMAIN_RE,
	normalizeDomain,
	webmasterService,
} from './serviceWebmaster';

const inputClass = cn(
	'w-full pl-9 pr-10 py-2.5 rounded-md text-base',
	'bg-[var(--sl-color-gray-6,#161b22)]',
	'border border-[var(--sl-color-gray-5,#30363d)]',
	'text-[var(--sl-color-text,#e6edf3)]',
	'placeholder:text-[var(--sl-color-gray-4,#6e7681)]',
	'focus:outline-none focus:border-[var(--sl-color-accent,#1f6feb)]',
	'focus:ring-1 focus:ring-[var(--sl-color-accent,#1f6feb)]',
);

const labelClass =
	'text-xs uppercase tracking-wider text-[var(--sl-color-gray-3,#8b949e)]';

const chipClass = cn(
	'inline-flex items-center gap-1 px-2 py-1 rounded-full',
	'bg-[var(--sl-color-gray-6,#161b22)]',
	'border border-[var(--sl-color-gray-5,#30363d)]',
	'text-sm text-[var(--sl-color-text,#e6edf3)]',
);

const DomainInput = memo(function DomainInput() {
	const domain = useStore(webmasterService.$domain);
	const inputRef = useRef<HTMLInputElement>(null);

	const { normalized, isValid, showNormalizedHint } = useMemo(() => {
		const norm = normalizeDomain(domain);
		const valid = norm.length > 0 && DOMAIN_RE.test(norm);
		const trimmed = domain.trim().toLowerCase();
		return {
			normalized: norm,
			isValid: valid,
			showNormalizedHint: norm.length > 0 && norm !== trimmed,
		};
	}, [domain]);

	const showStatus = normalized.length > 0;

	const onChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) =>
			webmasterService.setDomain(e.target.value),
		[],
	);

	const onBlur = useCallback(() => webmasterService.commitHistory(), []);

	const onKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter') {
				webmasterService.commitHistory();
				e.currentTarget.blur();
			}
		},
		[],
	);

	return (
		<div className="flex flex-col gap-2">
			<label htmlFor="webmaster-domain" className={labelClass}>
				Domain
			</label>
			<div className="relative">
				<Globe
					size={16}
					className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sl-color-gray-3,#8b949e)] pointer-events-none"
				/>
				<input
					ref={inputRef}
					id="webmaster-domain"
					type="text"
					inputMode="url"
					autoComplete="off"
					autoCapitalize="off"
					autoCorrect="off"
					spellCheck={false}
					placeholder="kbve.com"
					value={domain}
					onChange={onChange}
					onBlur={onBlur}
					onKeyDown={onKeyDown}
					className={inputClass}
				/>
				{showStatus && (
					<span className="absolute right-3 top-1/2 -translate-y-1/2">
						{isValid ? (
							<CheckCircle2
								size={16}
								className="text-[var(--sl-color-accent,#3fb950)]"
							/>
						) : (
							<AlertCircle
								size={16}
								className="text-[var(--sl-color-orange,#f0883e)]"
							/>
						)}
					</span>
				)}
			</div>
			{showNormalizedHint && (
				<p className="text-xs text-[var(--sl-color-gray-3,#8b949e)]">
					Normalized to{' '}
					<code className="text-[var(--sl-color-text,#e6edf3)]">
						{normalized}
					</code>
				</p>
			)}
		</div>
	);
});

const HistoryChip = memo(function HistoryChip({ d }: { d: string }) {
	const onSelect = useCallback(() => webmasterService.setDomain(d), [d]);
	const onRemove = useCallback(
		() => webmasterService.removeFromHistory(d),
		[d],
	);
	return (
		<div className={chipClass}>
			<button
				type="button"
				onClick={onSelect}
				className="hover:text-[var(--sl-color-accent-high,#79c0ff)]">
				{d}
			</button>
			<button
				type="button"
				onClick={onRemove}
				aria-label={`Remove ${d}`}
				className="text-[var(--sl-color-gray-3,#8b949e)] hover:text-[var(--sl-color-orange,#f0883e)]">
				<X size={12} />
			</button>
		</div>
	);
});

const HistoryChips = memo(function HistoryChips() {
	const history = useStore(webmasterService.$history);
	const onClear = useCallback(() => webmasterService.clearHistory(), []);
	if (history.length === 0) return null;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<span className={labelClass}>Recent</span>
				<button
					type="button"
					onClick={onClear}
					className="inline-flex items-center gap-1 text-xs text-[var(--sl-color-gray-3,#8b949e)] hover:text-[var(--sl-color-text,#e6edf3)]">
					<Trash2 size={12} />
					Clear
				</button>
			</div>
			<div className="flex flex-wrap gap-2">
				{history.map((d) => (
					<HistoryChip key={d} d={d} />
				))}
			</div>
		</div>
	);
});

export default function ReactWebmaster() {
	useEffect(() => {
		const unsub = webmasterService.bindToolButtons();
		return () => unsub();
	}, []);

	return (
		<div className="not-content flex flex-col gap-4 text-[var(--sl-color-text,#e6edf3)]">
			<DomainInput />
			<HistoryChips />
		</div>
	);
}
