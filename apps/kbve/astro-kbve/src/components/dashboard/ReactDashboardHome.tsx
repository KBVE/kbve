import React, {
	useEffect,
	useState,
	useCallback,
	useRef,
	useMemo,
	Suspense,
} from 'react';
import { useAuthBridge } from '@/components/auth';
import {
	BarChart3,
	GitBranch,
	Zap,
	Loader2,
	LogIn,
	ShieldOff,
	ArrowRight,
	Activity,
} from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useSpring, animated } from '@react-spring/web';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://supabase.kbve.com';
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

interface CachedData<T> {
	data: T;
	cached_at: number;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function getCache<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const cached: CachedData<T> = JSON.parse(raw);
		if (Date.now() - cached.cached_at > CACHE_TTL_MS) return null;
		return cached.data;
	} catch {
		return null;
	}
}

function setCache<T>(key: string, data: T): void {
	try {
		localStorage.setItem(
			key,
			JSON.stringify({ data, cached_at: Date.now() }),
		);
	} catch {
		/* quota exceeded */
	}
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface GrafanaSummary {
	nodeCount: number;
}

interface ArgoSummary {
	totalApps: number;
	healthyCount: number;
	syncedCount: number;
}

interface EdgeSummary {
	operational: number;
	total: number;
	latencyMs: number;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchGrafanaSummary(
	token: string,
): Promise<GrafanaSummary | null> {
	const cached = getCache<GrafanaSummary>('cache:dashboard:grafana-summary');
	if (cached) return cached;

	try {
		const resp = await fetch(
			`/dashboard/grafana/proxy/api/v1/query?query=${encodeURIComponent('count(up{job="node-exporter"})')}`,
			{
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(8000),
			},
		);
		if (!resp.ok) return null;
		const json = await resp.json();
		const result = json?.data?.result?.[0];
		const nodeCount = result ? parseInt(result.value?.[1] ?? '0', 10) : 0;
		const summary = { nodeCount };
		setCache('cache:dashboard:grafana-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

async function fetchArgoSummary(token: string): Promise<ArgoSummary | null> {
	const cached = getCache<ArgoSummary>('cache:dashboard:argo-summary');
	if (cached) return cached;

	try {
		const resp = await fetch('/dashboard/argo/proxy/api/v1/applications', {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(8000),
		});
		if (!resp.ok) return null;
		const json = await resp.json();
		const items = json?.items ?? [];
		const totalApps = items.length;
		const healthyCount = items.filter(
			(a: any) => a.status?.health?.status === 'Healthy',
		).length;
		const syncedCount = items.filter(
			(a: any) => a.status?.sync?.status === 'Synced',
		).length;
		const summary = { totalApps, healthyCount, syncedCount };
		setCache('cache:dashboard:argo-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

async function fetchEdgeSummary(): Promise<EdgeSummary | null> {
	const cached = getCache<EdgeSummary>('cache:dashboard:edge-summary');
	if (cached) return cached;

	const functions = [
		'health',
		'meme',
		'mc',
		'discordsh',
		'user-vault',
		'guild-vault',
		'vault-reader',
	];
	const total = functions.length;
	let operational = 0;
	const start = performance.now();

	try {
		const results = await Promise.allSettled(
			functions.map(async (fn) => {
				const method = fn === 'health' ? 'GET' : 'OPTIONS';
				const resp = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
					method,
					signal: AbortSignal.timeout(8000),
				});
				return resp.ok;
			}),
		);
		operational = results.filter(
			(r) => r.status === 'fulfilled' && r.value,
		).length;
		const latencyMs = Math.round(performance.now() - start);
		const summary = { operational, total, latencyMs };
		setCache('cache:dashboard:edge-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// 3D Particle Background
// ---------------------------------------------------------------------------

function ParticleField() {
	const meshRef = useRef<THREE.InstancedMesh>(null!);
	const count = 80;

	const particles = useMemo(() => {
		const temp = [];
		for (let i = 0; i < count; i++) {
			temp.push({
				position: [
					(Math.random() - 0.5) * 12,
					(Math.random() - 0.5) * 8,
					(Math.random() - 0.5) * 6,
				] as [number, number, number],
				speed: 0.002 + Math.random() * 0.004,
				offset: Math.random() * Math.PI * 2,
				scale: 0.02 + Math.random() * 0.04,
			});
		}
		return temp;
	}, []);

	const dummy = useMemo(() => new THREE.Object3D(), []);

	useFrame(({ clock }) => {
		const t = clock.getElapsedTime();
		particles.forEach((p, i) => {
			dummy.position.set(
				p.position[0] + Math.sin(t * p.speed * 50 + p.offset) * 0.3,
				p.position[1] + Math.cos(t * p.speed * 30 + p.offset) * 0.2,
				p.position[2] +
					Math.sin(t * p.speed * 40 + p.offset + 1) * 0.15,
			);
			dummy.scale.setScalar(p.scale);
			dummy.updateMatrix();
			meshRef.current.setMatrixAt(i, dummy.matrix);
		});
		meshRef.current.instanceMatrix.needsUpdate = true;
	});

	return (
		<instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
			<sphereGeometry args={[1, 8, 8]} />
			<meshBasicMaterial color="#06b6d4" transparent opacity={0.25} />
		</instancedMesh>
	);
}

function Background3D() {
	return (
		<div style={styles.canvasContainer}>
			<Canvas
				camera={{ position: [0, 0, 6], fov: 60 }}
				style={{ background: 'transparent' }}
				gl={{ alpha: true, antialias: false }}
				dpr={[1, 1.5]}>
				<Suspense fallback={null}>
					<ParticleField />
				</Suspense>
			</Canvas>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Service Card with react-spring hover
// ---------------------------------------------------------------------------

interface ServiceCardProps {
	title: string;
	description: string;
	href: string;
	icon: React.ReactNode;
	gradient: string;
	children: React.ReactNode;
	index: number;
}

function ServiceCard({
	title,
	description,
	href,
	icon,
	gradient,
	children,
	index,
}: ServiceCardProps) {
	const [hovered, setHovered] = useState(false);

	const spring = useSpring({
		transform: hovered
			? 'scale(1.03) translateY(-4px)'
			: 'scale(1) translateY(0px)',
		boxShadow: hovered
			? '0 20px 40px rgba(6, 182, 212, 0.15)'
			: '0 4px 12px rgba(0, 0, 0, 0.2)',
		borderColor: hovered
			? 'var(--sl-color-accent, #06b6d4)'
			: 'var(--sl-color-gray-5, #262626)',
		config: { tension: 300, friction: 20 },
	});

	return (
		<animated.div
			className="dashboard-card"
			style={{
				...styles.card,
				...spring,
			}}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}>
			{/* Gradient accent strip */}
			<div
				style={{
					...styles.cardAccent,
					background: gradient,
				}}
			/>

			<div style={styles.cardIconRow}>
				<div style={{ ...styles.cardIcon, background: gradient }}>
					{icon}
				</div>
				<div style={{ flex: 1 }}>
					<div style={styles.cardTitle}>{title}</div>
					<div style={styles.cardDescription}>{description}</div>
				</div>
			</div>

			{/* Live stats */}
			<div style={styles.cardStats}>{children}</div>

			{/* Link */}
			<a href={href} style={styles.cardLink}>
				View Dashboard
				<ArrowRight size={14} />
			</a>
		</animated.div>
	);
}

function StatItem({
	label,
	value,
	color,
}: {
	label: string;
	value: string | number;
	color?: string;
}) {
	return (
		<div style={styles.statItem}>
			<div
				style={{
					...styles.statValue,
					color: color ?? 'var(--sl-color-text, #e6edf3)',
				}}>
				{value}
			</div>
			<div style={styles.statLabel}>{label}</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ReactDashboardHome() {
	const { session, isLoading: authLoading } = useAuthBridge();
	const [grafana, setGrafana] = useState<GrafanaSummary | null>(null);
	const [argo, setArgo] = useState<ArgoSummary | null>(null);
	const [edge, setEdge] = useState<EdgeSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const containerRef = useRef<HTMLDivElement>(null);

	const token = session?.access_token;

	const fetchAll = useCallback(async () => {
		setLoading(true);
		const edgePromise = fetchEdgeSummary();

		if (token) {
			const [g, a, e] = await Promise.all([
				fetchGrafanaSummary(token),
				fetchArgoSummary(token),
				edgePromise,
			]);
			setGrafana(g);
			setArgo(a);
			setEdge(e);
		} else {
			const e = await edgePromise;
			setEdge(e);
		}
		setLoading(false);
	}, [token]);

	useEffect(() => {
		if (!authLoading) fetchAll();
	}, [authLoading, fetchAll]);

	// GSAP entrance animation
	useGSAP(
		() => {
			if (authLoading || !containerRef.current) return;

			const header =
				containerRef.current.querySelector('.dashboard-header');
			const cards =
				containerRef.current.querySelectorAll('.dashboard-card');

			if (header) {
				gsap.from(header, {
					y: -20,
					opacity: 0,
					duration: 0.6,
					ease: 'power2.out',
				});
			}

			if (cards.length > 0) {
				gsap.from(cards, {
					y: 30,
					opacity: 0,
					duration: 0.5,
					stagger: 0.15,
					ease: 'power2.out',
					delay: 0.2,
				});
			}
		},
		{ scope: containerRef, dependencies: [authLoading, loading] },
	);

	// -----------------------------------------------------------------------
	// Auth states
	// -----------------------------------------------------------------------

	if (authLoading) {
		return (
			<div className="not-content" style={styles.centeredMessage}>
				<Loader2
					size={32}
					style={{ animation: 'spin 1s linear infinite' }}
				/>
				<p>Loading authentication...</p>
				<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
			</div>
		);
	}

	if (!session) {
		return (
			<div className="not-content" style={styles.centeredMessage}>
				<LogIn
					size={48}
					style={{ color: 'var(--sl-color-accent, #06b6d4)' }}
				/>
				<h2
					style={{
						color: 'var(--sl-color-text, #e6edf3)',
						margin: '1rem 0 0.5rem',
					}}>
					Authentication Required
				</h2>
				<p style={{ color: 'var(--sl-color-gray-3, #8b949e)' }}>
					Sign in to access the dashboard.
				</p>
			</div>
		);
	}

	// -----------------------------------------------------------------------
	// Dashboard
	// -----------------------------------------------------------------------

	return (
		<div
			className="not-content"
			ref={containerRef}
			style={styles.dashboard}>
			<Background3D />

			{/* Header */}
			<header className="dashboard-header" style={styles.header}>
				<div style={styles.headerContent}>
					<Activity
						size={28}
						style={{ color: 'var(--sl-color-accent, #06b6d4)' }}
					/>
					<div>
						<h1 style={styles.title}>KBVE Dashboard</h1>
						<p style={styles.subtitle}>Infrastructure Overview</p>
					</div>
				</div>
			</header>

			{/* Service Cards */}
			<div style={styles.cardGrid}>
				{/* Grafana - Cluster Monitoring */}
				<ServiceCard
					title="Cluster Monitoring"
					description="Prometheus metrics & node health"
					href="/dashboard/grafana/"
					icon={<BarChart3 size={20} color="#fff" />}
					gradient="linear-gradient(135deg, #06b6d4, #0d9488)"
					index={0}>
					{loading ? (
						<div style={styles.loadingStats}>
							<Loader2
								size={16}
								style={{ animation: 'spin 1s linear infinite' }}
							/>
						</div>
					) : grafana ? (
						<>
							<StatItem
								label="Nodes"
								value={grafana.nodeCount}
								color="#06b6d4"
							/>
						</>
					) : (
						<div style={styles.unavailable}>Data unavailable</div>
					)}
				</ServiceCard>

				{/* ArgoCD - Deployments */}
				<ServiceCard
					title="Deployments"
					description="ArgoCD application sync & health"
					href="/dashboard/argo/"
					icon={<GitBranch size={20} color="#fff" />}
					gradient="linear-gradient(135deg, #8b5cf6, #6366f1)"
					index={1}>
					{loading ? (
						<div style={styles.loadingStats}>
							<Loader2
								size={16}
								style={{ animation: 'spin 1s linear infinite' }}
							/>
						</div>
					) : argo ? (
						<>
							<StatItem
								label="Apps"
								value={argo.totalApps}
								color="#8b5cf6"
							/>
							<StatItem
								label="Healthy"
								value={argo.healthyCount}
								color="#22c55e"
							/>
							<StatItem
								label="Synced"
								value={argo.syncedCount}
								color="#06b6d4"
							/>
						</>
					) : (
						<div style={styles.unavailable}>Data unavailable</div>
					)}
				</ServiceCard>

				{/* Edge Functions */}
				<ServiceCard
					title="Edge Functions"
					description="Supabase serverless health"
					href="/dashboard/edge/"
					icon={<Zap size={20} color="#fff" />}
					gradient="linear-gradient(135deg, #22c55e, #10b981)"
					index={2}>
					{loading ? (
						<div style={styles.loadingStats}>
							<Loader2
								size={16}
								style={{ animation: 'spin 1s linear infinite' }}
							/>
						</div>
					) : edge ? (
						<>
							<StatItem
								label="Operational"
								value={`${edge.operational}/${edge.total}`}
								color={
									edge.operational === edge.total
										? '#22c55e'
										: '#f59e0b'
								}
							/>
							<StatItem
								label="Latency"
								value={`${edge.latencyMs}ms`}
							/>
						</>
					) : (
						<div style={styles.unavailable}>Data unavailable</div>
					)}
				</ServiceCard>
			</div>

			<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
	dashboard: {
		position: 'relative',
		display: 'flex',
		flexDirection: 'column',
		gap: '2rem',
		minHeight: '60vh',
	},
	canvasContainer: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 0,
		pointerEvents: 'none',
	},
	header: {
		position: 'relative',
		zIndex: 1,
	},
	headerContent: {
		display: 'flex',
		alignItems: 'center',
		gap: '1rem',
	},
	title: {
		color: 'var(--sl-color-text, #e6edf3)',
		margin: 0,
		fontSize: '2rem',
		fontWeight: 700,
		letterSpacing: '-0.02em',
	},
	subtitle: {
		color: 'var(--sl-color-gray-3, #8b949e)',
		margin: 0,
		fontSize: '0.9rem',
	},
	cardGrid: {
		position: 'relative',
		zIndex: 1,
		display: 'grid',
		gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
		gap: '1.5rem',
	},
	card: {
		display: 'flex',
		flexDirection: 'column',
		gap: '1rem',
		padding: '1.5rem',
		borderRadius: '16px',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		background: 'rgba(17, 17, 17, 0.7)',
		backdropFilter: 'blur(12px)',
		WebkitBackdropFilter: 'blur(12px)',
		overflow: 'hidden',
		position: 'relative',
		cursor: 'default',
	},
	cardAccent: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		height: '3px',
	},
	cardIconRow: {
		display: 'flex',
		alignItems: 'flex-start',
		gap: '0.75rem',
	},
	cardIcon: {
		width: '40px',
		height: '40px',
		borderRadius: '10px',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		flexShrink: 0,
	},
	cardTitle: {
		color: 'var(--sl-color-text, #e6edf3)',
		fontWeight: 600,
		fontSize: '1.1rem',
	},
	cardDescription: {
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontSize: '0.8rem',
		marginTop: '2px',
	},
	cardStats: {
		display: 'flex',
		gap: '1.5rem',
		padding: '0.75rem 0',
		borderTop: '1px solid var(--sl-color-gray-5, #262626)',
		borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
		flexWrap: 'wrap',
	},
	statItem: {
		display: 'flex',
		flexDirection: 'column',
		gap: '2px',
	},
	statValue: {
		fontSize: '1.5rem',
		fontWeight: 700,
		fontVariantNumeric: 'tabular-nums',
	},
	statLabel: {
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontSize: '0.7rem',
		textTransform: 'uppercase' as const,
		letterSpacing: '0.05em',
		fontWeight: 500,
	},
	cardLink: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		color: 'var(--sl-color-accent, #06b6d4)',
		fontSize: '0.85rem',
		fontWeight: 600,
		textDecoration: 'none',
		transition: 'gap 0.2s',
	},
	loadingStats: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		padding: '0.5rem 0',
		color: 'var(--sl-color-gray-3, #8b949e)',
	},
	unavailable: {
		color: 'var(--sl-color-gray-4, #6b7280)',
		fontSize: '0.8rem',
		fontStyle: 'italic',
		padding: '0.25rem 0',
	},
	centeredMessage: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		gap: '0.5rem',
		minHeight: '40vh',
		color: 'var(--sl-color-gray-3, #8b949e)',
	},
};
