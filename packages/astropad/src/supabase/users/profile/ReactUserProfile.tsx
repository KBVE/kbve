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
import { FixedSizeGrid as Grid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { User, BadgeCheck, MailCheck, Link2, ListTree, X } from 'lucide-react';

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
		icon: <User className="w-6 h-6 text-cyan-400" />,
		description: 'Manage your email, phone, and display name.',
	},
	{
		id: 'username',
		title: 'Username',
		icon: <BadgeCheck className="w-6 h-6 text-cyan-400" />,
		description: 'Claim or update your username.',
	},
	{
		id: 'email',
		title: 'Email Verification',
		icon: <MailCheck className="w-6 h-6 text-cyan-400" />,
		description: 'Resend or verify your email address.',
	},
	{
		id: 'linked',
		title: 'Linked Accounts',
		icon: <Link2 className="w-6 h-6 text-cyan-400" />,
		description: 'Connect GitHub, Discord, or Google.',
	},
	{
		id: 'logs',
		title: 'Activity Log',
		icon: <ListTree className="w-6 h-6 text-cyan-400" />,
		description: 'View recent profile activity logs.',
	},
];

const renderGridShell = (
	panels: typeof userProfilePanels,
	setSelectedPanel: (id: string) => void
) => {
	return (
		<div className="w-full max-w-6xl mx-auto min-h-[500px]">
			<AutoSizer disableHeight>
				{({ width }) => {
					const columnWidth = 300;
					const columnCount = Math.max(1, Math.floor(width / columnWidth));
					const rowCount = Math.ceil(panels.length / columnCount);
					const rowHeight = 120;

					return (
						<Grid
							columnCount={columnCount}
							columnWidth={columnWidth}
							height={rowCount * rowHeight}
							rowCount={rowCount}
							rowHeight={rowHeight}
							width={width}
							itemData={panels}
						>
							{({ columnIndex, rowIndex, style, data }) => {
								const index = rowIndex * columnCount + columnIndex;
								if (index >= data.length) return null;

								const panel = data[index];

								return (
									<div style={style} className="p-2">
										<button
											onClick={() => setSelectedPanel(panel.id)}
											className="group w-full h-full rounded-xl p-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition text-left flex flex-col justify-between"
										>
											<div>{panel.icon}</div>
											<div className="mt-2 text-white font-semibold">{panel.title}</div>
											<div className="text-sm text-zinc-400">{panel.description}</div>
										</button>
									</div>
								);
							}}
						</Grid>
					);
				}}
			</AutoSizer>
		</div>
	);
};


export const ReactUserProfile = () => {
	const [selectedPanel, setSelectedPanel] = useState<null | string>(null);
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

	useEffect(() => {
		hideSkeleton();
	}, []);

    return (
		<div className="p-6 space-y-6 min-h-[600px]">
			<div className="flex items-center justify-between">
				<div className="text-xl font-bold text-white">Welcome, {displayName}</div>
			</div>

			{renderGridShell(userProfilePanels, setSelectedPanel)}

		</div>
	);
};
