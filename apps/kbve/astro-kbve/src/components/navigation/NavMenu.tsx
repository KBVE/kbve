import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { NavNode } from './dashboardMenu';
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
	path,
	depth,
	openPath,
	hoverable,
	onOpenPath,
	onNavigate,
}: {
	node: NavNode;
	path: string;
	depth: number;
	openPath: string;
	hoverable: boolean;
	onOpenPath: (p: string) => void;
	onNavigate: () => void;
}) {
	const key = path ? `${path}/${node.label}` : node.label;
	const depthStyle = { '--dnav-depth': depth } as CSSProperties;
	if (!node.items || node.items.length === 0) {
		return (
			<a
				className={cn('dnav__row', depth > 0 && 'dnav__row--sub')}
				style={depthStyle}
				href={node.link}
				role="menuitem"
				onClick={onNavigate}
				onMouseEnter={hoverable ? () => onOpenPath(path) : undefined}
				data-astro-prefetch>
				{node.label}
			</a>
		);
	}
	const isOpen = openPath === key || openPath.startsWith(`${key}/`);
	return (
		<div className="dnav__group">
			<button
				type="button"
				className={cn(
					'dnav__row dnav__row--group',
					depth > 0 && 'dnav__row--sub',
				)}
				style={depthStyle}
				aria-expanded={isOpen}
				aria-haspopup="menu"
				onClick={() => onOpenPath(isOpen ? path : key)}
				onMouseEnter={hoverable ? () => onOpenPath(key) : undefined}>
				<span>{node.label}</span>
				<Chevron
					className={cn(
						'dnav__row-chevron',
						isOpen && 'dnav__row-chevron--open',
					)}
				/>
			</button>
			{isOpen && (
				<div className="dnav__sublist" role="menu">
					{node.items.map((child) => (
						<NavRow
							key={child.label}
							node={child}
							path={key}
							depth={depth + 1}
							openPath={openPath}
							hoverable={hoverable}
							onOpenPath={onOpenPath}
							onNavigate={onNavigate}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export default function NavMenu({
	menuLabel,
	title,
	pillLabel,
	icon,
	nodes,
}: {
	menuLabel: string;
	title: string;
	pillLabel?: string;
	icon: ReactNode;
	nodes: NavNode[];
}) {
	const [open, setOpen] = useState(false);
	const [openPath, setOpenPath] = useState('');
	const [hoverable, setHoverable] = useState(false);

	const closeTimer = useRef<number | null>(null);

	const cancelClose = useCallback(() => {
		if (closeTimer.current !== null) {
			window.clearTimeout(closeTimer.current);
			closeTimer.current = null;
		}
	}, []);

	const close = useCallback(() => {
		cancelClose();
		setOpen(false);
		setOpenPath('');
	}, [cancelClose]);

	const scheduleClose = useCallback(() => {
		cancelClose();
		closeTimer.current = window.setTimeout(close, 200);
	}, [cancelClose, close]);

	useEffect(() => cancelClose, [cancelClose]);

	useEffect(() => {
		const mq = window.matchMedia('(hover: hover) and (min-width: 34rem)');
		const sync = () => setHoverable(mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	}, []);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, close]);

	return (
		<div
			className="dnav"
			onMouseEnter={hoverable ? cancelClose : undefined}
			onMouseLeave={hoverable && open ? scheduleClose : undefined}>
			<button
				type="button"
				className={cn(
					'dnav__trigger',
					!pillLabel && 'dnav__trigger--icon',
				)}
				aria-expanded={open}
				aria-haspopup="menu"
				aria-label={menuLabel}
				onClick={() => {
					setOpen((o) => !o);
					setOpenPath('');
				}}
				onMouseEnter={
					hoverable
						? () => {
								cancelClose();
								setOpen(true);
							}
						: undefined
				}>
				{icon}
				{pillLabel && (
					<>
						<span className="dnav__label">{pillLabel}</span>
						<Chevron
							className={cn(
								'dnav__chevron',
								open && 'dnav__chevron--open',
							)}
						/>
					</>
				)}
			</button>

			{open && (
				<>
					{!hoverable && (
						<div
							className="dnav__scrim"
							onClick={close}
							aria-hidden="true"
						/>
					)}
					<div className="dnav__panel" role="menu">
						<div className="dnav__panel-head">
							<span className="dnav__panel-title">{title}</span>
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
									path=""
									depth={0}
									openPath={openPath}
									hoverable={hoverable}
									onOpenPath={setOpenPath}
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
				.dnav__row--sub { padding-left: calc(0.7rem + 0.7rem * var(--dnav-depth, 0)); font-size: 0.8125rem; color: var(--sl-color-gray-3); }
				.dnav__group { position: relative; }
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
					.dnav__trigger--icon { width: 2.25rem; padding: 0; justify-content: center; }

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

					.dnav__panel { overflow: visible; }
					.dnav__list { overflow: visible; }
					.dnav__row--sub { padding-left: 0.7rem; }
					.dnav__row-chevron { transform: rotate(90deg); }
					.dnav__row-chevron--open { transform: rotate(90deg); }
					.dnav__sublist {
						position: absolute;
						top: 0;
						right: 100%;
						margin-right: 0.4rem;
						min-width: 12rem;
						padding: 0.4rem;
						border-radius: 0.75rem;
						background: var(--sl-color-bg-nav, var(--sl-color-gray-6, #1e293b));
						border: 1px solid var(--bento-hairline-strong, rgba(255,255,255,0.1));
						box-shadow: var(--bento-shadow, 0 8px 20px rgba(0,0,0,0.3));
						animation: dnav-pop 160ms ease;
					}
				}
			`}</style>
		</div>
	);
}
