import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@nanostores/react';
import {
	$auth,
	$currentPath,
	$drawerOpen,
	$modalId,
	bootRouter,
	openDrawer,
	closeDrawer,
	openModal,
	closeModal,
	addToast,
	useAuthBridge,
	cn,
	DiscordIcon,
	GitHubIcon,
	TwitchIcon,
} from '@kbve/astro';
import type { OAuthProvider } from '@kbve/astro';
import { authBridge, initSupa } from '../../lib/supa';
import {
	Home,
	BookOpen,
	LayoutDashboard,
	LogIn,
	LogOut,
	X,
	User,
	Settings,
	UserCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICON_SIZE = 16;
const SIGNIN_MODAL = 'signin';

interface NavItem {
	label: string;
	href: string;
	icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
	{ label: 'Home', href: '/', icon: Home },
	{ label: 'Docs', href: '/guides/getting-started', icon: BookOpen },
	{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
];

const USER_MENU_ITEMS: NavItem[] = [
	{ label: 'Profile', href: '/profile', icon: UserCircle },
	{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
	{ label: 'Settings', href: '/settings', icon: Settings },
];

function isActive(href: string, path: string): boolean {
	if (href === '/') return path === '/' || path === '';
	return path.startsWith(href);
}

export default function ReactNavBar({
	currentPath: initialPath,
}: {
	currentPath?: string;
}) {
	const [mounted, setMounted] = useState(false);
	const [drawerVisible, setDrawerVisible] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

	const menuRef = useRef<HTMLDivElement>(null);
	const avatarBtnRef = useRef<HTMLButtonElement>(null);
	const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

	const auth = useStore($auth);
	const drawerOpen = useStore($drawerOpen);
	const modalId = useStore($modalId);
	const modalOpen = modalId === SIGNIN_MODAL;

	const { signInWithOAuth, loading: authLoading } = useAuthBridge(authBridge);
	const busy = authLoading;

	const currentPath = useStore($currentPath);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		bootRouter(initialPath);
		initSupa().catch(() => {});
	}, []);

	useEffect(() => {
		if (drawerOpen) document.body.style.overflow = 'hidden';
		else document.body.style.overflow = '';
		return () => {
			document.body.style.overflow = '';
		};
	}, [drawerOpen]);

	useEffect(() => {
		if (!menuOpen) return;
		const handler = (e: MouseEvent) => {
			if (
				menuRef.current &&
				!menuRef.current.contains(e.target as Node)
			) {
				setMenuOpen(false);
			}
		};
		document.addEventListener('pointerdown', handler);
		return () => document.removeEventListener('pointerdown', handler);
	}, [menuOpen]);

	const doOpenDrawer = useCallback(() => {
		openDrawer();
		requestAnimationFrame(() =>
			requestAnimationFrame(() => setDrawerVisible(true)),
		);
	}, []);

	const doCloseDrawer = useCallback(() => {
		setDrawerVisible(false);
		setTimeout(() => closeDrawer(), 300);
	}, []);

	useEffect(() => {
		const hamburger = document.getElementById('nav-hamburger');
		if (!hamburger) return;
		const handler = () => doOpenDrawer();
		hamburger.addEventListener('click', handler);
		return () => hamburger.removeEventListener('click', handler);
	}, [doOpenDrawer]);

	const handleOAuth = useCallback(
		async (p: OAuthProvider) => {
			try {
				await signInWithOAuth(p);
				closeModal(SIGNIN_MODAL);
				addToast({
					id: `auth-ok-${Date.now()}`,
					message: 'Signed in successfully!',
					severity: 'success',
					duration: 4000,
				});
			} catch {
				// useAuthBridge tracks the error
			}
		},
		[signInWithOAuth],
	);

	if (!mounted) return null;

	const authDesktopEl = document.getElementById('nav-auth-desktop');

	const Avatar = ({ large }: { large?: boolean }) => {
		const cls = large ? 'w-8 h-8 rounded-full' : 'w-7 h-7 rounded-full';
		return auth.avatar ? (
			<img
				src={auth.avatar}
				alt={auth.name}
				className={`${cls} nb-avatar-ring`}
			/>
		) : (
			<div
				className={`${cls} flex items-center justify-center nb-avatar-fallback`}>
				<User
					size={large ? 18 : ICON_SIZE}
					className="nb-text-accent"
				/>
			</div>
		);
	};

	const DesktopAuth = () => {
		if (auth.tone === 'loading') return null;

		return (
			<div
				data-auth-ready
				className="absolute inset-0 z-[1] flex items-center justify-center">
				{auth.tone === 'auth' ? (
					<button
						ref={avatarBtnRef}
						type="button"
						onClick={() => {
							if (!avatarBtnRef.current) return;
							const r =
								avatarBtnRef.current.getBoundingClientRect();
							setMenuPos({
								top: r.bottom + 8,
								right: window.innerWidth - r.right,
							});
							setMenuOpen((v) => !v);
						}}
						className="flex items-center justify-center w-full h-full rounded-[0.375rem] transition-colors duration-150 focus:outline-none"
						aria-label="User menu"
						aria-expanded={menuOpen}
						aria-haspopup="true"
						data-auth-avatar="">
						{auth.avatar ? (
							<img
								src={auth.avatar}
								alt={auth.name}
								className="w-5 h-5 rounded-full nb-avatar-ring"
							/>
						) : (
							<User size={ICON_SIZE} className="nb-text-accent" />
						)}
					</button>
				) : (
					<button
						type="button"
						onClick={() => openModal(SIGNIN_MODAL)}
						className="absolute inset-0 rounded-[0.375rem] focus:outline-none"
						aria-label="Sign in"
					/>
				)}
			</div>
		);
	};

	const DrawerAuth = () => {
		if (auth.tone === 'loading') {
			return (
				<div className="flex items-center gap-2 px-4 py-3">
					<div className="w-7 h-7 rounded-full animate-pulse nb-skeleton" />
				</div>
			);
		}

		if (auth.tone === 'auth') {
			return (
				<div className="flex items-center gap-2 px-4 py-3">
					<Avatar />
					<span className="text-sm font-medium nb-text">
						{auth.name}
					</span>
					<a
						href="/auth/logout"
						title="Sign out"
						className="nb-drawer-signout">
						<LogOut size={ICON_SIZE} />
						Sign out
					</a>
				</div>
			);
		}

		return (
			<button
				type="button"
				onClick={() => openModal(SIGNIN_MODAL)}
				className="inline-flex items-center gap-1.5 w-full px-4 py-3 text-sm font-medium transition-colors duration-150 nb-text-accent">
				<LogIn size={ICON_SIZE} />
				Sign In
			</button>
		);
	};

	return (
		<>
			{authDesktopEl && createPortal(<DesktopAuth />, authDesktopEl)}

			{/* Mobile drawer */}
			{drawerOpen &&
				createPortal(
					<div
						className={cn(
							'fixed inset-0 z-50 transition-opacity duration-300',
							drawerVisible ? 'opacity-100' : 'opacity-0',
						)}
						role="dialog"
						aria-modal="true"
						aria-label="Navigation menu">
						<div
							className="absolute inset-0 bg-black/50 backdrop-blur-sm"
							onClick={doCloseDrawer}
						/>

						<div
							className={cn(
								'absolute top-0 right-0 h-full w-72 shadow-2xl flex flex-col transition-transform duration-300 ease-out nb-surface',
								drawerVisible
									? 'translate-x-0'
									: 'translate-x-full',
							)}>
							<div className="flex items-center justify-between px-4 py-3 nb-border-b">
								<span className="text-sm font-semibold nb-text">
									Discord.sh
								</span>
								<button
									type="button"
									onClick={doCloseDrawer}
									aria-label="Close menu"
									className="inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors nb-muted">
									<X size={ICON_SIZE} />
								</button>
							</div>

							<nav className="flex-1 overflow-y-auto py-2">
								{NAV_ITEMS.map((item) => {
									const active = isActive(
										item.href,
										currentPath,
									);
									return (
										<a
											key={item.href}
											href={item.href}
											onClick={doCloseDrawer}
											className={cn(
												'flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors duration-150',
												active
													? 'nb-link-active'
													: 'nb-link-idle',
											)}>
											<item.icon size={ICON_SIZE} />
											{item.label}
										</a>
									);
								})}
							</nav>

							<div className="py-2 nb-border-t">
								<DrawerAuth />
							</div>
						</div>
					</div>,
					document.body,
				)}

			{/* User menu dropdown */}
			{menuOpen &&
				auth.tone === 'auth' &&
				createPortal(
					<div
						ref={menuRef}
						className="not-content fixed w-52 rounded-xl py-3 z-50 nb-user-menu"
						style={{
							top: menuPos.top,
							right: menuPos.right,
						}}
						role="menu">
						<div className="flex items-center gap-2.5 px-3 pb-2.5 mb-1">
							<Avatar large />
							<div className="min-w-0">
								<div className="text-sm font-semibold truncate nb-text">
									{auth.name}
								</div>
								<div className="text-xs truncate nb-menu-status">
									Online
								</div>
							</div>
						</div>

						<div className="nb-menu-divider" />

						<div className="flex flex-col gap-1 px-2.5 pt-2">
							{USER_MENU_ITEMS.map((item) => (
								<a
									key={item.href}
									href={item.href}
									onClick={() => setMenuOpen(false)}
									className="nb-menu-item"
									role="menuitem">
									<item.icon size={ICON_SIZE} />
									{item.label}
								</a>
							))}
						</div>

						<div className="mx-2.5 my-1.5 nb-menu-divider" />

						<div className="flex flex-col gap-1 px-2.5">
							<a
								href="/auth/logout"
								className="nb-menu-item-logout"
								role="menuitem">
								<LogOut size={ICON_SIZE} />
								Sign Out
							</a>
						</div>
					</div>,
					document.body,
				)}

			{/* Sign-in modal */}
			{modalOpen &&
				createPortal(
					<div
						className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
						role="dialog"
						aria-modal="true"
						aria-label="Sign in"
						onClick={(e) => {
							if (e.target === e.currentTarget && !busy)
								closeModal(SIGNIN_MODAL);
						}}>
						<div className="w-full max-w-sm rounded-xl shadow-2xl p-5 nb-surface">
							<div className="flex items-center justify-between mb-4">
								<h2 className="text-base font-semibold nb-text">
									Sign in to Discord.sh
								</h2>
								<button
									className="inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors nb-muted"
									onClick={() =>
										!busy && closeModal(SIGNIN_MODAL)
									}
									aria-label="Close">
									<X size={ICON_SIZE} />
								</button>
							</div>

							{auth.error && (
								<div className="nb-auth-error">
									{auth.error}
								</div>
							)}

							<div className="flex flex-col gap-2">
								<button
									type="button"
									onClick={() => handleOAuth('discord')}
									disabled={busy}
									className="nb-oauth-btn nb-oauth-discord">
									<DiscordIcon className="w-5 h-5" />
									Continue with Discord
								</button>

								<button
									type="button"
									onClick={() => handleOAuth('github')}
									disabled={busy}
									className="nb-oauth-btn nb-oauth-github">
									<GitHubIcon className="w-5 h-5" />
									Continue with GitHub
								</button>

								<button
									type="button"
									onClick={() => handleOAuth('twitch')}
									disabled={busy}
									className="nb-oauth-btn nb-oauth-twitch">
									<TwitchIcon className="w-5 h-5" />
									Continue with Twitch
								</button>
							</div>

							<p className="mt-4 text-[11px] text-center nb-muted">
								Your session syncs automatically across all
								tabs.
							</p>
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}
