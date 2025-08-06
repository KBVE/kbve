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
	Infinity
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
	await new Promise(resolve => setTimeout(resolve, 200));
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
	const listRef = useRef<List>(null);
	const preloadTriggered = useRef(false);

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
	const handleScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }: { scrollOffset: number; scrollUpdateWasRequested: boolean }) => {
		if (scrollUpdateWasRequested) return;
		
		const listHeight = 320; // h-80 = 20rem = 320px
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
					style={style} 
					className="flex items-start gap-3 p-3 mx-2 my-1 rounded-lg bg-gradient-to-r from-[#2b2740]/50 to-[#312d4b]/50 border border-purple-500/5 animate-pulse"
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
				style={style}
				className={cn(
					"flex items-start gap-3 p-3 mx-2 my-1 rounded-lg",
					"bg-gradient-to-r from-[#2b2740] to-[#312d4b]",
					"border border-purple-500/10 hover:border-purple-500/30",
					"transition-all duration-300 hover:shadow-lg hover:scale-[1.02]",
					"text-sm group"
				)}
			>
				<div className="flex-shrink-0 mt-0.5 transition-transform group-hover:scale-110">
					{getLevelIcon(log.level)}
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 text-purple-300">
						<span className="font-medium truncate">{log.message}</span>
					</div>
					<div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
						<span className="flex items-center gap-1">
							<Clock className="w-3 h-3" />
							{time}
						</span>
						{log.user && (
							<span className="flex items-center gap-1">
								<Users className="w-3 h-3" />
								{log.user}
							</span>
						)}
						{log.server && (
							<span className="flex items-center gap-1">
								<Server className="w-3 h-3" />
								{log.server}
							</span>
						)}
					</div>
				</div>
			</div>
		);
	});

	Row.displayName = 'LogRow';

	return (
		<div className="w-full">
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
					{isPreloading && (
						<div className="ml-2 flex items-center gap-1 text-xs text-purple-500">
							<div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
							Preloading...
						</div>
					)}
				</h3>

				<div className="relative h-80 rounded-lg border border-purple-500/20 bg-[#1a1825] overflow-hidden">
					<AutoSizer>
						{({ height, width }) => (
							<List
								ref={listRef}
								height={height}
								width={width}
								itemCount={logs.length + (isPreloading ? 5 : 0)} // Show skeleton items during preload
								itemSize={80}
								onScroll={handleScroll}
								className="scrollbar-thin scrollbar-thumb-purple-600 scrollbar-track-transparent"
								overscanCount={5} // Render extra items for smoother scrolling
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