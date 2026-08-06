import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal, LayoutGrid, Settings } from 'lucide-react';
import { DevOpsSettings } from './DevOpsSettings';
import { TmuxSessionsGrid } from './TmuxSessionsGrid';

type TabId = 'settings' | 'sessions';

interface Tab {
	id: TabId;
	labelKey: string;
	icon: React.ReactNode;
}

const tabs: Tab[] = [
	{
		id: 'settings',
		labelKey: 'devops.tabs.settings',
		icon: <Settings className="w-4 h-4" />,
	},
	{
		id: 'sessions',
		labelKey: 'devops.tabs.sessions',
		icon: <LayoutGrid className="w-4 h-4" />,
	},
];

export const DevOpsLayout: React.FC = () => {
	const { t } = useTranslation();
	const [activeTab, setActiveTab] = useState<TabId>('settings');

	const handleTabClick = (tabId: TabId) => (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setActiveTab(tabId);
	};

	return (
		<div className="w-full max-w-4xl mx-auto">
			{/* Header with tabs */}
			<div className="flex items-center gap-4 pb-4 mb-4 border-b border-mid-gray/20">
				<div className="flex items-center gap-2">
					<Terminal className="w-5 h-5 text-logo-primary" />
					<h1 className="text-lg font-semibold">
						{t('devops.title')}
					</h1>
				</div>

				{/* Tab buttons */}
				<div className="flex items-center gap-1 ml-auto bg-mid-gray/10 rounded-lg p-1">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={handleTabClick(tab.id)}
							className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
								activeTab === tab.id
									? 'bg-logo-primary text-white'
									: 'text-mid-gray hover:text-white hover:bg-mid-gray/20'
							}`}>
							{tab.icon}
							{t(tab.labelKey)}
						</button>
					))}
				</div>
			</div>

			{/* Tab content */}
			<div className="w-full">
				{activeTab === 'settings' && <DevOpsSettings />}
				{activeTab === 'sessions' && <TmuxSessionsGrid />}
			</div>
		</div>
	);
};
