import { useState } from 'react';
import { useProgress } from '@react-three/drei';
import { setScreen } from './store';

function MenuButton({
	label,
	onClick,
	disabled,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
}) {
	const [hover, setHover] = useState(false);
	const on = hover && !disabled;
	return (
		<button
			disabled={disabled}
			onClick={onClick}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				width: 220,
				padding: '11px 0',
				background: on ? '#7ab6ff22' : '#ffffff10',
				border: `1px solid ${on ? '#7ab6ff' : '#ffffff28'}`,
				color: on ? '#dcecff' : '#fff',
				borderRadius: 6,
				cursor: disabled ? 'default' : 'pointer',
				font: 'inherit',
				letterSpacing: 2,
				opacity: disabled ? 0.5 : 1,
				transform: on ? 'translateY(-1px)' : 'none',
				boxShadow: on ? '0 4px 16px #7ab6ff33' : 'none',
				transition: 'all 0.12s ease',
			}}>
			{label}
		</button>
	);
}

const wrap: React.CSSProperties = {
	position: 'fixed',
	inset: 0,
	background:
		'radial-gradient(circle at 50% 40%, #14141caa, #06060899), rgba(6,6,10,0.35)',
	backdropFilter: 'blur(2px)',
	color: '#e8e8ee',
	font: '14px/1.5 ui-monospace, monospace',
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	justifyContent: 'center',
	gap: 10,
	zIndex: 50,
};

export function MainMenu() {
	const { progress, active } = useProgress();
	const ready = progress >= 100 || (!active && progress === 0);

	return (
		<div style={wrap}>
			<div
				style={{
					fontSize: 40,
					letterSpacing: 8,
					marginBottom: 24,
					textShadow: '0 0 24px #7ab6ff55',
				}}>
				HERBMAIL
			</div>

			<MenuButton
				label={ready ? 'Play' : `Loading ${Math.round(progress)}%`}
				disabled={!ready}
				onClick={() => setScreen('playing')}
			/>
			<MenuButton label="Codex" onClick={() => setScreen('codex')} />
			<MenuButton
				label="Settings"
				onClick={() => setScreen('settings')}
			/>

			{!ready && (
				<div
					style={{
						width: 220,
						height: 3,
						marginTop: 16,
						background: '#ffffff18',
						borderRadius: 2,
						overflow: 'hidden',
					}}>
					<div
						style={{
							width: `${progress}%`,
							height: '100%',
							background: '#7ab6ff',
							transition: 'width 0.2s',
						}}
					/>
				</div>
			)}
		</div>
	);
}
