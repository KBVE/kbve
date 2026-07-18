import type {
	BreadcrumbCrumb,
	DashboardNavGroup,
	DashboardNavItem,
} from './dashboardNav';
import { buildBreadcrumbIn, isActiveIn } from './dashboardNav';

export const APPLICATION_ROOT: DashboardNavItem = {
	label: 'Applications',
	href: '/application/',
};

export const APPLICATION_NAV: DashboardNavGroup[] = [
	{
		label: 'Infrastructure & DevOps',
		eyebrow: 'Run the platform',
		href: '/application/#infrastructure',
		icon: 'M2 20h20M5 20V8.5L12 4l7 4.5V20M9 20v-6h6v6',
		items: [
			{
				label: 'Linux',
				href: '/application/linux/',
				copy: 'The bedrock OS — shell, systemd, permissions, and server hardening.',
			},
			{
				label: 'Docker',
				href: '/application/docker/',
				copy: 'Containers, images, Compose, and multi-stage builds for every KBVE service.',
			},
			{
				label: 'Kubernetes',
				href: '/application/kubernetes/',
				copy: 'Cluster orchestration — workloads, networking, and operators in production.',
			},
			{
				label: 'ArgoCD',
				href: '/application/argocd/',
				copy: 'GitOps continuous delivery — app-of-apps, sync waves, and drift control.',
			},
			{
				label: 'Ansible',
				href: '/application/ansible/',
				copy: 'Agentless configuration management with playbooks and inventories.',
			},
			{
				label: 'Terraform',
				href: '/application/terraform/',
				copy: 'Infrastructure as code — providers, state, and reproducible environments.',
			},
			{
				label: 'NGINX',
				href: '/application/nginx/',
				copy: 'Web serving, reverse proxying, and load balancing configuration.',
			},
			{
				label: 'Traefik',
				href: '/application/traefik/',
				copy: 'Cloud-native edge router with automatic service discovery and TLS.',
			},
			{
				label: 'Portainer',
				href: '/application/portainer/',
				copy: 'Container management UI for Docker and Kubernetes environments.',
			},
			{
				label: 'Nomad',
				href: '/application/nomad/',
				copy: 'HashiCorp workload orchestrator for containers, VMs, and binaries.',
			},
			{
				label: 'Longhorn',
				href: '/application/longhorn/',
				copy: 'Distributed block storage for Kubernetes — volumes, backups, replicas.',
			},
			{
				label: 'Proxmox',
				href: '/application/proxmox/',
				copy: 'Open-source virtualization platform for VMs and LXC containers.',
			},
			{
				label: 'Talos on Intel NUC',
				href: '/application/intel-nuc-talos/',
				copy: 'Immutable Talos Linux Kubernetes nodes on small-form-factor hardware.',
			},
			{
				label: 'Google Cloud',
				href: '/application/gcloud/',
				copy: 'GCP services, gcloud CLI, and cloud infrastructure recipes.',
			},
			{
				label: 'WireGuard',
				href: '/application/wireguard/',
				copy: 'Fast modern VPN tunnels — the mesh that links the KBVE fleet.',
			},
			{
				label: 'v01d',
				href: '/application/v01d/',
				copy: 'VOID operator daemon — virtualization, nested machines, and automation.',
			},
		],
	},
	{
		label: 'Languages & Frameworks',
		eyebrow: 'Write the code',
		href: '/application/#languages',
		icon: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
		items: [
			{
				label: 'JavaScript',
				href: '/application/javascript/',
				copy: 'The web platform language — from DOM fundamentals to modern tooling.',
			},
			{
				label: 'Python',
				href: '/application/python/',
				copy: 'Scripting, automation, data work, and backend services.',
			},
			{
				label: 'Rust',
				href: '/application/rust/',
				copy: 'Memory-safe systems programming — the language behind KBVE backends.',
			},
			{
				label: 'PHP',
				href: '/application/php/',
				copy: 'Server-side scripting for the classic web stack.',
			},
			{
				label: 'CSS',
				href: '/application/css/',
				copy: 'Layout, styling, and design systems — grid, flexbox, and beyond.',
			},
			{
				label: 'Flutter',
				href: '/application/flutter/',
				copy: 'Dart-powered cross-platform UI for mobile and desktop.',
			},
			{
				label: 'React Native',
				href: '/application/rn/',
				copy: 'Native mobile apps with React — the stack behind KBVE mobile.',
			},
		],
	},
	{
		label: 'Data & Backends',
		eyebrow: 'Store the state',
		href: '/application/#data',
		icon: 'M12 2C6.48 2 2 3.79 2 6s4.48 4 10 4 10-1.79 10-4-4.48-4-10-4zM2 6v6c0 2.21 4.48 4 10 4s10-1.79 10-4V6M2 12v6c0 2.21 4.48 4 10 4s10-1.79 10-4v-6',
		items: [
			{
				label: 'SQL',
				href: '/application/sql/',
				copy: 'Relational fundamentals — queries, joins, indexes, and schema design.',
			},
			{
				label: 'Redis',
				href: '/application/redis/',
				copy: 'In-memory data structures for caching, queues, and pub/sub.',
			},
			{
				label: 'Supabase',
				href: '/application/supabase/',
				copy: 'Postgres platform — auth, storage, realtime, and edge functions.',
			},
			{
				label: 'PocketBase',
				href: '/application/pocketbase/',
				copy: 'Single-binary backend with embedded database and auth.',
			},
			{
				label: 'Appwrite',
				href: '/application/appwrite/',
				copy: 'Self-hosted backend-as-a-service for web and mobile apps.',
			},
			{
				label: 'Cube.js',
				href: '/application/cubejs/',
				copy: 'Semantic layer for analytics — metrics APIs over your data.',
			},
		],
	},
	{
		label: 'Game Dev & Creative',
		eyebrow: 'Ship the fun',
		href: '/application/#gamedev',
		icon: 'M6 12h4m-2-2v4m7-1h.01M18 11h.01M17.32 5H6.68a4 4 0 0 0-3.98 3.59C2.6 9.42 2 14.46 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.41-1.41A2 2 0 0 1 9.83 16h4.34a2 2 0 0 1 1.41.59L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.54-.6-6.58-.68-7.26A4 4 0 0 0 17.32 5z',
		items: [
			{
				label: 'Unity',
				href: '/application/unity/',
				copy: 'C# game engine — DOTS, Burst, and the stack behind Rareicon.',
			},
			{
				label: 'Unreal Engine',
				href: '/application/unreal/',
				copy: 'UE5 development — C++, plugins, and the KBVE Unreal toolchain.',
			},
			{
				label: 'Godot',
				href: '/application/godot/',
				copy: 'Open-source game engine with GDScript and C# workflows.',
			},
			{
				label: 'Blender',
				href: '/application/blender/',
				copy: '3D modeling, sprite baking, and asset pipelines.',
			},
			{
				label: 'OBS',
				href: '/application/obs/',
				copy: 'Open Broadcaster Software for streaming and recording.',
			},
		],
	},
	{
		label: 'Tooling & Security',
		eyebrow: 'Sharpen the workflow',
		href: '/application/#tooling',
		icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
		items: [
			{
				label: 'Git',
				href: '/application/git/',
				copy: 'Version control mastery — branching, LFS, worktrees, and recovery.',
			},
			{
				label: 'n8n',
				href: '/application/n8n/',
				copy: 'Workflow automation — nodes, triggers, and self-hosted pipelines.',
			},
			{
				label: 'Windmill',
				href: '/application/windmill/',
				copy: 'Code-first workflow automation — scripts as APIs, crons, and our /wm Discord jobs.',
			},
			{
				label: 'Machine Learning',
				href: '/application/ml/',
				copy: 'Models, training pipelines, and applied AI notes.',
			},
			{
				label: 'Nmap',
				href: '/application/nmap/',
				copy: 'Network discovery and security auditing from the terminal.',
			},
			{
				label: 'Authelia',
				href: '/application/authelia/',
				copy: 'Self-hosted SSO and two-factor portal for reverse proxies.',
			},
			{
				label: 'Android',
				href: '/application/android/',
				copy: 'Platform notes, ADB workflows, and device tooling.',
			},
			{
				label: 'iOS',
				href: '/application/ios/',
				copy: 'Apple platform development, signing, and deployment.',
			},
			{
				label: 'Flipper Zero',
				href: '/application/flipperzero/',
				copy: 'Portable multi-tool for pentesting and hardware exploration.',
			},
		],
	},
];

export const isApplicationActive = (pathname: string, href: string): boolean =>
	isActiveIn(APPLICATION_ROOT.href, pathname, href);

export const buildApplicationBreadcrumb = (
	pathname: string,
): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(APPLICATION_NAV, APPLICATION_ROOT, pathname);
