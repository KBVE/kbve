import {
	useState,
	type ComponentType,
	type ReactNode,
	type SVGProps,
} from 'react';
import type { RealmChatState } from '@kbve/laser';
import { PixelPanel } from '../PixelPanel';
import { useIsMobile } from '../useBreakpoint';
import { CharacterPanel } from './CharacterPanel';
import { BagPanel } from './BagPanel';
import { ChatPanel } from './ChatPanel';
import { MapPanel } from './MapPanel';
import { SocialPanel } from './SocialPanel';
import { CharacterIcon, BagIcon, ChatIcon, MapIcon, SocialIcon } from './icons';

type TabId = 'character' | 'bag' | 'chat' | 'map' | 'social';

interface TabDef {
	id: TabId;
	label: string;
	Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TABS: TabDef[] = [
	{ id: 'character', label: 'Character', Icon: CharacterIcon },
	{ id: 'bag', label: 'Bag', Icon: BagIcon },
	{ id: 'chat', label: 'Chat', Icon: ChatIcon },
	{ id: 'map', label: 'Map', Icon: MapIcon },
	{ id: 'social', label: 'Social', Icon: SocialIcon },
];

function panelFor(id: TabId): ReactNode {
	switch (id) {
		case 'character':
			return <CharacterPanel />;
		case 'bag':
			return <BagPanel />;
		case 'map':
			return <MapPanel />;
		case 'social':
			return <SocialPanel />;
		default:
			return null;
	}
}

export function HudDock() {
	const isMobile = useIsMobile();
	const [active, setActive] = useState<TabId | null>(null);
	const [unread, setUnread] = useState(0);
	const [chatStatus, setChatStatus] =
		useState<RealmChatState['status']>('connecting');

	const toggle = (id: TabId) => {
		setActive((prev) => {
			const next = prev === id ? null : id;
			if (next === 'chat') setUnread(0);
			return next;
		});
	};

	const statusDot =
		chatStatus === 'connected'
			? 'bg-emerald-400'
			: chatStatus === 'connecting' || chatStatus === 'reconnecting'
				? 'bg-amber-400 animate-pulse'
				: 'bg-red-500';

	const activeLabel = TABS.find((t) => t.id === active)?.label ?? '';

	const tabButton = (t: TabDef, layout: 'row' | 'col') => {
		const isActive = active === t.id;
		const isChat = t.id === 'chat';
		return (
			<button
				key={t.id}
				type="button"
				onClick={() => toggle(t.id)}
				aria-label={t.label}
				aria-pressed={isActive}
				className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[0.6rem] transition ${
					isActive
						? 'bg-amber-400/20 text-amber-200'
						: 'text-stone-300 hover:bg-white/10'
				} ${layout === 'col' ? 'w-12' : ''}`}>
				<span className="relative inline-flex h-5 w-5 items-center justify-center leading-none">
					<t.Icon className="h-5 w-5" />
					{isChat && unread > 0 && !isActive && (
						<span className="absolute -right-2 -top-1 min-w-[1rem] rounded-full bg-amber-500 px-1 text-[0.55rem] font-bold leading-tight text-black">
							{unread > 9 ? '9+' : unread}
						</span>
					)}
					{isChat && (
						<span
							className={`absolute -bottom-0.5 -right-1 h-1.5 w-1.5 rounded-full ${statusDot}`}
							aria-hidden="true"
						/>
					)}
				</span>
				<span>{t.label}</span>
			</button>
		);
	};

	// Chat is kept mounted at all times so its socket stays connected even when
	// the tab is closed; other panels mount on demand.
	const sheetBody = (
		<>
			<div
				className={
					active === 'chat' ? 'flex h-full flex-col' : 'hidden'
				}>
				<ChatPanel
					active={active === 'chat'}
					onUnread={() => setUnread((n) => n + 1)}
					onStatusChange={(s) => setChatStatus(s.status)}
				/>
			</div>
			{active && active !== 'chat' && panelFor(active)}
		</>
	);

	// The sheet stays in the DOM whether or not a tab is open (only hidden via
	// CSS) so the always-mounted ChatPanel keeps its socket alive while closed.
	const sheet = (positionClass: string) => (
		<div
			className={`pointer-events-auto fixed z-40 flex flex-col ${positionClass} ${
				active ? '' : 'hidden'
			}`}>
			<PixelPanel
				variant="stone"
				slice={8}
				scale={2}
				className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div className="flex items-center justify-between pb-2">
					<h2 className="text-sm font-bold text-amber-200">
						{activeLabel}
					</h2>
					<button
						type="button"
						onClick={() => setActive(null)}
						aria-label="Close"
						className="rounded px-2 text-lg leading-none text-stone-400 hover:text-white">
						×
					</button>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto pr-1">
					{sheetBody}
				</div>
			</PixelPanel>
		</div>
	);

	if (isMobile) {
		return (
			<>
				{sheet('inset-x-2 bottom-[4.5rem] max-h-[68vh]')}
				<nav
					className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex gap-1 border-t border-white/10 bg-black/70 pl-[max(0.5rem,var(--discord-safe-area-inset-left,0px))] pr-[max(0.5rem,var(--discord-safe-area-inset-right,0px))] pb-[max(env(safe-area-inset-bottom),var(--discord-safe-area-inset-bottom,0px))] pt-1 backdrop-blur-md"
					aria-label="HUD">
					{TABS.map((t) => tabButton(t, 'row'))}
				</nav>
			</>
		);
	}

	return (
		<>
			<nav
				className="pointer-events-auto fixed left-2 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-white/10 bg-black/60 p-1 backdrop-blur-md"
				aria-label="HUD">
				{TABS.map((t) => tabButton(t, 'col'))}
			</nav>
			{sheet('bottom-4 left-20 top-4 w-[340px]')}
		</>
	);
}
