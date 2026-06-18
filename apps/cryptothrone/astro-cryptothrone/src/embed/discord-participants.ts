import { Events, type DiscordSDK } from '@discord/embedded-app-sdk';
import { laserEvents } from '@kbve/laser';

export interface DiscordParticipant {
	id: string;
	name: string;
	avatarUrl: string | null;
	bot: boolean;
}

interface RawParticipant {
	id: string;
	username: string;
	discriminator: string;
	bot: boolean;
	avatar?: string | null;
	global_name?: string | null;
	nickname?: string;
}

function displayName(p: RawParticipant): string {
	return p.nickname || p.global_name || p.username;
}

function avatarUrl(p: RawParticipant): string | null {
	if (p.avatar) {
		return `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=64`;
	}
	const idx = Number(BigInt(p.id) % 6n);
	return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function normalize(list: RawParticipant[]): DiscordParticipant[] {
	return list.map((p) => ({
		id: p.id,
		name: displayName(p),
		avatarUrl: avatarUrl(p),
		bot: p.bot,
	}));
}

export function startParticipants(sdk: DiscordSDK): () => void {
	let stopped = false;

	const emit = (raw: RawParticipant[]) => {
		if (stopped) return;
		laserEvents.emit('discord:participants', {
			participants: normalize(raw),
		});
	};

	const onUpdate = (data: { participants: RawParticipant[] }) => {
		emit(data.participants ?? []);
	};

	void sdk.commands
		.getInstanceConnectedParticipants()
		.then((res) => emit(res.participants ?? []))
		.catch((err) => {
			console.warn(
				'[Cryptothrone/Discord] getInstanceConnectedParticipants failed',
				err,
			);
		});

	void sdk.subscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, onUpdate);

	return () => {
		stopped = true;
		void sdk.unsubscribe(
			Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE,
			onUpdate,
		);
	};
}
