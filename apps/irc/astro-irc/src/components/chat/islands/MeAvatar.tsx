/** @jsxImportSource react */
import { useStore } from '@nanostores/react';
import { $authState } from '../auth';
import { $avatarUrl } from '../auth';
import { $nick } from '../service';
import { nickColor, nickInitial } from '../format';

export const MeAvatar: React.FC = () => {
	const authState = useStore($authState);
	const avatar = useStore($avatarUrl);
	const nick = useStore($nick);

	if (authState !== 'auth') return null;

	if (avatar) {
		return (
			<img
				src={avatar}
				alt={nick}
				title={nick}
				className="kbve-chat__me-avatar"
				loading="lazy"
			/>
		);
	}

	return (
		<span
			className="kbve-chat__me-avatar kbve-chat__me-avatar--initial"
			title={nick}
			style={{ background: nick ? nickColor(nick) : undefined }}>
			{nickInitial(nick || '?')}
		</span>
	);
};
