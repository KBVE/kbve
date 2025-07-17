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

const hideSkeleton = (ref?: React.RefObject<HTMLElement>) => {
	const elementsSet = new Set<HTMLElement>();

	if (ref?.current instanceof HTMLElement) {
		elementsSet.add(ref.current);
	}

	document.querySelectorAll('#user-profile-skeleton').forEach((el) => {
		if (el instanceof HTMLElement) {
			elementsSet.add(el);
		}
	});

	document.querySelectorAll('[data-skeleton="user-profile"]').forEach((el) => {
		if (el instanceof HTMLElement) {
			elementsSet.add(el);
		}
	});

	const elements = Array.from(elementsSet);

	if (elements.length === 0) return;

	elements.forEach((skeleton) => {
		if (!skeleton.classList.contains('opacity-0')) {
			skeleton.className = cn(
				skeleton.className,
				'opacity-0 pointer-events-none transition-opacity duration-500 ease-out'
			);

			setTimeout(() => {
				skeleton.classList.add('invisible');
			}, 500);
		}
	});
};

const populateUsernameElements = (username: string) => {
	const usernameElements = document.querySelectorAll(
		'[data-object="username_$string"]',
	) as NodeListOf<HTMLElement>;

	usernameElements.forEach((element) => {
		if (element.textContent && element.textContent.trim() === username) {
			return;
		}

		element.style.opacity = '0';
		element.style.transform = 'translateY(8px)';
		element.style.transition = 'opacity 1200ms cubic-bezier(0.4, 0, 0.2, 1), transform 1200ms cubic-bezier(0.4, 0, 0.2, 1)';
		element.textContent = username;
		requestAnimationFrame(() => {
			setTimeout(() => {
				element.style.opacity = '1';
				element.style.transform = 'translateY(0)';
			}, 50); 
		});
	});
};

const userProfilePanels = [
	{
		id: 'profile',
		title: 'Profile Info',
		icon: <User className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Manage your email, phone, and display name.',
		size: 'big' as const, // 2x2 - most important
	},
	{
		id: 'username',
		title: 'Username',
		icon: <BadgeCheck className="w-6 h-6" style={{ color: 'var(--sl-color-accent)' }} />,
		description: 'Claim or update your username.',
		size: 'medium' as const,
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
		size: 'tall' as const,
	},
	{
		id: 'security',
		title: 'Security Settings',
		icon: <Shield className="w-6 h-6" style={{ color: 'var(--sl-color-accent-high)' }} />,
		description: 'Manage two-factor authentication and security.',
		size: 'large' as const, // More important - make it larger
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
		size: 'wide' as const,
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
		size: 'large' as const, // Make it larger for better grid balance
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
		size: 'tall' as const, // Make it tall for better variety
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

	// Organize panels into rows for virtualization with optimized bento grid packing
	const organizedRows = useMemo(() => {
		const rows: (typeof userProfilePanels)[] = [];
		
		// Create a grid state to track occupied cells
		const gridState: boolean[][] = [];
		
		// Initialize grid state
		const initializeRow = (rowIndex: number) => {
			if (!gridState[rowIndex]) {
				gridState[rowIndex] = new Array(columnCount).fill(false);
			}
		};
		
		// Calculate area for sorting (prioritize larger panels)
		const getPanelArea = (panel: typeof userProfilePanels[0]) => {
			const { width, height } = getPanelSize(panel.size);
			return width * height;
		};
		
		// Sort panels by area (descending) and then by priority
		const sortedPanels = [...panels].sort((a, b) => {
			const areaA = getPanelArea(a);
			const areaB = getPanelArea(b);
			
			// First, sort by area (larger first)
			if (areaA !== areaB) {
				return areaB - areaA;
			}
			
			// Then by size priority (wide > large > tall > medium)
			const sizePriority = { wide: 4, large: 3, tall: 2, medium: 1, big: 5 };
			return sizePriority[b.size] - sizePriority[a.size];
		});
		
		// Find the best position for a panel using a more sophisticated algorithm
		const findBestPosition = (width: number, height: number) => {
			let bestPosition = null;
			let bestScore = -1;
			
			// Try to find positions up to a reasonable number of rows
			for (let row = 0; row < gridState.length + 3; row++) {
				initializeRow(row);
				
				for (let col = 0; col <= columnCount - width; col++) {
					let canPlace = true;
					
					// Check if position is available
					for (let r = row; r < row + height; r++) {
						initializeRow(r);
						for (let c = col; c < col + width; c++) {
							if (gridState[r][c]) {
								canPlace = false;
								break;
							}
						}
						if (!canPlace) break;
					}
					
					if (canPlace) {
						// Calculate score based on:
						// 1. Prefer positions that are closer to the top-left
						// 2. Prefer positions that fill gaps better
						// 3. Prefer positions that create less fragmentation
						
						let score = 0;
						
						// Prefer higher positions (lower row numbers)
						score += (100 - row * 10);
						
						// Prefer leftmost positions
						score += (columnCount - col);
						
						// Bonus for filling gaps (adjacent to existing panels)
						let adjacentBonus = 0;
						for (let r = row; r < row + height; r++) {
							for (let c = col; c < col + width; c++) {
								// Check adjacent cells
								const adjacent = [
									[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]
								];
								
								for (const [ar, ac] of adjacent) {
									if (ar >= 0 && ar < gridState.length && ac >= 0 && ac < columnCount) {
										if (gridState[ar] && gridState[ar][ac]) {
											adjacentBonus += 5;
										}
									}
								}
							}
						}
						score += adjacentBonus;
						
						// Penalty for creating holes/gaps
						let gapPenalty = 0;
						for (let r = row; r < row + height; r++) {
							for (let c = col; c < col + width; c++) {
								// Check if placing here creates isolated gaps
								const neighbors = [
									[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]
								];
								
								let emptyNeighbors = 0;
								for (const [nr, nc] of neighbors) {
									if (nr >= 0 && nr < gridState.length && nc >= 0 && nc < columnCount) {
										if (!gridState[nr] || !gridState[nr][nc]) {
											emptyNeighbors++;
										}
									}
								}
								
								if (emptyNeighbors > 2) {
									gapPenalty += 2;
								}
							}
						}
						score -= gapPenalty;
						
						if (score > bestScore) {
							bestScore = score;
							bestPosition = { row, col };
						}
					}
				}
			}
			
			return bestPosition;
		};
		
		// Place panels using the optimized algorithm
		const placedPanels = new Map<number, typeof userProfilePanels[0][]>();
		const remainingPanels = [...sortedPanels];
		
		// First pass: Place larger panels optimally
		for (let i = remainingPanels.length - 1; i >= 0; i--) {
			const panel = remainingPanels[i];
			const { width, height } = getPanelSize(panel.size);
			const position = findBestPosition(width, height);
			
			if (position) {
				const { row, col } = position;
				
				// Mark cells as occupied
				for (let r = row; r < row + height; r++) {
					initializeRow(r);
					for (let c = col; c < col + width; c++) {
						gridState[r][c] = true;
					}
				}
				
				// Add panel to the appropriate row
				if (!placedPanels.has(row)) {
					placedPanels.set(row, []);
				}
				placedPanels.get(row)!.push(panel);
				
				// Remove from remaining panels
				remainingPanels.splice(i, 1);
			}
		}
		
		// Second pass: Fill gaps with remaining panels (gap-filling optimization)
		const findGapPosition = (width: number, height: number) => {
			// Look for gaps in existing rows first
			for (let row = 0; row < gridState.length; row++) {
				if (!gridState[row]) continue;
				
				for (let col = 0; col <= columnCount - width; col++) {
					let canPlace = true;
					
					for (let r = row; r < row + height; r++) {
						if (r >= gridState.length) {
							initializeRow(r);
						}
						for (let c = col; c < col + width; c++) {
							if (gridState[r][c]) {
								canPlace = false;
								break;
							}
						}
						if (!canPlace) break;
					}
					
					if (canPlace) {
						return { row, col };
					}
				}
			}
			
			// If no gaps found, use the regular best position algorithm
			return findBestPosition(width, height);
		};
		
		// Try to place remaining panels in gaps
		for (let i = remainingPanels.length - 1; i >= 0; i--) {
			const panel = remainingPanels[i];
			const { width, height } = getPanelSize(panel.size);
			const position = findGapPosition(width, height);
			
			if (position) {
				const { row, col } = position;
				
				// Mark cells as occupied
				for (let r = row; r < row + height; r++) {
					initializeRow(r);
					for (let c = col; c < col + width; c++) {
						gridState[r][c] = true;
					}
				}
				
				// Add panel to the appropriate row
				if (!placedPanels.has(row)) {
					placedPanels.set(row, []);
				}
				placedPanels.get(row)!.push(panel);
				
				// Remove from remaining panels
				remainingPanels.splice(i, 1);
			}
		}
		
		// Convert to array format, filling empty rows
		const maxRow = Math.max(...placedPanels.keys());
		for (let i = 0; i <= maxRow; i++) {
			rows[i] = placedPanels.get(i) || [];
		}
		
		// Calculate grid efficiency for debugging
		const totalCells = gridState.reduce((total, row) => total + row.length, 0);
		const occupiedCells = gridState.reduce((total, row) => 
			total + row.reduce((rowTotal, cell) => rowTotal + (cell ? 1 : 0), 0), 0);
		const efficiency = totalCells > 0 ? (occupiedCells / totalCells) * 100 : 0;
		
		// Log efficiency for debugging (can be removed in production)
		if (process.env.NODE_ENV === 'development') {
			console.log(`Grid efficiency: ${efficiency.toFixed(1)}% (${occupiedCells}/${totalCells} cells)`);
		}
		
		// Clean up empty rows
		return rows.filter(row => row.length > 0);
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
				style={{ height: '700px' }}
				data={organizedRows}
				itemContent={(index, rowPanels) => {
					if (rowPanels.length === 0) return null;
					
					// Calculate the maximum height needed for this row
					const maxHeight = Math.max(...rowPanels.map(panel => getPanelSize(panel.size).height));
					
					// Create a more compact grid layout
					const baseHeight = 160; // Increased base height for better content display
					const gap = 16;
					const totalHeight = maxHeight * baseHeight + (maxHeight - 1) * gap;
					
					return (
						<div 
							className="grid gap-4 mb-4"
							style={{
								gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
								gridAutoRows: `${baseHeight}px`,
								minHeight: `${totalHeight}px`,
							}}
						>
							{rowPanels.map((panel) => {
								const { width, height } = getPanelSize(panel.size);
								
								// Add visual variety based on panel size
								const getPanelStyles = () => {
									const baseStyles = {
										backgroundColor: 'var(--sl-color-gray-6)',
										borderColor: 'var(--sl-color-gray-5)',
										color: 'var(--sl-color-white)',
										gridColumn: `span ${width}`,
										gridRow: `span ${height}`,
									};
									
									// Add size-specific styling
									switch (panel.size) {
										case 'big':
											return {
												...baseStyles,
												backgroundImage: 'linear-gradient(135deg, var(--sl-color-gray-6) 0%, var(--sl-color-gray-5) 100%)',
											};
										case 'wide':
											return {
												...baseStyles,
												backgroundImage: 'linear-gradient(90deg, var(--sl-color-gray-6) 0%, var(--sl-color-gray-5) 100%)',
											};
										case 'tall':
											return {
												...baseStyles,
												backgroundImage: 'linear-gradient(0deg, var(--sl-color-gray-6) 0%, var(--sl-color-gray-5) 100%)',
											};
										case 'large':
											return {
												...baseStyles,
												backgroundImage: 'linear-gradient(45deg, var(--sl-color-gray-6) 0%, var(--sl-color-gray-5) 100%)',
											};
										default:
											return baseStyles;
									}
								};
								
								return (
									<button
										key={panel.id}
										onClick={() => setSelectedPanel(panel.id)}
										className="group rounded-xl p-6 border transition-all duration-300 text-left flex flex-col justify-start items-start overflow-hidden hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
										style={getPanelStyles()}
										onMouseEnter={(e) => {
											e.currentTarget.style.backgroundColor = 'var(--sl-color-gray-5)';
											e.currentTarget.style.borderColor = 'var(--sl-color-accent)';
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.backgroundColor = 'var(--sl-color-gray-6)';
											e.currentTarget.style.borderColor = 'var(--sl-color-gray-5)';
										}}
									>
										<div className="mb-4 flex-shrink-0 transition-transform duration-300 group-hover:scale-110">
											{panel.icon}
										</div>
										<div className="font-semibold mb-3 flex-shrink-0 text-lg" style={{ color: 'var(--sl-color-white)' }}>
											{panel.title}
										</div>
										<div 
											className="text-sm leading-relaxed flex-1 overflow-hidden opacity-80" 
											style={{ 
												color: 'var(--sl-color-gray-2)',
												display: '-webkit-box',
												WebkitLineClamp: height > 1 ? (height === 2 ? 8 : 4) : 3,
												WebkitBoxOrient: 'vertical',
											}}
										>
											{panel.description}
										</div>
										{/* Enhanced size indicator */}
										{panel.size !== 'medium' && (
											<div 
												className="text-xs mt-3 px-3 py-1 rounded-full font-medium"
												style={{
													backgroundColor: 'var(--sl-color-accent)',
													color: 'var(--sl-color-white)',
													opacity: 0.8,
												}}
											>
												{panel.size}
											</div>
										)}
									</button>
								);
							})}
						</div>
					);
				}}
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
