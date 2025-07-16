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
import { Virtuoso } from 'react-virtuoso';
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

const populateUsernameElements = (username: string) => {
	// Find all elements with data-object="username_$string"
	const usernameElements = document.querySelectorAll(
		'[data-object="username_$string"]',
	) as NodeListOf<HTMLElement>;

	usernameElements.forEach((element) => {
		// Skip if the element already contains the correct username
		if (element.textContent && element.textContent.trim() === username) {
			return;
		}

		// Set initial state for smoother fade-in animation
		element.style.opacity = '0';
		element.style.transform = 'translateY(8px)'; // Subtle slide-up effect
		element.style.transition = 'opacity 1200ms cubic-bezier(0.4, 0, 0.2, 1), transform 1200ms cubic-bezier(0.4, 0, 0.2, 1)';
		
		// Set the username text (replaces any existing content like ":)")
		element.textContent = username;
		
		// Trigger smoother fade-in animation with slight delay
		requestAnimationFrame(() => {
			setTimeout(() => {
				element.style.opacity = '1';
				element.style.transform = 'translateY(0)';
			}, 50); // Small delay for smoother effect
		});
	});
};

const userProfilePanels = [
	{
		id: 'profile',
		title: 'Profile Info',
		icon: <User className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Manage your email, phone, and display name.',
		size: 'large' as const, // Takes up 2 columns
	},
	{
		id: 'username',
		title: 'Username',
		icon: <BadgeCheck className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Claim or update your username.',
		size: 'medium' as const, // Standard size
	},
	{
		id: 'email',
		title: 'Email Verification',
		icon: <MailCheck className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Resend or verify your email address.',
		size: 'medium' as const,
	},
	{
		id: 'linked',
		title: 'Linked Accounts',
		icon: <Link2 className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Connect GitHub, Discord, or Google.',
		size: 'large' as const,
	},
	{
		id: 'logs',
		title: 'Activity Log',
		icon: <ListTree className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'View recent profile activity logs.',
		size: 'tall' as const, // Takes up 2 rows
	},
	{
		id: 'security',
		title: 'Security Settings',
		icon: <Shield className="w-6 h-6" style={{ color: 'var(--sl-color-accent-high)' }} />,
		description: 'Manage two-factor authentication and security.',
		size: 'medium' as const,
	},
	{
		id: 'password',
		title: 'Change Password',
		icon: <Key className="w-6 h-6" style={{ color: 'var(--sl-color-accent-high)' }} />,
		description: 'Update your account password.',
		size: 'medium' as const,
	},
	{
		id: 'notifications',
		title: 'Notifications',
		icon: <Bell className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Configure notification preferences.',
		size: 'medium' as const,
	},
	{
		id: 'appearance',
		title: 'Appearance',
		icon: <Palette className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Customize theme and display settings.',
		size: 'medium' as const,
	},
	{
		id: 'language',
		title: 'Language & Region',
		icon: <Globe className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Set your preferred language and timezone.',
		size: 'medium' as const,
	},
	{
		id: 'export',
		title: 'Export Data',
		icon: <Download className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Download your account data and settings.',
		size: 'medium' as const,
	},
	{
		id: 'delete',
		title: 'Delete Account',
		icon: <Trash2 className="w-6 h-6" style={{ color: 'var(--sl-color-accent-high)' }} />,
		description: 'Permanently delete your account and data.',
		size: 'wide' as const, // Takes up full width
	},
	{
		id: 'privacy',
		title: 'Privacy Settings',
		icon: <Eye className="w-6 h-6" style={{ color: 'var(--sl-color-gray-3)' }} />,
		description: 'Control who can see your profile information.',
		size: 'medium' as const,
	},
	{
		id: 'preferences',
		title: 'App Preferences',
		icon: <Settings className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Configure application behavior and defaults.',
		size: 'medium' as const,
	},
	{
		id: 'billing',
		title: 'Billing & Payments',
		icon: <CreditCard className="w-6 h-6" style={{ color: 'var(--sl-color-accent-high)' }} />,
		description: 'Manage subscription and payment methods.',
		size: 'large' as const,
	},
	{
		id: 'analytics',
		title: 'Usage Analytics',
		icon: <Activity className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'View your account activity and statistics.',
		size: 'tall' as const,
	},
	{
		id: 'teams',
		title: 'Teams & Groups',
		icon: <Users className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Manage team memberships and invitations.',
		size: 'medium' as const,
	},
	{
		id: 'sessions',
		title: 'Active Sessions',
		icon: <Lock className="w-6 h-6" style={{ color: 'var(--sl-color-accent-high)' }} />,
		description: 'View and manage your active login sessions.',
		size: 'medium' as const,
	},
	{
		id: 'backup',
		title: 'Data Backup',
		icon: <Calendar className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Schedule automatic backups of your data.',
		size: 'medium' as const,
	},
	{
		id: 'api',
		title: 'API Access',
		icon: <Key className="w-6 h-6" style={{ color: 'var(--sl-color-accent-high)' }} />,
		description: 'Generate and manage API keys and tokens.',
		size: 'medium' as const,
	},
];

const renderGridShell = (
	panels: typeof userProfilePanels,
	setSelectedPanel: (id: string) => void
) => {
	const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);
	const [containerWidth, setContainerWidth] = useState(0);

	// Calculate responsive columns based on container width
	const columnCount = useMemo(() => {
		const minColumnWidth = 280;
		const gap = 16;
		const padding = 32;
		
		if (containerWidth === 0) return 3; // Default
		
		const availableWidth = containerWidth - padding;
		return Math.max(1, Math.floor((availableWidth + gap) / (minColumnWidth + gap)));
	}, [containerWidth]);

	// Helper function to get panel dimensions
	const getPanelSize = (size: string) => {
		switch (size) {
			case 'large':
				return { width: Math.min(2, columnCount), height: 1 }; // 2 columns, 1 row
			case 'tall':
				return { width: 1, height: 2 }; // 1 column, 2 rows
			case 'wide':
				return { width: columnCount, height: 1 }; // Full width
			case 'big':
				return { width: Math.min(2, columnCount), height: 2 }; // 2x2 grid
			default: // 'medium'
				return { width: 1, height: 1 }; // 1x1 grid
		}
	};

	// Organize panels into rows for virtualization while maintaining bento grid flow
	const organizedRows = useMemo(() => {
		const rows: typeof userProfilePanels[] = [];
		let currentRow: typeof userProfilePanels = [];
		let currentRowWidth = 0;
		
		panels.forEach((panel) => {
			const { width } = getPanelSize(panel.size);
			
			// Check if panel fits in current row
			if (currentRowWidth + width <= columnCount) {
				currentRow.push(panel);
				currentRowWidth += width;
			} else {
				// Start new row
				if (currentRow.length > 0) {
					rows.push([...currentRow]);
				}
				currentRow = [panel];
				currentRowWidth = width;
			}
		});
		
		// Add remaining panels
		if (currentRow.length > 0) {
			rows.push(currentRow);
		}
		
		return rows;
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
			{/* Virtuoso wrapping the bento grid */}
			<Virtuoso
				style={{ height: '600px' }}
				data={organizedRows}
				itemContent={(index, rowPanels) => (
					<div 
						className="grid gap-4 mb-4"
						style={{
							gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
							gridAutoRows: '140px',
						}}
					>
						{rowPanels.map((panel) => {
							const { width, height } = getPanelSize(panel.size);
							
							return (
								<button
									key={panel.id}
									onClick={() => setSelectedPanel(panel.id)}
									className="group rounded-xl p-4 border transition text-left flex flex-col justify-start items-start overflow-hidden"
									style={{
										backgroundColor: 'var(--sl-color-gray-6)',
										borderColor: 'var(--sl-color-gray-5)',
										color: 'var(--sl-color-white)',
										gridColumn: `span ${width}`,
										gridRow: `span ${height}`,
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
											WebkitLineClamp: height > 1 ? 6 : 3, // More lines for taller panels
											WebkitBoxOrient: 'vertical',
										}}
									>
										{panel.description}
									</div>
									{/* Show size indicator for demonstration */}
									{panel.size !== 'medium' && (
										<div 
											className="text-xs mt-2 px-2 py-1 rounded"
											style={{
												backgroundColor: 'var(--sl-color-accent)',
												color: 'var(--sl-color-white)',
											}}
										>
											{panel.size}
										</div>
									)}
								</button>
							);
						})}
					</div>
				)}
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

	// Populate username elements when displayName changes
	useEffect(() => {
		if (displayName && displayName !== 'Guest') {
			// Use a slight delay to ensure DOM is ready
			const timeoutId = setTimeout(() => {
				populateUsernameElements(displayName);
			}, 100);

			return () => clearTimeout(timeoutId);
		}
	}, [displayName]);

	useEffect(() => {
		const handleSkeletonFadeOut = () => {
			hideSkeleton();
			setTimeout(() => {
				setIsVisible(true);
				// Also populate username elements after component becomes visible
				if (displayName && displayName !== 'Guest') {
					populateUsernameElements(displayName);
				}
			}, 600); 
		};

		handleSkeletonFadeOut();
	}, [displayName]);

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
