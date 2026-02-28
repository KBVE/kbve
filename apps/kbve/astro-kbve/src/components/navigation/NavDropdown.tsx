// src/components/navigation/NavDropdown.tsx
// Navigation menu that opens as a modal on click
import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type AuthTone = 'loading' | 'error' | 'anon' | 'auth';

interface NavDropdownProps {
	tone: AuthTone;
	displayName: string;
	avatarUrl?: string;
	onLogin: () => void;
	onLogout: () => void;
}

export default function NavDropdown({
	tone,
	displayName,
	avatarUrl,
	onLogin,
	onLogout,
}: NavDropdownProps) {
	const [showModal, setShowModal] = useState(false);

	const isGuest = tone === 'anon' || tone === 'loading' || tone === 'error';
	const isAuth = tone === 'auth';

	const handleClick = useCallback(() => {
		setShowModal(true);
	}, []);

	const handleCloseModal = useCallback(() => {
		setShowModal(false);
	}, []);

	// Status icon based on tone
	const StatusIcon = () => {
		const iconClass = 'w-4 h-4';
		switch (tone) {
			case 'loading':
				return (
					<svg
						className={cn(iconClass, 'text-gray-400 animate-spin')}
						fill="none"
						viewBox="0 0 24 24">
						<circle
							className="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							strokeWidth="4"
						/>
						<path
							className="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						/>
					</svg>
				);
			case 'error':
				return (
					<svg
						className={cn(iconClass, 'text-red-500')}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2">
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
				);
			case 'anon':
				return (
					<svg
						className={cn(iconClass, 'text-yellow-400')}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2">
						<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
						<polyline points="10 17 15 12 10 7" />
						<line x1="15" y1="12" x2="3" y2="12" />
					</svg>
				);
			case 'auth':
				return (
					<svg
						className={cn(iconClass, 'text-green-500')}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2">
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
				);
		}
	};

	// Avatar component
	const Avatar = () => {
		if (avatarUrl) {
			return (
				<img
					src={avatarUrl}
					alt={displayName}
					className="w-6 h-6 rounded-full ring-1 ring-gray-200 dark:ring-gray-700"
				/>
			);
		}
		return (
			<svg
				className="w-6 h-6 opacity-70"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2">
				<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
				<circle cx="12" cy="7" r="4" />
			</svg>
		);
	};

	// Chevron down icon
	const ChevronDown = () => (
		<svg
			className="w-3 h-3 text-gray-500"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2">
			<polyline points="6 9 12 15 18 9" />
		</svg>
	);

	// Menu item component for consistent styling with Starlight variables
	const MenuItem = ({
		icon,
		label,
		onClick,
		href,
		variant = 'default',
	}: {
		icon: React.ReactNode;
		label: string;
		onClick?: () => void;
		href?: string;
		variant?: 'default' | 'danger' | 'primary';
	}) => {
		const baseClasses = cn(
			'w-full flex items-center gap-3 px-4 py-3 rounded-xl',
			'text-sm font-medium',
			'transition-all duration-200',
			'group nav-menu-item',
			variant === 'default' && 'nav-menu-item--default',
			variant === 'danger' && 'nav-menu-item--danger',
			variant === 'primary' && 'nav-menu-item--primary',
		);

		const iconWrapper = (
			<span
				className={cn(
					'flex items-center justify-center w-8 h-8 rounded-lg',
					'transition-all duration-200 nav-menu-icon',
					variant === 'danger' && 'nav-menu-icon--danger',
					variant === 'primary' && 'nav-menu-icon--primary',
				)}>
				{icon}
			</span>
		);

		if (href) {
			return (
				<a href={href} onClick={onClick} className={baseClasses}>
					{iconWrapper}
					{label}
				</a>
			);
		}

		return (
			<button onClick={onClick} className={baseClasses}>
				{iconWrapper}
				{label}
			</button>
		);
	};

	// Guest menu items
	const GuestMenuItems = ({ onItemClick }: { onItemClick?: () => void }) => (
		<div className="space-y-1">
			<MenuItem
				icon={
					<svg
						className="w-4 h-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2">
						<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
						<polyline points="10 17 15 12 10 7" />
						<line x1="15" y1="12" x2="3" y2="12" />
					</svg>
				}
				label="Sign In"
				variant="primary"
				onClick={() => {
					onLogin();
					onItemClick?.();
				}}
			/>
			<MenuItem
				icon={
					<svg
						className="w-4 h-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2">
						<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
						<circle cx="8.5" cy="7" r="4" />
						<line x1="20" y1="8" x2="20" y2="14" />
						<line x1="23" y1="11" x2="17" y2="11" />
					</svg>
				}
				label="Create Account"
				href="/auth/register"
				onClick={onItemClick}
			/>
		</div>
	);

	// User menu items
	const UserMenuItems = ({ onItemClick }: { onItemClick?: () => void }) => (
		<div className="space-y-1">
			<MenuItem
				icon={
					<svg
						className="w-4 h-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2">
						<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
						<circle cx="12" cy="7" r="4" />
					</svg>
				}
				label="Profile"
				href="/profile"
				onClick={onItemClick}
			/>
			<MenuItem
				icon={
					<svg
						className="w-4 h-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2">
						<circle cx="12" cy="12" r="3" />
						<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
					</svg>
				}
				label="Settings"
				href="/settings"
				onClick={onItemClick}
			/>

			{/* Divider */}
			<div className="!my-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

			<MenuItem
				icon={
					<svg
						className="w-4 h-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2">
						<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
						<polyline points="16 17 21 12 16 7" />
						<line x1="21" y1="12" x2="9" y2="12" />
					</svg>
				}
				label="Sign Out"
				variant="danger"
				onClick={() => {
					onLogout();
					onItemClick?.();
				}}
			/>
		</div>
	);

	// Modal component using Starlight CSS variables for theme compatibility
	const MenuModal = () => {
		if (!showModal) return null;

		return createPortal(
			<div
				className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
				onClick={(e) => {
					if (e.target === e.currentTarget) handleCloseModal();
				}}>
				{/* Backdrop with blur */}
				<div className="absolute inset-0 nav-modal-backdrop" />

				{/* Modal card */}
				<div className="nav-modal-card relative w-full max-w-xs rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
					{/* Accent glow effect */}
					<div className="absolute inset-0 nav-modal-glow pointer-events-none" />

					{/* Header */}
					<div className="relative px-5 pt-5 pb-4">
						<div className="flex items-center gap-4">
							{/* Avatar with accent ring */}
							<div className="relative">
								<div className="absolute -inset-1 nav-avatar-glow rounded-full opacity-60 blur-sm" />
								<div className="relative w-12 h-12 rounded-full nav-avatar-bg ring-2 ring-current/20 overflow-hidden flex items-center justify-center">
									{avatarUrl ? (
										<img
											src={avatarUrl}
											alt={displayName}
											className="w-full h-full object-cover"
										/>
									) : (
										<svg
											className="w-6 h-6 nav-text-muted"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2">
											<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
											<circle cx="12" cy="7" r="4" />
										</svg>
									)}
								</div>
								{/* Status indicator */}
								<div
									className={cn(
										'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full nav-status-border',
										isAuth
											? 'nav-status-auth'
											: 'nav-status-guest',
									)}
								/>
							</div>

							<div className="flex-1 min-w-0">
								<p className="text-base font-semibold nav-text truncate">
									{displayName}
								</p>
								<p className="text-xs nav-text-muted flex items-center gap-1.5">
									<span
										className={cn(
											'w-1.5 h-1.5 rounded-full',
											isAuth
												? 'nav-status-auth'
												: 'nav-status-guest',
										)}
									/>
									{isAuth ? 'Authenticated' : 'Guest Account'}
								</p>
							</div>

							{/* Close button */}
							<button
								onClick={handleCloseModal}
								className="p-2 -mr-2 rounded-xl bg-transparent nav-text-muted nav-close-btn transition-all duration-200"
								aria-label="Close menu">
								<svg
									className="w-5 h-5"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round">
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						</div>
					</div>

					{/* Divider */}
					<div className="h-px nav-divider" />

					{/* Menu content */}
					<div className="relative p-2">
						{isGuest && (
							<GuestMenuItems onItemClick={handleCloseModal} />
						)}
						{isAuth && (
							<UserMenuItems onItemClick={handleCloseModal} />
						)}
					</div>

					{/* Safe area padding for mobile */}
					<div className="h-safe-area-inset-bottom" />
				</div>
			</div>,
			document.body,
		);
	};

	return (
		<>
			{/* Trigger button */}
			<button
				onClick={handleClick}
				className={cn(
					'flex items-center gap-2 px-2 py-1.5 rounded-lg',
					'text-sm text-gray-700 dark:text-gray-200',
					'bg-transparent hover:bg-gray-100 dark:hover:bg-zinc-800',
					'transition-colors duration-150',
					'focus:outline-none focus:ring-2 focus:ring-cyan-500/50',
				)}
				aria-expanded={showModal}
				aria-haspopup="dialog">
				<StatusIcon />
				<Avatar />
				<span className="font-medium max-w-[120px] truncate hidden sm:inline">
					{displayName}
				</span>
				<ChevronDown />
			</button>

			{/* Menu modal */}
			<MenuModal />

			{/* Styles using Starlight CSS variables for theme compatibility */}
			<style>{`
        /* Animations */
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        .animate-scale-in {
          animation: scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .h-safe-area-inset-bottom {
          height: env(safe-area-inset-bottom, 0px);
        }

        /* Modal backdrop */
        .nav-modal-backdrop {
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
        }

        /* Modal card - uses Starlight bg colors */
        .nav-modal-card {
          background: var(--sl-color-bg-nav, var(--sl-color-gray-6, #1e293b));
          border: 1px solid var(--sl-color-gray-5, rgba(255,255,255,0.1));
          backdrop-filter: blur(20px);
        }

        /* Accent glow */
        .nav-modal-glow {
          background: linear-gradient(
            135deg,
            var(--sl-color-accent-low, rgba(6, 182, 212, 0.1)) 0%,
            transparent 50%,
            var(--sl-color-accent-low, rgba(6, 182, 212, 0.05)) 100%
          );
        }

        /* Avatar */
        .nav-avatar-glow {
          background: var(--sl-color-accent, #06b6d4);
        }
        .nav-avatar-bg {
          background: var(--sl-color-gray-6, #1e293b);
        }

        /* Text colors */
        .nav-text {
          color: var(--sl-color-white, #fff);
        }
        .nav-text-muted {
          color: var(--sl-color-gray-3, #94a3b8);
        }

        /* Status indicators */
        .nav-status-border {
          border: 2px solid var(--sl-color-bg-nav, var(--sl-color-gray-6, #1e293b));
        }
        .nav-status-auth {
          background: var(--sl-color-green, #22c55e);
        }
        .nav-status-guest {
          background: var(--sl-color-orange, #f59e0b);
        }

        /* Close button - explicit transparent default */
        .nav-close-btn {
          background: transparent;
        }
        .nav-close-btn:hover {
          background: var(--sl-color-gray-5, rgba(255,255,255,0.1));
          color: var(--sl-color-white, #fff);
        }

        /* Divider */
        .nav-divider {
          background: linear-gradient(
            to right,
            transparent,
            var(--sl-color-gray-5, rgba(255,255,255,0.1)),
            transparent
          );
        }

        /* Menu items */
        .nav-menu-item {
          color: var(--sl-color-gray-2, #e2e8f0);
          background: transparent;
        }
        .nav-menu-item:hover {
          color: var(--sl-color-white, #fff);
          background: var(--sl-color-gray-5, rgba(255,255,255,0.08));
        }
        .nav-menu-item--primary {
          color: var(--sl-color-text-accent, var(--sl-color-accent, #06b6d4));
        }
        .nav-menu-item--primary:hover {
          background: var(--sl-color-accent-low, rgba(6, 182, 212, 0.12));
          color: var(--sl-color-accent-high, #22d3ee);
        }
        .nav-menu-item--danger {
          color: var(--sl-color-red, #ef4444);
        }
        .nav-menu-item--danger:hover {
          background: var(--sl-color-red-low, rgba(239, 68, 68, 0.12));
          color: var(--sl-color-red-high, #fca5a5);
        }

        /* Menu icons - transparent by default, subtle bg on hover */
        .nav-menu-icon {
          background: transparent;
        }
        .nav-menu-item:hover .nav-menu-icon {
          background: var(--sl-color-gray-5, rgba(255,255,255,0.08));
        }
        .nav-menu-icon--primary {
          background: transparent;
        }
        .nav-menu-item:hover .nav-menu-icon--primary {
          background: var(--sl-color-accent-low, rgba(6, 182, 212, 0.15));
        }
        .nav-menu-icon--danger {
          background: transparent;
        }
        .nav-menu-item:hover .nav-menu-icon--danger {
          background: var(--sl-color-red-low, rgba(239, 68, 68, 0.15));
        }
      `}</style>
		</>
	);
}
