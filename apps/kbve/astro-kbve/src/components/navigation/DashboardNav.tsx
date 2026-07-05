import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $isStaff } from '@kbve/droid';
import { dashboardNav, filterNav, type NavNode } from './dashboardMenu';
import { cn } from '@/lib/utils';

function Chevron({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			width="14"
			height="14"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true">
			<path d="M6 9l6 6 6-6" />
		</svg>
	);
}

function NavRow({
	node,
	expanded,
	onToggle,
	onNavigate,
}: {
	node: NavNode;
	expanded: Record<string, boolean>;
	onToggle: (k: string) => void;
	onNavigate: () => void;
}) {
	if (!node.items || node.items.length === 0) {
		return (
			<a
				className="dnav__row"
				href={node.link}
				role="menuitem"
				onClick={onNavigate}
				data-astro-prefetch>
				{node.label}
			</a>
		);
	}
	const isOpen = expanded[node.label] ?? false;
	return (
		<div className="dnav__group">
			<button
				type="button"
				className="dnav__row dnav__row--group"
				aria-expanded={isOpen}
				onClick={() => onToggle(node.label)}>
				<span>{node.label}</span>
				<Chevron
					className={cn(
						'dnav__row-chevron',
						isOpen && 'dnav__row-chevron--open',
					)}
				/>
			</button>
			{isOpen && (
				<div className="dnav__sublist">
					{node.items.map((child) => (
						<a
							key={child.label}
							className="dnav__row dnav__row--sub"
							href={child.link}
							role="menuitem"
							onClick={onNavigate}
							data-astro-prefetch>
							{child.label}
						</a>
					))}
				</div>
			)}
		</div>
	);
}

export default function DashboardNav() {
	const isStaff = useStore($isStaff);
	const [open, setOpen] = useState(false);
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});

	const nodes = useMemo(() => filterNav(dashboardNav, isStaff), [isStaff]);

	const close = useCallback(() => setOpen(false), []);
	const toggleGroup = useCallback(
		(k: string) => setExpanded((e) => ({ ...e, [k]: !e[k] })),
		[],
	);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, close]);

	return (
		<div className="dnav">
			<button
				type="button"
				className="dnav__trigger"
				aria-expanded={open}
				aria-haspopup="menu"
				aria-label="Dashboard menu"
				onClick={() => setOpen((o) => !o)}>
				<svg
					className="dnav__glyph dnav__glyph--grid"
					viewBox="0 0 24 24"
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true">
					<rect x="3" y="3" width="7" height="7" rx="1" />
					<rect x="14" y="3" width="7" height="7" rx="1" />
					<rect x="3" y="14" width="7" height="7" rx="1" />
					<rect x="14" y="14" width="7" height="7" rx="1" />
				</svg>
				<svg
					className="dnav__glyph dnav__glyph--burger"
					viewBox="0 0 24 24"
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					aria-hidden="true">
					<line x1="3" y1="6" x2="21" y2="6" />
					<line x1="3" y1="12" x2="21" y2="12" />
					<line x1="3" y1="18" x2="21" y2="18" />
				</svg>
				<span className="dnav__label">Dashboard</span>
				<Chevron
					className={cn(
						'dnav__chevron',
						open && 'dnav__chevron--open',
					)}
				/>
			</button>

			{open && (
				<>
					<div
						className="dnav__scrim"
						onClick={close}
						aria-hidden="true"
					/>
					<div className="dnav__panel" role="menu">
						<div className="dnav__panel-head">
							<span className="dnav__panel-title">Dashboard</span>
							<button
								type="button"
								className="dnav__panel-close"
								onClick={close}
								aria-label="Close menu">
								<svg
									viewBox="0 0 24 24"
									width="20"
									height="20"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									aria-hidden="true">
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						</div>
						<nav className="dnav__list">
							{nodes.map((node) => (
								<NavRow
									key={node.label}
									node={node}
									expanded={expanded}
									onToggle={toggleGroup}
									onNavigate={close}
								/>
							))}
						</nav>
					</div>
				</>
			)}

			<style>{`
				.dnav { position: relative; display: inline-flex; }

				.dnav__trigger {
					display: inline-flex;
					align-items: center;
					gap: 0.4rem;
					height: 2.25rem;
					padding: 0 0.75rem;
					border-radius: 0.625rem;
					color: var(--sl-color-gray-2);
					background-color: color-mix(in srgb, var(--sl-color-white) 4%, transparent);
					border: 1px solid var(--bento-hairline-strong, rgba(255,255,255,0.1));
					cursor: pointer;
					transition: color 160ms ease, border-color 160ms ease;
				}
				.dnav__trigger:hover { color: var(--sl-color-white); border-color: var(--sl-color-accent); }

				.dnav__glyph--burger { display: none; }
				.dnav__label { font-size: 0.8125rem; font-weight: 600; }
				.dnav__chevron { transition: transform 200ms ease; }
				.dnav__chevron--open { transform: rotate(180deg); }

				.dnav__scrim { position: fixed; inset: 0; z-index: 60; }

				.dnav__panel {
					z-index: 61;
					background: var(--sl-color-bg-nav, var(--sl-color-gray-6, #1e293b));
					border: 1px solid var(--bento-hairline-strong, rgba(255,255,255,0.1));
					color: var(--sl-color-white);
					display: flex;
					flex-direction: column;
					overflow: hidden;
				}

				.dnav__panel-head {
					display: flex;
					align-items: center;
					justify-content: space-between;
					padding: 0.85rem 1rem;
					border-bottom: 1px solid var(--bento-hairline, rgba(255,255,255,0.06));
				}
				.dnav__panel-title {
					font-size: 0.75rem;
					text-transform: uppercase;
					letter-spacing: 0.1em;
					color: var(--sl-color-gray-3);
				}
				.dnav__panel-close {
					display: inline-flex;
					padding: 0.25rem;
					border: none;
					background: transparent;
					color: var(--sl-color-gray-3);
					cursor: pointer;
					border-radius: 6px;
				}
				.dnav__panel-close:hover { color: var(--sl-color-white); }

				.dnav__list { overflow-y: auto; padding: 0.4rem; }

				.dnav__row {
					display: flex;
					align-items: center;
					justify-content: space-between;
					width: 100%;
					gap: 0.5rem;
					padding: 0.55rem 0.7rem;
					font-size: 0.875rem;
					color: var(--sl-color-gray-2);
					text-decoration: none;
					background: transparent;
					border: none;
					border-radius: 8px;
					cursor: pointer;
					text-align: left;
				}
				.dnav__row:hover { color: var(--sl-color-white); background: color-mix(in srgb, var(--sl-color-white) 6%, transparent); }
				.dnav__row--group { font-weight: 600; }
				.dnav__row--sub { padding-left: 1.4rem; font-size: 0.8125rem; color: var(--sl-color-gray-3); }
				.dnav__row-chevron { transition: transform 200ms ease; flex-shrink: 0; }
				.dnav__row-chevron--open { transform: rotate(180deg); }
				.dnav__sublist { display: flex; flex-direction: column; }

				/* Mobile (default): off-canvas drawer from the left. */
				.dnav__scrim { background: rgba(0,0,0,0.55); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
				.dnav__panel {
					position: fixed;
					top: 0;
					left: 0;
					height: 100dvh;
					width: min(320px, 86vw);
					border-radius: 0;
					animation: dnav-slide 220ms cubic-bezier(0.25,1,0.5,1);
				}
				@keyframes dnav-slide { from { transform: translateX(-100%); } to { transform: translateX(0); } }

				.dnav__glyph--grid { display: none; }
				.dnav__glyph--burger { display: inline-flex; }
				.dnav__label, .dnav__chevron { display: none; }
				.dnav__trigger { width: 2.25rem; padding: 0; justify-content: center; }

				/* Desktop: pill trigger + anchored dropdown. */
				@media (min-width: 34rem) {
					.dnav__glyph--grid { display: inline-flex; }
					.dnav__glyph--burger { display: none; }
					.dnav__label, .dnav__chevron { display: inline-flex; }
					.dnav__trigger { width: auto; padding: 0 0.75rem; justify-content: flex-start; }

					.dnav__scrim { background: transparent; -webkit-backdrop-filter: none; backdrop-filter: none; }
					.dnav__panel {
						position: absolute;
						top: calc(100% + 0.5rem);
						left: auto;
						right: 0;
						height: auto;
						max-height: min(70vh, 32rem);
						width: 17rem;
						border-radius: 0.75rem;
						box-shadow: var(--bento-shadow, 0 8px 20px rgba(0,0,0,0.3));
						animation: dnav-pop 160ms ease;
					}
					@keyframes dnav-pop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
					.dnav__panel-head { display: none; }
				}
			`}</style>
		</div>
	);
}
