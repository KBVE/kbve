/** @jsxImportSource react */
import React, {
	useEffect,
	useRef,
	useState,
	useCallback,
	memo,
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
	CheckCircle
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
		'Cache cleared successfully'
	];
	
	const users = ['Alice', 'Bob', 'Charlie', 'David', 'Eve'];
	const servers = ['Gaming Hub', 'Dev Community', 'Music Lounge', 'Art Gallery'];
	
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
	// Simulate API call with mock data
	await new Promise(resolve => setTimeout(resolve, 500));
	return Array.from({ length: 10 }, (_, i) => generateMockLog(page * 10 + i));
};

const fetchStats = async (): Promise<Stats> => {
	// Simulate API call
	await new Promise(resolve => setTimeout(resolve, 300));
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
	const [isLoading, setIsLoading] = useState(false);
	const [hasMore, setHasMore] = useState(true);
	const observerRef = useRef<IntersectionObserver | null>(null);
	const loadMoreRef = useRef<HTMLDivElement | null>(null);

	// Load initial stats
	useEffect(() => {
		fetchStats().then(setStats);
		const interval = setInterval(() => {
			fetchStats().then(setStats);
		}, 30000); // Update every 30 seconds
		
		return () => clearInterval(interval);
	}, []);

	const loadMore = useCallback(async () => {
		if (isLoading || !hasMore) return;
		
		setIsLoading(true);
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
			setIsLoading(false);
		}
	}, [page, isLoading, hasMore]);

	// Initial load
	useEffect(() => {
		loadMore();
	}, []);

	// Set up intersection observer
	useEffect(() => {
		if (observerRef.current) {
			observerRef.current.disconnect();
		}

		observerRef.current = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasMore && !isLoading) {
					loadMore();
				}
			},
			{
				root: null,
				rootMargin: '100px',
				threshold: 0.1,
			}
		);

		if (loadMoreRef.current) {
			observerRef.current.observe(loadMoreRef.current);
		}

		return () => {
			if (observerRef.current) {
				observerRef.current.disconnect();
			}
		};
	}, [loadMore, hasMore, isLoading]);

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

	const Row = memo(({ index, style }: ListChildComponentProps) => {
		const log = logs[index];
		if (!log) return <div style={style} />;

		const time = new Date(log.timestamp).toLocaleTimeString();
		
		return (
			<div
				style={style}
				className={cn(
					"flex items-start gap-3 p-3 mx-2 my-1 rounded-lg",
					"bg-gradient-to-r from-[#2b2740] to-[#312d4b]",
					"border border-purple-500/10 hover:border-purple-500/30",
					"transition-all duration-200 hover:shadow-md",
					"text-sm"
				)}
			>
				<div className="flex-shrink-0 mt-0.5">
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
				<div className="text-center">
					<div className="flex items-center justify-center gap-2 text-purple-400 mb-1">
						<Users className="w-4 h-4" />
						<span className="text-xs uppercase tracking-wide">Active Users</span>
					</div>
					<p className="text-2xl font-bold text-purple-100">
						{stats?.activeUsers.toLocaleString() || '---'}
					</p>
				</div>
				<div className="text-center">
					<div className="flex items-center justify-center gap-2 text-purple-400 mb-1">
						<Server className="w-4 h-4" />
						<span className="text-xs uppercase tracking-wide">Servers</span>
					</div>
					<p className="text-2xl font-bold text-purple-100">
						{stats?.totalServers || '---'}
					</p>
				</div>
				<div className="text-center">
					<div className="flex items-center justify-center gap-2 text-purple-400 mb-1">
						<TrendingUp className="w-4 h-4" />
						<span className="text-xs uppercase tracking-wide">Uptime</span>
					</div>
					<p className="text-2xl font-bold text-purple-100">
						{stats?.uptime || '---'}
					</p>
				</div>
				<div className="text-center">
					<div className="flex items-center justify-center gap-2 text-purple-400 mb-1">
						<Zap className="w-4 h-4" />
						<span className="text-xs uppercase tracking-wide">Requests/min</span>
					</div>
					<p className="text-2xl font-bold text-purple-100">
						{stats?.requestsPerMinute || '---'}
					</p>
				</div>
			</div>

			{/* Activity Feed */}
			<div>
				<h3 className="text-sm text-purple-400 mb-3 flex items-center gap-2">
					<Activity className="w-4 h-4" /> 
					Live Activity Feed
				</h3>

				<div className="relative h-80 rounded-lg border border-purple-500/20 bg-[#1a1825] overflow-hidden">
					<AutoSizer>
						{({ height, width }) => (
							<List
								height={height}
								width={width}
								itemCount={logs.length}
								itemSize={80}
								className="scrollbar-thin scrollbar-thumb-purple-600 scrollbar-track-transparent"
							>
								{Row}
							</List>
						)}
					</AutoSizer>
				</div>

				{/* Load More Trigger */}
				<div 
					ref={loadMoreRef} 
					className="h-8 flex items-center justify-center"
				>
					{isLoading && (
						<div className="flex items-center gap-2 text-xs text-purple-400">
							<div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
							Loading more activity...
						</div>
					)}
					{!hasMore && logs.length > 0 && (
						<p className="text-xs text-gray-500">No more activity to load</p>
					)}
				</div>
			</div>

			{/* Footer Info */}
			<div className="mt-6 pt-4 border-t border-purple-500/10 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500">
				<p>© 2024 DiscordSH. All rights reserved.</p>
				<div className="flex gap-4 mt-2 md:mt-0">
					<a href="#" className="hover:text-purple-400 transition-colors">Terms</a>
					<a href="#" className="hover:text-purple-400 transition-colors">Privacy</a>
					<a href="#" className="hover:text-purple-400 transition-colors">Status</a>
					<a href="#" className="hover:text-purple-400 transition-colors">API</a>
				</div>
			</div>
		</div>
	);
}