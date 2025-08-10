/** @jsxImportSource react */
import React, {
	useEffect,
	useState,
	useCallback,
	memo,
	useRef,
} from 'react';
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { 
	Activity, 
	Users, 
	Server, 
	Zap,
	Clock,
	TrendingUp,
	AlertCircle,
	CheckCircle,
	ArrowDown,
	Infinity,
	ArrowUp
} from 'lucide-react';
import { cn } from '../../../utils/cn';

type LogEntry = {
	id: string;
	timestamp: string;
	level: 'info' | 'warning' | 'error' | 'success';
	message: string;
	user?: string;
	server?: string;
};

type Stats = {
	activeUsers: number;
	totalServers: number;
	uptime: string;
	requestsPerMinute: number;
};

// Mock data generator for demo
const generateMockLog = (index: number): LogEntry => {
	const levels: LogEntry['level'][] = ['info', 'warning', 'error', 'success'];
	const messages = [
		'User joined voice channel',
		'Command executed successfully',
		'Server configuration updated',
		'New member joined server',
		'Moderation action performed',
		'Bot permissions updated',
		'Webhook triggered',
		'API rate limit warning',
		'Database connection established',
		'Cache cleared successfully',
		'Voice channel created',
		'Message pinned in channel',
		'Role assigned to user',
		'Emoji reaction added',
		'Stream started',
		'Game activity detected',
		'Server boost received',
		'Invite link created',
		'Channel permissions updated',
		'Auto-moderation triggered'
	];
	
	const users = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
	const servers = ['Gaming Hub', 'Dev Community', 'Music Lounge', 'Art Gallery', 'Study Group', 'Movie Night'];
	
	return {
		id: `log-${index}`,
		timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
		level: levels[Math.floor(Math.random() * levels.length)],
		message: messages[Math.floor(Math.random() * messages.length)],
		user: users[Math.floor(Math.random() * users.length)],
		server: servers[Math.floor(Math.random() * servers.length)]
	};
};

const fetchLogs = async (page: number): Promise<LogEntry[]> => {
	// Simulate API call with mock data - reduced delay for smoother feel
	await new Promise(resolve => setTimeout(resolve, 150));
	return Array.from({ length: 15 }, (_, i) => generateMockLog(page * 15 + i));
};

const fetchStats = async (): Promise<Stats> => {
	// Simulate API call
	await new Promise(resolve => setTimeout(resolve, 100));
	return {
		activeUsers: Math.floor(Math.random() * 1000) + 200,
		totalServers: Math.floor(Math.random() * 50) + 10,
		uptime: '99.9%',
		requestsPerMinute: Math.floor(Math.random() * 500) + 100
	};
};

export default function ReactFooter() {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [stats, setStats] = useState<Stats | null>(null);
	const [page, setPage] = useState(0);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(true);
	const [isPreloading, setIsPreloading] = useState(false);
	const [scrollControlActive, setScrollControlActive] = useState(false);
	const [showBackToTop, setShowBackToTop] = useState(false);
	const [virtualScrollOffset, setVirtualScrollOffset] = useState(0);
	
	const listRef = useRef<List>(null);
	const preloadTriggered = useRef(false);
	const footerRef = useRef<HTMLDivElement>(null);
	const originalScrollY = useRef(0);
	const scrollControlEnabled = useRef(false);

	// Load initial stats
	useEffect(() => {
		fetchStats().then(setStats);
		const interval = setInterval(() => {
			fetchStats().then(setStats);
		}, 30000); // Update every 30 seconds
		
		return () => clearInterval(interval);
	}, []);

	const loadMore = useCallback(async (isPreload = false) => {
		if (isLoadingMore || (!hasMore && !isPreload)) return;
		
		if (isPreload) {
			setIsPreloading(true);
		} else {
			setIsLoadingMore(true);
		}
		
		try {
			const newLogs = await fetchLogs(page);
			if (newLogs.length === 0) {
				setHasMore(false);
			} else {
				setLogs(prev => [...prev, ...newLogs]);
				setPage(prev => prev + 1);
			}
		} catch (error) {
			console.error('Failed to load logs:', error);
		} finally {
			if (isPreload) {
				setIsPreloading(false);
			} else {
				setIsLoadingMore(false);
			}
		}
	}, [page, isLoadingMore, hasMore]);

	// Initial load
	useEffect(() => {
		loadMore();
	}, []);

	// Global scroll hijacking logic
	useEffect(() => {
		const handleGlobalScroll = (e: WheelEvent) => {
			if (!scrollControlEnabled.current || !footerRef.current) return;

			// Check if we're at the bottom of the page and trying to scroll down
			const isAtBottom = (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 10; // 10px threshold
			const isScrollingDown = e.deltaY > 0;
			
			if (isAtBottom && isScrollingDown && !scrollControlActive) {
				// Reached bottom and trying to scroll down - activate scroll control
				originalScrollY.current = window.scrollY;
				setScrollControlActive(true);
				setShowBackToTop(true);
				scrollControlEnabled.current = true;
				
				// Lock body scroll
				document.body.style.overflow = 'hidden';
			}

			// Prevent default scroll behavior when footer controls are active
			if (scrollControlActive) {
				e.preventDefault();
				e.stopPropagation();

				// Convert wheel delta to virtual scroll
				const delta = e.deltaY;
				setVirtualScrollOffset(prev => {
					const newOffset = Math.max(0, prev + delta);
					
					// Forward scroll to react-window list
					if (listRef.current) {
						listRef.current.scrollTo(newOffset);
					}
					
					return newOffset;
				});
			}
		};

		const handlePageScroll = () => {
			// If user scrolls up significantly while footer control is active, deactivate it
			if (scrollControlActive && window.scrollY < originalScrollY.current - 100) {
				setScrollControlActive(false);
				scrollControlEnabled.current = false;
				setShowBackToTop(false);
				
				// Restore body scroll
				document.body.style.overflow = '';
			}
		};

		// Add wheel event listener for scroll hijacking
		document.addEventListener('wheel', handleGlobalScroll, { passive: false });
		
		// Add scroll listener for deactivation
		document.addEventListener('scroll', handlePageScroll, { passive: true });

		return () => {
			document.removeEventListener('wheel', handleGlobalScroll);
			document.removeEventListener('scroll', handlePageScroll);
			document.body.style.overflow = ''; // Cleanup
		};
	}, [scrollControlActive]);

	// Back to top functionality
	const scrollToTop = useCallback(() => {
		setScrollControlActive(false);
		setShowBackToTop(false);
		scrollControlEnabled.current = false;
		document.body.style.overflow = '';
		
		// Smooth scroll to top
		window.scrollTo({
			top: 0,
			behavior: 'smooth'
		});
	}, []);

	const getLevelIcon = (level: LogEntry['level']) => {
		switch (level) {
			case 'error':
				return <AlertCircle className="w-3 h-3 text-red-400" />;
			case 'warning':
				return <AlertCircle className="w-3 h-3 text-yellow-400" />;
			case 'success':
				return <CheckCircle className="w-3 h-3 text-green-400" />;
			default:
				return <Activity className="w-3 h-3 text-blue-400" />;
		}
	};

	// Enhanced scroll handling with look-ahead
	const handleListScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }: { scrollOffset: number; scrollUpdateWasRequested: boolean }) => {
		setVirtualScrollOffset(scrollOffset);
		
		if (scrollUpdateWasRequested) return;
		
		const listHeight = 480; // h-[30rem] = 30rem = 480px
		const rowHeight = 80;
		const totalHeight = logs.length * rowHeight;
		const scrollBottom = scrollOffset + listHeight;
		
		// Look-ahead preloading - trigger when 70% through content
		const preloadThreshold = totalHeight * 0.7;
		if (scrollOffset >= preloadThreshold && hasMore && !isPreloading && !preloadTriggered.current) {
			preloadTriggered.current = true;
			loadMore(true);
			
			// Reset preload trigger after a delay
			setTimeout(() => {
				preloadTriggered.current = false;
			}, 2000);
		}
		
		// Main loading trigger - when near bottom
		if (scrollBottom >= totalHeight - 160 && hasMore && !isLoadingMore) {
			loadMore();
		}
	}, [logs.length, hasMore, isLoadingMore, isPreloading, loadMore]);

	const Row = memo(({ index, style }: ListChildComponentProps) => {
		const log = logs[index];
		
		if (!log) {
			// Show skeleton loader for items being preloaded
			return (
				<div 
					style={{
						...style,
						height: (style?.height as number) - 8,
						top: (style?.top as number) + 4,
						width: (style?.width as number) - 24,
						left: 12,
					}}
					className="flex items-start gap-3 p-4 rounded-lg bg-gradient-to-r from-[#2b2740]/50 to-[#312d4b]/50 border border-purple-500/5 animate-pulse w-full"
				>
					<div className="w-3 h-3 bg-purple-500/20 rounded-full mt-0.5" />
					<div className="flex-1">
						<div className="h-4 bg-purple-500/20 rounded w-3/4 mb-2" />
						<div className="h-3 bg-purple-500/10 rounded w-1/2" />
					</div>
				</div>
			);
		}

		const time = new Date(log.timestamp).toLocaleTimeString();
		
		return (
			<div
				style={{
					...style,
					height: (style?.height as number) - 8, // Reduce height to add padding
					top: (style?.top as number) + 4, // Offset for top padding
					width: (style?.width as number) - 24, // Account for margins
					left: 12, // Center with margin offset
				}}
				className={cn(
					"flex items-start gap-3 p-4 rounded-lg w-full",
					"bg-gradient-to-r from-[#2b2740] to-[#312d4b]",
					"border border-purple-500/10 hover:border-purple-500/30",
					"transition-all duration-300 hover:shadow-lg hover:scale-[1.01]",
					"text-sm group"
				)}
			>
				<div className="flex-shrink-0 mt-0.5 transition-transform group-hover:scale-110">
					{getLevelIcon(log.level)}
				</div>
				<div className="flex-1 min-w-0 overflow-hidden pr-2">
					<div className="flex items-center justify-between gap-2 mb-1">
						<span className="font-medium text-purple-300 truncate flex-1">{log.message}</span>
						<span className="text-xs text-gray-500 shrink-0 flex items-center gap-1">
							<Clock className="w-3 h-3" />
							{time}
						</span>
					</div>
					<div className="flex items-center justify-between gap-2 text-xs text-gray-500">
						<div className="flex items-center gap-3">
							{log.user && (
								<span className="flex items-center gap-1">
									<Users className="w-3 h-3" />
									<span className="truncate max-w-24">{log.user}</span>
								</span>
							)}
							{log.server && (
								<span className="flex items-center gap-1">
									<Server className="w-3 h-3" />
									<span className="truncate max-w-32">{log.server}</span>
								</span>
							)}
						</div>
						<div className="text-xs text-purple-400/60 capitalize shrink-0">
							{log.level}
						</div>
					</div>
				</div>
			</div>
		);
	});

	Row.displayName = 'LogRow';

	return (
		<div ref={footerRef} className="w-full">
			{/* Back to Top Button */}
			{showBackToTop && (
				<button
					onClick={scrollToTop}
					className={cn(
						"fixed top-8 right-8 z-50 p-3 rounded-full",
						"bg-gradient-to-r from-purple-600 to-purple-500",
						"text-white shadow-lg hover:shadow-xl",
						"transition-all duration-300 hover:scale-110",
						"border border-purple-400/20",
						scrollControlActive 
							? "animate-pulse ring-2 ring-purple-400/50" 
							: "hover:from-purple-500 hover:to-purple-400"
					)}
					title="Back to top"
				>
					<ArrowUp className="w-5 h-5" />
				</button>
			)}

			{/* Scroll Control Indicator */}
			{scrollControlActive && (
				<div className="fixed top-8 left-8 z-40 flex items-center gap-2 px-4 py-2 bg-purple-900/80 backdrop-blur-sm rounded-full border border-purple-500/30">
					<Infinity className="w-4 h-4 text-purple-300 animate-pulse" />
					<span className="text-sm text-purple-200">Infinite scroll mode active</span>
				</div>
			)}

			{/* Stats Bar */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
				<div className="text-center group">
					<div className="flex items-center justify-center gap-2 text-purple-400 mb-1 transition-colors group-hover:text-purple-300">
						<Users className="w-4 h-4" />
						<span className="text-xs uppercase tracking-wide">Active Users</span>
					</div>
					<p className="text-2xl font-bold text-purple-100 transition-all group-hover:scale-105">
						{stats?.activeUsers.toLocaleString() || '---'}
					</p>
				</div>
				<div className="text-center group">
					<div className="flex items-center justify-center gap-2 text-purple-400 mb-1 transition-colors group-hover:text-purple-300">
						<Server className="w-4 h-4" />
						<span className="text-xs uppercase tracking-wide">Servers</span>
					</div>
					<p className="text-2xl font-bold text-purple-100 transition-all group-hover:scale-105">
						{stats?.totalServers || '---'}
					</p>
				</div>
				<div className="text-center group">
					<div className="flex items-center justify-center gap-2 text-purple-400 mb-1 transition-colors group-hover:text-purple-300">
						<TrendingUp className="w-4 h-4" />
						<span className="text-xs uppercase tracking-wide">Uptime</span>
					</div>
					<p className="text-2xl font-bold text-purple-100 transition-all group-hover:scale-105">
						{stats?.uptime || '---'}
					</p>
				</div>
				<div className="text-center group">
					<div className="flex items-center justify-center gap-2 text-purple-400 mb-1 transition-colors group-hover:text-purple-300">
						<Zap className="w-4 h-4" />
						<span className="text-xs uppercase tracking-wide">Requests/min</span>
					</div>
					<p className="text-2xl font-bold text-purple-100 transition-all group-hover:scale-105">
						{stats?.requestsPerMinute || '---'}
					</p>
				</div>
			</div>

			{/* Activity Feed */}
			<div>
				<h3 className="text-sm text-purple-400 mb-3 flex items-center gap-2">
					<Activity className="w-4 h-4" /> 
					Live Activity Feed
					{scrollControlActive && (
						<div className="ml-2 flex items-center gap-1 text-xs text-purple-300">
							<div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
							Global scroll active
						</div>
					)}
					{isPreloading && (
						<div className="ml-2 flex items-center gap-1 text-xs text-purple-500">
							<div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
							Preloading...
						</div>
					)}
				</h3>

				<div className="relative h-[30rem] rounded-lg border border-purple-500/20 bg-[#1a1825] overflow-hidden">
					<AutoSizer>
						{({ height, width }) => (
							<List
								ref={listRef}
								height={height}
								width={width}
								itemCount={logs.length + (isPreloading ? 5 : 0)}
								itemSize={80}
								onScroll={handleListScroll}
								className="scrollbar-thin scrollbar-thumb-purple-600 scrollbar-track-transparent"
								overscanCount={5}
							>
								{Row}
							</List>
						)}
					</AutoSizer>
					
					{/* Infinite experience indicator */}
					<div className="absolute bottom-0 left-0 right-0 py-3 text-center bg-gradient-to-t from-[#1a1825] via-[#1a1825]/80 to-transparent">
						<div className="flex items-center justify-center gap-2 text-xs text-purple-400 animate-pulse">
							<Infinity className="w-4 h-4" />
							<span>Infinite activity stream</span>
							<ArrowDown className="w-3 h-3 animate-bounce" />
						</div>
					</div>
				</div>
			</div>

			{/* Infinite Site Experience */}
			<div className="mt-8 text-center">
				<div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600/10 to-purple-400/10 rounded-full border border-purple-500/20">
					<Infinity className="w-4 h-4 text-purple-400" />
					<span className="text-sm text-purple-300">Keep exploring - there's always more</span>
				</div>
			</div>

			{/* Footer Info - but not the end */}
			<div className="mt-6 pt-4 border-t border-purple-500/10 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500">
				<div className="flex items-center gap-2">
					<p>© 2024 DiscordSH</p>
					<div className="w-1 h-1 bg-gray-500 rounded-full" />
					<p className="flex items-center gap-1">
						<Activity className="w-3 h-3" />
						Live since launch
					</p>
				</div>
				<div className="flex gap-4 mt-2 md:mt-0">
					<a href="#" className="hover:text-purple-400 transition-colors">API Status</a>
					<a href="#" className="hover:text-purple-400 transition-colors">Docs</a>
					<a href="#" className="hover:text-purple-400 transition-colors">Community</a>
					<a href="#" className="hover:text-purple-400 transition-colors">Discord</a>
				</div>
			</div>
		</div>
	);
}