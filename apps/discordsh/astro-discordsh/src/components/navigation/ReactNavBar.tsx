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

const slVar = (name: string, fallback: string) => `var(${name}, ${fallback})`;

const styles = {
	surface: {
		backgroundColor: slVar('--sl-color-bg-nav', '#18181b'),
		color: slVar('--sl-color-white', '#e2e8f0'),
	} as React.CSSProperties,

	activeLink: {
		backgroundColor: 'var(--sl-color-accent-low)',
		color: 'var(--sl-color-text-accent)',
	} as React.CSSProperties,

	accentBtn: {
		backgroundColor: 'var(--sl-color-accent)',
		color: '#fff',
	} as React.CSSProperties,

	accentBtnHover: {
		backgroundColor: 'var(--sl-color-accent-high)',
	} as React.CSSProperties,

	avatarRing: {
		boxShadow:
			'0 0 0 2px color-mix(in srgb, var(--sl-color-accent) 25%, transparent)',
	} as React.CSSProperties,

	userMenu: {
		background:
			'linear-gradient(139deg, rgba(36,40,50,1) 0%, rgba(36,40,50,1) 100%)',
		boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
	} as React.CSSProperties,
};

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
				className={cls}
				style={styles.avatarRing}
			/>
		) : (
			<div
				className={`${cls} flex items-center justify-center`}
				style={{
					backgroundColor: 'var(--sl-color-accent-low)',
				}}>
				<User
					size={large ? 18 : ICON_SIZE}
					style={{
						color: 'var(--sl-color-text-accent)',
					}}
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
								className="rounded-full"
								style={{
									width: '1.25rem',
									height: '1.25rem',
									...styles.avatarRing,
								}}
							/>
						) : (
							<User
								size={ICON_SIZE}
								style={{
									color: 'var(--sl-color-text-accent)',
								}}
							/>
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
					<div
						className="w-7 h-7 rounded-full animate-pulse"
						style={{
							backgroundColor: slVar(
								'--sl-color-gray-5',
								'#3f3f46',
							),
						}}
					/>
				</div>
			);
		}

		if (auth.tone === 'auth') {
			return (
				<div className="flex items-center gap-2 px-4 py-3">
					<Avatar />
					<span
						className="text-sm font-medium"
						style={{
							color: slVar('--sl-color-white', '#e2e8f0'),
						}}>
						{auth.name}
					</span>
					<a
						href="/auth/logout"
						title="Sign out"
						className="inline-flex items-center gap-1 rounded-md text-sm ml-auto px-3 py-1.5 transition-colors duration-150"
						style={{
							color: slVar('--sl-color-gray-2', '#a1a1aa'),
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.color = '#ef4444';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.color = slVar(
								'--sl-color-gray-2',
								'#a1a1aa',
							);
						}}>
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
				className="inline-flex items-center gap-1.5 w-full px-4 py-3 text-sm font-medium transition-colors duration-150"
				style={{
					color: 'var(--sl-color-text-accent)',
				}}>
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
								'absolute top-0 right-0 h-full w-72 shadow-2xl flex flex-col transition-transform duration-300 ease-out',
								drawerVisible
									? 'translate-x-0'
									: 'translate-x-full',
							)}
							style={styles.surface}>
							<div
								className="flex items-center justify-between px-4 py-3"
								style={{
									borderBottom: `1px solid ${slVar('--sl-color-hairline', '#27272a')}`,
								}}>
								<span
									className="text-sm font-semibold"
									style={{
										color: slVar(
											'--sl-color-white',
											'#e2e8f0',
										),
									}}>
									Discord.sh
								</span>
								<button
									type="button"
									onClick={doCloseDrawer}
									aria-label="Close menu"
									className="inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors"
									style={{
										color: slVar(
											'--sl-color-gray-3',
											'#71717a',
										),
									}}>
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
											className="flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors duration-150"
											style={
												active
													? styles.activeLink
													: {
															color: slVar(
																'--sl-color-gray-2',
																'#a1a1aa',
															),
														}
											}
											onMouseEnter={(e) => {
												if (!active)
													e.currentTarget.style.color =
														slVar(
															'--sl-color-white',
															'#e2e8f0',
														);
											}}
											onMouseLeave={(e) => {
												if (!active)
													e.currentTarget.style.color =
														slVar(
															'--sl-color-gray-2',
															'#a1a1aa',
														);
											}}>
											<item.icon size={ICON_SIZE} />
											{item.label}
										</a>
									);
								})}
							</nav>

							<div
								style={{
									borderTop: `1px solid ${slVar('--sl-color-hairline', '#27272a')}`,
								}}
								className="py-2">
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
						className="not-content fixed w-52 rounded-xl py-3 z-50"
						style={{
							...styles.userMenu,
							top: menuPos.top,
							right: menuPos.right,
						}}
						role="menu">
						<div className="flex items-center gap-2.5 px-3 pb-2.5 mb-1">
							<Avatar large />
							<div className="min-w-0">
								<div
									className="text-sm font-semibold truncate"
									style={{
										color: slVar(
											'--sl-color-white',
											'#e2e8f0',
										),
									}}>
									{auth.name}
								</div>
								<div
									className="text-xs truncate"
									style={{ color: '#7e8590' }}>
									Online
								</div>
							</div>
						</div>

						<div style={{ borderTop: '1.5px solid #42434a' }} />

						<div className="flex flex-col gap-1 px-2.5 pt-2">
							{USER_MENU_ITEMS.map((item) => (
								<a
									key={item.href}
									href={item.href}
									onClick={() => setMenuOpen(false)}
									className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm font-semibold transition-all duration-200 ease-out"
									style={{ color: '#7e8590' }}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor =
											'var(--sl-color-accent)';
										e.currentTarget.style.color = '#ffffff';
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor =
											'transparent';
										e.currentTarget.style.color = '#7e8590';
									}}
									role="menuitem">
									<item.icon size={ICON_SIZE} />
									{item.label}
								</a>
							))}
						</div>

						<div
							className="mx-2.5 my-1.5"
							style={{ borderTop: '1.5px solid #42434a' }}
						/>

						<div className="flex flex-col gap-1 px-2.5">
							<a
								href="/auth/logout"
								className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm font-semibold transition-all duration-200 ease-out"
								style={{ color: 'var(--sl-color-text-accent)' }}
								onMouseEnter={(e) => {
									e.currentTarget.style.backgroundColor =
										'rgba(142,42,42,1)';
									e.currentTarget.style.color = '#ffffff';
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor =
										'transparent';
									e.currentTarget.style.color =
										'var(--sl-color-text-accent)';
								}}
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
						<div
							className="w-full max-w-sm rounded-xl shadow-2xl p-5"
							style={styles.surface}>
							<div className="flex items-center justify-between mb-4">
								<h2
									className="text-base font-semibold"
									style={{
										color: slVar(
											'--sl-color-white',
											'#e2e8f0',
										),
									}}>
									Sign in to Discord.sh
								</h2>
								<button
									className="inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors"
									style={{
										color: slVar(
											'--sl-color-gray-3',
											'#71717a',
										),
									}}
									onClick={() =>
										!busy && closeModal(SIGNIN_MODAL)
									}
									aria-label="Close">
									<X size={ICON_SIZE} />
								</button>
							</div>

							{auth.error && (
								<div
									className="mb-3 text-xs rounded-md px-3 py-2"
									style={{
										color: '#fca5a5',
										backgroundColor: 'rgba(239,68,68,0.1)',
									}}>
									{auth.error}
								</div>
							)}

							<div className="flex flex-col gap-2">
								<button
									type="button"
									onClick={() => handleOAuth('discord')}
									disabled={busy}
									className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg text-sm font-medium px-4 py-2.5 transition-colors disabled:opacity-60"
									style={{
										backgroundColor: '#5865F2',
										color: '#fff',
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor =
											'#4752C4';
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor =
											'#5865F2';
									}}>
									<DiscordIcon className="w-5 h-5" />
									Continue with Discord
								</button>

								<button
									type="button"
									onClick={() => handleOAuth('github')}
									disabled={busy}
									className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg text-sm font-medium px-4 py-2.5 transition-colors disabled:opacity-60"
									style={{
										backgroundColor: '#24292f',
										color: '#fff',
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor =
											'#1b1f23';
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor =
											'#24292f';
									}}>
									<GitHubIcon className="w-5 h-5" />
									Continue with GitHub
								</button>

								<button
									type="button"
									onClick={() => handleOAuth('twitch')}
									disabled={busy}
									className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg text-sm font-medium px-4 py-2.5 transition-colors disabled:opacity-60"
									style={{
										backgroundColor: '#9146FF',
										color: '#fff',
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor =
											'#7B2FFF';
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor =
											'#9146FF';
									}}>
									<TwitchIcon className="w-5 h-5" />
									Continue with Twitch
								</button>
							</div>

							<p
								className="mt-4 text-[11px] text-center"
								style={{
									color: slVar(
										'--sl-color-gray-3',
										'#71717a',
									),
								}}>
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
