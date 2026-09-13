import { useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import {
	DiscordIcon,
	GitHubIcon,
	TwitchIcon,
	type OAuthProvider,
} from '@kbve/astro';
import { authBridge } from '@/lib/supa';

type ProviderButton = {
	id: OAuthProvider;
	label: string;
	Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const PROVIDERS: ProviderButton[] = [
	{ id: 'github', label: 'GitHub', Icon: GitHubIcon },
	{ id: 'discord', label: 'Discord', Icon: DiscordIcon },
	{ id: 'twitch', label: 'Twitch', Icon: TwitchIcon },
];

export default function ReactLoginButtons() {
	const [isLoading, setIsLoading] = useState<OAuthProvider | null>(null);

	const handleLogin = async (provider: OAuthProvider) => {
		try {
			setIsLoading(provider);
			await authBridge.signInWithOAuth(provider);
		} catch (error) {
			console.error(`${provider} sign-in error:`, error);
			setIsLoading(null);
		}
	};

	return (
		<div className="ck-auth-buttons">
			{PROVIDERS.map(({ id, label, Icon }) => (
				<button
					key={id}
					onClick={() => handleLogin(id)}
					disabled={isLoading !== null}
					className={`ck-auth-btn ck-auth-btn--${id}`}>
					<Icon className="ck-auth-icon" aria-hidden="true" />
					{isLoading === id
						? 'Opening portal...'
						: `Sign in with ${label}`}
				</button>
			))}
		</div>
	);
}
