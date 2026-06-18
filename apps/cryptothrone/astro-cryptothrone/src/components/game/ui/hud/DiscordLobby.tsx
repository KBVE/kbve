import { useEffect, useState } from 'react';
import { laserEvents } from '@kbve/laser';

interface Participant {
	id: string;
	name: string;
	avatarUrl: string | null;
	bot: boolean;
}

export function DiscordLobby() {
	const [participants, setParticipants] = useState<Participant[]>([]);

	useEffect(
		() =>
			laserEvents.on('discord:participants', (data) => {
				setParticipants(data.participants);
			}),
		[],
	);

	if (participants.length === 0) return null;

	return (
		<div>
			<h2 className="mb-2 text-lg font-semibold">
				In this Activity
				<span className="ml-2 rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-indigo-300">
					{participants.length}
				</span>
			</h2>
			<ul className="flex flex-col gap-1">
				{participants.map((p) => (
					<li key={p.id} className="flex items-center gap-2 text-sm">
						{p.avatarUrl ? (
							<img
								src={p.avatarUrl}
								alt=""
								width={20}
								height={20}
								className="h-5 w-5 rounded-full"
								onError={(e) => {
									e.currentTarget.style.display = 'none';
								}}
							/>
						) : null}
						<span className="truncate text-stone-300">
							{p.name}
						</span>
						{p.bot && (
							<span className="rounded bg-indigo-500/30 px-1 text-[0.6rem] font-semibold text-indigo-200">
								BOT
							</span>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
