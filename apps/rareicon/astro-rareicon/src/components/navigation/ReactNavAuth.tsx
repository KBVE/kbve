import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@nanostores/react';
import { $auth } from '@kbve/astro';
import { initSupa } from '../../lib/supa';

export default function ReactNavAuth() {
	const auth = useStore($auth);
	const [mounted, setMounted] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const btnRef = useRef<HTMLButtonElement>(null);
	const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

	useEffect(() => {
		setMounted(true);
		initSupa().catch(() => {});
	}, []);

	// Close dropdown on outside click
	useEffect(() => {
		if (!menuOpen) return;
		const handler = (e: MouseEvent) => {
			if (
				menuRef.current &&
				!menuRef.current.contains(e.target as Node) &&
				btnRef.current &&
				!btnRef.current.contains(e.target as Node)
			) {
				setMenuOpen(false);
			}
		};
		document.addEventListener('pointerdown', handler);
		return () => document.removeEventListener('pointerdown', handler);
	}, [menuOpen]);

	const toggleMenu = useCallback(() => {
		if (!btnRef.current) return;
		const r = btnRef.current.getBoundingClientRect();
		setMenuPos({
			top: r.bottom + 8,
			right: window.innerWidth - r.right,
		});
		setMenuOpen((v) => !v);
	}, []);

	if (!mounted) return null;

	// Loading state — pulsing placeholder
	if (auth.tone === 'loading') {
		return (
			<div className="ri-nav-auth-inner">
				<div
					className="ri-skel ri-skel--circle"
					style={{ width: 28, height: 28 }}
				/>
			</div>
		);
	}

	// Anonymous — show Sign In link
	if (auth.tone !== 'auth') {
		return (
			<div className="ri-nav-auth-inner">
				<a href="/auth/login/" className="ri-nav-signin">
					Sign In
				</a>
			</div>
		);
	}

	// Authenticated — avatar + name + dropdown
	const initial = (auth.name || 'A').charAt(0).toUpperCase();

	return (
		<div className="ri-nav-auth-inner">
			<button
				ref={btnRef}
				type="button"
				onClick={toggleMenu}
				className="ri-nav-avatar-btn"
				aria-label="User menu"
				aria-expanded={menuOpen}
				aria-haspopup="true">
				{auth.avatar ? (
					<img
						src={auth.avatar}
						alt={auth.name}
						className="ri-nav-avatar"
					/>
				) : (
					<div className="ri-nav-avatar ri-nav-avatar--fallback">
						{initial}
					</div>
				)}
				<span className="ri-nav-username">{auth.name}</span>
				<svg
					className="ri-nav-chevron"
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
					style={{
						transform: menuOpen ? 'rotate(180deg)' : 'rotate(0)',
						transition: 'transform 0.2s',
					}}>
					<path d="m6 9 6 6 6-6" />
				</svg>
			</button>

			{menuOpen &&
				createPortal(
					<div
						ref={menuRef}
						className="ri-nav-dropdown"
						style={{
							position: 'fixed',
							top: menuPos.top,
							right: menuPos.right,
							zIndex: 100,
						}}
						role="menu">
						{/* User info header */}
						<div className="ri-nav-dropdown__header">
							{auth.avatar ? (
								<img
									src={auth.avatar}
									alt={auth.name}
									className="ri-nav-dropdown__avatar"
								/>
							) : (
								<div className="ri-nav-dropdown__avatar ri-nav-avatar--fallback">
									{initial}
								</div>
							)}
							<div className="ri-nav-dropdown__info">
								<div className="ri-nav-dropdown__name">
									{auth.name}
								</div>
							</div>
						</div>

						<div className="ri-nav-dropdown__divider" />

						{/* Menu items */}
						<ul className="ri-nav-dropdown__menu">
							<li>
								<a
									href="/auth/profile/"
									className="ri-nav-dropdown__item"
									onClick={() => setMenuOpen(false)}
									role="menuitem">
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										aria-hidden="true">
										<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
										<circle cx="12" cy="7" r="4" />
									</svg>
									Profile
								</a>
							</li>
						</ul>

						<div className="ri-nav-dropdown__divider" />

						{/* Sign out */}
						<ul className="ri-nav-dropdown__menu">
							<li>
								<a
									href="/auth/logout/"
									className="ri-nav-dropdown__item ri-nav-dropdown__item--danger"
									role="menuitem">
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										aria-hidden="true">
										<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
										<polyline points="16 17 21 12 16 7" />
										<line x1="21" y1="12" x2="9" y2="12" />
									</svg>
									Sign Out
								</a>
							</li>
						</ul>
					</div>,
					document.body,
				)}
		</div>
	);
}
