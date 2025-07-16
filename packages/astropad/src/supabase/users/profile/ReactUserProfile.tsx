/** @jsxImportSource react */
import React, {
	useState,
	useEffect,
	useCallback,
	useRef,
	useMemo,
} from 'react';
import { useStore } from '@nanostores/react';
import { userClientService, supabase, userProfileService } from '@kbve/astropad';
import { Virtuoso } from 'react-virtuoso'
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { User, BadgeCheck, MailCheck, Link2, ListTree, X, Shield, Key, Bell, Palette, Globe, Download, Trash2, Eye, Settings, CreditCard, Activity, Users, Lock, Calendar } from 'lucide-react';

const cn = (...inputs: any[]) => {
	return twMerge(clsx(inputs));
};

const hideSkeleton = () => {
	const skeleton = document.querySelector(
		'[data-skeleton="user-profile"]',
	) as HTMLElement | null;

	if (skeleton && !skeleton.classList.contains('opacity-0')) {
		skeleton.className = cn(
			skeleton.className,
			'opacity-0 pointer-events-none transition-opacity duration-500 ease-out',
		);

		setTimeout(() => {
			skeleton.classList.add('invisible');
		}, 500);
	}
};

const userProfilePanels = [
	{
		id: 'profile',
		title: 'Profile Info',
		icon: <User className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Manage your email, phone, and display name.',
	},
	{
		id: 'username',
		title: 'Username',
		icon: <BadgeCheck className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Claim or update your username.',
	},
	{
		id: 'email',
		title: 'Email Verification',
		icon: <MailCheck className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Resend or verify your email address.',
	},
	{
		id: 'linked',
		title: 'Linked Accounts',
		icon: <Link2 className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Connect GitHub, Discord, or Google.',
	},
	{
		id: 'logs',
		title: 'Activity Log',
		icon: <ListTree className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'View recent profile activity logs.',
	},
	{
		id: 'security',
		title: 'Security Settings',
		icon: <Shield className="w-6 h-6" style={{ color: 'var(--sl-color-accent-high)' }} />,
		description: 'Manage two-factor authentication and security.',
	},
	{
		id: 'password',
		title: 'Change Password',
		icon: <Key className="w-6 h-6" style={{ color: 'var(--sl-color-accent-high)' }} />,
		description: 'Update your account password.',
	},
	{
		id: 'notifications',
		title: 'Notifications',
		icon: <Bell className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Configure notification preferences.',
	},
	{
		id: 'appearance',
		title: 'Appearance',
		icon: <Palette className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Customize theme and display settings.',
	},
	{
		id: 'language',
		title: 'Language & Region',
		icon: <Globe className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Set your preferred language and timezone.',
	},
	{
		id: 'export',
		title: 'Export Data',
		icon: <Download className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Download your account data and settings.',
	},
	{
		id: 'delete',
		title: 'Delete Account',
		icon: <Trash2 className="w-6 h-6" style={{ color: 'var(--sl-color-accent-high)' }} />,
		description: 'Permanently delete your account and data.',
	},
	{
		id: 'privacy',
		title: 'Privacy Settings',
		icon: <Eye className="w-6 h-6" style={{ color: 'var(--sl-color-gray-3)' }} />,
		description: 'Control who can see your profile information.',
	},
	{
		id: 'preferences',
		title: 'App Preferences',
		icon: <Settings className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Configure application behavior and defaults.',
	},
	{
		id: 'billing',
		title: 'Billing & Payments',
		icon: <CreditCard className="w-6 h-6" style={{ color: 'var(--sl-color-accent-high)' }} />,
		description: 'Manage subscription and payment methods.',
	},
	{
		id: 'analytics',
		title: 'Usage Analytics',
		icon: <Activity className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'View your account activity and statistics.',
	},
	{
		id: 'teams',
		title: 'Teams & Groups',
		icon: <Users className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Manage team memberships and invitations.',
	},
	{
		id: 'sessions',
		title: 'Active Sessions',
		icon: <Lock className="w-6 h-6" style={{ color: 'var(--sl-color-accent-high)' }} />,
		description: 'View and manage your active login sessions.',
	},
	{
		id: 'backup',
		title: 'Data Backup',
		icon: <Calendar className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Schedule automatic backups of your data.',
	},
	{
		id: 'api',
		title: 'API Access',
		icon: <Key className="w-6 h-6" style={{ color: 'var(--sl-color-accent-high)' }} />,
		description: 'Generate and manage API keys and tokens.',
	},
];

const renderGridShell = (
	panels: typeof userProfilePanels,
	setSelectedPanel: (id: string) => void
) => {
	const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);
	const [containerWidth, setContainerWidth] = useState(0);

	// Calculate responsive columns based on container width
	const { columnCount, columnWidth } = useMemo(() => {
		const minColumnWidth = 280;
		const maxColumnWidth = 320;
		const gap = 16;
		const padding = 32; // Account for container padding
		
		if (containerWidth === 0) {
			return { columnCount: 1, columnWidth: minColumnWidth };
		}
		
		const availableWidth = containerWidth - padding;
		const cols = Math.max(1, Math.floor((availableWidth + gap) / (minColumnWidth + gap)));
		const width = Math.min(maxColumnWidth, (availableWidth - (gap * (cols - 1))) / cols);
		
		return { columnCount: cols, columnWidth: width };
	}, [containerWidth]);

	// Convert panels into rows for the grid
	const rows = useMemo(() => {
		const result = [];
		for (let i = 0; i < panels.length; i += columnCount) {
			result.push(panels.slice(i, i + columnCount));
		}
		return result;
	}, [panels, columnCount]);

	// Handle container resize
	useEffect(() => {
		if (!containerRef) return;
		
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setContainerWidth(entry.contentRect.width);
			}
		});
		
		resizeObserver.observe(containerRef);
		setContainerWidth(containerRef.clientWidth);
		
		return () => resizeObserver.disconnect();
	}, [containerRef]);

	return (
		<div 
			ref={setContainerRef}
			className="w-full max-w-6xl mx-auto min-h-[500px] rounded-xl p-4 border"
			style={{
				backgroundColor: 'color-mix(in srgb, var(--sl-color-gray-6) 60%, transparent)',
				borderColor: 'color-mix(in srgb, var(--sl-color-gray-5) 30%, transparent)',
			}}
		>
			<Virtuoso
				data={rows}
				itemContent={(index, row) => (
					<div 
						className="flex gap-4 mb-4"
						style={{
							justifyContent: columnCount === 1 ? 'center' : 'flex-start',
						}}
					>
						{row.map((panel) => (
							<button
								key={panel.id}
								onClick={() => setSelectedPanel(panel.id)}
								className="group rounded-xl p-4 border transition text-left flex flex-col justify-start items-start overflow-hidden"
								style={{
									backgroundColor: 'var(--sl-color-gray-6)',
									borderColor: 'var(--sl-color-gray-5)',
									color: 'var(--sl-color-white)',
									width: columnWidth,
									minHeight: '140px',
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.backgroundColor = 'var(--sl-color-gray-5)';
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor = 'var(--sl-color-gray-6)';
								}}
							>
								<div className="mb-3 flex-shrink-0">{panel.icon}</div>
								<div className="font-semibold mb-2 flex-shrink-0" style={{ color: 'var(--sl-color-white)' }}>
									{panel.title}
								</div>
								<div 
									className="text-sm leading-relaxed flex-1 overflow-hidden" 
									style={{ 
										color: 'var(--sl-color-gray-3)',
										display: '-webkit-box',
										WebkitLineClamp: 3,
										WebkitBoxOrient: 'vertical',
									}}
								>
									{panel.description}
								</div>
							</button>
						))}
					</div>
				)}
				style={{ height: '500px' }}
			/>
		</div>
	);
};
const renderProfileHeader = (displayName: string) => {
	return (
		<div className="flex items-center justify-between">
			<div className="text-xl font-bold" style={{ color: 'var(--sl-color-white)' }}>
				Welcome, {displayName}
			</div>
		</div>
	);
};


export const ReactUserProfile = () => {
	const [selectedPanel, setSelectedPanel] = useState<null | string>(null);
	const [isVisible, setIsVisible] = useState(false);
	const user = useStore(userClientService.userAtom);

	const displayName = useMemo(() => {
		if (!user) return 'Guest';
		return (
			user.user_metadata?.display_name ||
			user.user_metadata?.username ||
			user.email ||
			'User'
		);
	}, [user]);

	// Memoize the header to prevent unnecessary re-renders
	const profileHeader = useMemo(() => {
		return renderProfileHeader(displayName);
	}, [displayName]);

	useEffect(() => {
		const handleSkeletonFadeOut = () => {
			hideSkeleton();
			setTimeout(() => {
				setIsVisible(true);
			}, 600); 
		};

		handleSkeletonFadeOut();
	}, []);

	// Initialize user service and sync data when component mounts
	// Safe to call multiple times - will only initialize once
	useEffect(() => {
		const initializeUser = async () => {
			try {
				await userClientService.initialize();
			} catch (error) {
				console.error('[ReactUserProfile] Failed to initialize user service:', error);
			}
		};

		initializeUser();
	}, []);

    return (
		<div className={cn(
			"p-6 space-y-6 min-h-[600px] transition-opacity duration-500 ease-in",
			isVisible ? "opacity-100" : "opacity-0"
		)}>
			{profileHeader}

			{renderGridShell(userProfilePanels, setSelectedPanel)}

		</div>
	);
};
