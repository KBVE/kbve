import { useAuthStore } from '../stores/auth';
import { IconDiscord, IconGitHub } from './Icons';
import type { Provider } from '@kbve/tauri';

export function SignIn() {
	const phase = useAuthStore((s) => s.phase);
	const error = useAuthStore((s) => s.error);
	const signInWith = useAuthStore((s) => s.signInWith);
	const authing = phase === 'authing';

	return (
		<div
			className="flex h-screen w-screen flex-col items-center justify-center gap-8 px-10"
			style={{ backgroundColor: 'var(--color-bg)' }}>
			<div className="flex flex-col items-center gap-2 text-center">
				<h1 className="font-display text-title font-semibold">
					KBVE Desktop
				</h1>
				<p
					className="text-body"
					style={{ color: 'var(--color-text-muted)' }}>
					Sign in to continue
				</p>
			</div>

			<div className="flex w-full max-w-xs flex-col gap-3">
				<ProviderButton
					provider="github"
					label="Continue with GitHub"
					icon={<IconGitHub />}
					disabled={authing}
					onClick={signInWith}
				/>
				<ProviderButton
					provider="discord"
					label="Continue with Discord"
					icon={<IconDiscord />}
					disabled={authing}
					onClick={signInWith}
				/>
			</div>

			<div className="flex min-h-8 max-w-xs flex-col items-center gap-2">
				{authing && (
					<p
						className="text-caption"
						style={{ color: 'var(--color-text-muted)' }}>
						Waiting for your browser…
					</p>
				)}
				{error && <p className="alert-danger text-caption">{error}</p>}
			</div>
		</div>
	);
}

function ProviderButton({
	provider,
	label,
	icon,
	disabled,
	onClick,
}: {
	provider: Provider;
	label: string;
	icon: React.ReactNode;
	disabled: boolean;
	onClick: (p: Provider) => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={() => onClick(provider)}
			className="signin-btn flex items-center justify-center gap-3">
			<span aria-hidden="true" className="sidebar-icon">
				{icon}
			</span>
			{label}
		</button>
	);
}
