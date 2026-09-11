/** @jsxImportSource react */
import { useStore } from '@nanostores/react';
import { $activeChannel } from '../service';

export const ChannelPill: React.FC = () => {
	const channel = useStore($activeChannel);
	const name = channel.replace(/^#/, '');
	return (
		<div className="kbve-chat__channel-pill">
			<span className="kbve-chat__channel-pill-hash">#</span>
			<span>{name}</span>
		</div>
	);
};
