import { DiscordSettings } from '../components/settings/discord/DiscordSettings';
import { OnichanSettings } from './onichan';

export function DiscordView() {
	return (
		<div className="flex flex-col gap-6 max-w-3xl w-full mx-auto">
			<DiscordSettings />
			<OnichanSettings />
		</div>
	);
}
