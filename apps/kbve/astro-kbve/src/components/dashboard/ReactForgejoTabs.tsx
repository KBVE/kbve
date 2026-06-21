import { useStore } from '@nanostores/react';
import { forgejoService, type ForgejoTab } from './forgejoService';
import {
	LayoutDashboard,
	BookMarked,
	Users,
	Building2,
	Webhook,
	CircleDot,
	Package,
	FolderTree,
	Cpu,
	ServerCog,
} from 'lucide-react';

const TABS: { id: ForgejoTab; label: string; icon: React.ReactNode }[] = [
	{ id: 'overview', label: 'Overview', icon: <LayoutDashboard size={14} /> },
	{ id: 'repos', label: 'Repositories', icon: <BookMarked size={14} /> },
	{ id: 'users', label: 'Users', icon: <Users size={14} /> },
	{ id: 'orgs', label: 'Orgs & Teams', icon: <Building2 size={14} /> },
	{
		id: 'webhooks',
		label: 'Repo Admin',
		icon: <Webhook size={14} />,
	},
	{ id: 'issues', label: 'Issues & PRs', icon: <CircleDot size={14} /> },
	{ id: 'packages', label: 'Packages', icon: <Package size={14} /> },
	{ id: 'files', label: 'Files', icon: <FolderTree size={14} /> },
	{ id: 'runners', label: 'Runners', icon: <Cpu size={14} /> },
	{ id: 'system', label: 'System', icon: <ServerCog size={14} /> },
];

export default function ReactForgejoTabs() {
	const active = useStore(forgejoService.$activeTab);
	return (
		<div
			className="not-content"
			style={{
				display: 'flex',
				gap: 4,
				flexWrap: 'wrap',
				borderBottom: '1px solid var(--sl-color-gray-5, #30363d)',
				marginBottom: '1.5rem',
				paddingBottom: 2,
			}}>
			{TABS.map((tab) => {
				const isActive = active === tab.id;
				return (
					<button
						key={tab.id}
						type="button"
						onClick={() => forgejoService.setTab(tab.id)}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 6,
							padding: '0.5rem 0.85rem',
							borderRadius: '8px 8px 0 0',
							border: 'none',
							borderBottom: isActive
								? '2px solid var(--sl-color-accent, #06b6d4)'
								: '2px solid transparent',
							background: isActive
								? 'var(--sl-color-gray-6, #161b22)'
								: 'transparent',
							color: isActive
								? 'var(--sl-color-text, #e6edf3)'
								: 'var(--sl-color-gray-3, #8b949e)',
							cursor: 'pointer',
							fontSize: '0.82rem',
							fontWeight: 600,
							marginBottom: -2,
						}}>
						{tab.icon}
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
