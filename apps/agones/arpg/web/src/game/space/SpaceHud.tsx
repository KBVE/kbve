import {
	useEffect,
	useRef,
	type CSSProperties,
	type ReactElement,
	type ReactNode,
} from 'react';

/**
 * Shared sci-fi cockpit overlay for the 3D space modes (free roam + rail mission).
 * Draws a corner frame, a fixed boresight crosshair, and a reticle that tracks the
 * mouse (the aim cursor the ship steers toward). Scenes drop their own readouts into
 * the topLeft / topRight / centerStatus / hint slots. Pure visual — pointerEvents off.
 */
const TONE = '#7fe9ff';
const GLOW = '0 0 6px rgba(127,233,255,0.55)';
const DIM = 'rgba(127,233,255,0.55)';

export function SpaceHud({
	topLeft,
	topRight,
	centerStatus,
	hint,
}: {
	topLeft?: ReactNode;
	topRight?: ReactNode;
	centerStatus?: ReactNode;
	hint?: string;
}): ReactElement {
	const reticle = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const move = (e: MouseEvent) => {
			const r = reticle.current;
			if (r)
				r.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
		};
		window.addEventListener('mousemove', move);
		return () => window.removeEventListener('mousemove', move);
	}, []);

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				pointerEvents: 'none',
				fontFamily: 'monospace',
				color: TONE,
			}}>
			<CornerFrame />
			<Boresight />
			<div
				ref={reticle}
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					width: 48,
					height: 48,
					marginLeft: -24,
					marginTop: -24,
				}}>
				<Reticle />
			</div>

			{topLeft && (
				<div
					style={{
						position: 'absolute',
						top: 16,
						left: 18,
						...readout,
					}}>
					{topLeft}
				</div>
			)}
			{topRight && (
				<div
					style={{
						position: 'absolute',
						top: 16,
						right: 18,
						textAlign: 'right',
						...readout,
					}}>
					{topRight}
				</div>
			)}

			{centerStatus && (
				<div
					style={{
						position: 'absolute',
						inset: 0,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						textAlign: 'center',
					}}>
					{centerStatus}
				</div>
			)}

			{hint && (
				<div
					style={{
						position: 'absolute',
						bottom: 16,
						left: 0,
						right: 0,
						textAlign: 'center',
						fontSize: 12,
						color: DIM,
						textShadow: GLOW,
					}}>
					{hint}
				</div>
			)}
		</div>
	);
}

const readout: CSSProperties = {
	fontSize: 12,
	letterSpacing: 1,
	textShadow: GLOW,
};

/** Bracketed corner frame around the viewport. */
function CornerFrame(): ReactElement {
	const arm = 26;
	const pos: CSSProperties[] = [
		{
			top: 10,
			left: 10,
			borderTop: `2px solid ${DIM}`,
			borderLeft: `2px solid ${DIM}`,
		},
		{
			top: 10,
			right: 10,
			borderTop: `2px solid ${DIM}`,
			borderRight: `2px solid ${DIM}`,
		},
		{
			bottom: 10,
			left: 10,
			borderBottom: `2px solid ${DIM}`,
			borderLeft: `2px solid ${DIM}`,
		},
		{
			bottom: 10,
			right: 10,
			borderBottom: `2px solid ${DIM}`,
			borderRight: `2px solid ${DIM}`,
		},
	];
	return (
		<>
			{pos.map((p, i) => (
				<div
					key={i}
					style={{
						position: 'absolute',
						width: arm,
						height: arm,
						...p,
					}}
				/>
			))}
		</>
	);
}

/** Fixed boresight at screen center — where the nose points. */
function Boresight(): ReactElement {
	const line: CSSProperties = {
		position: 'absolute',
		background: DIM,
		boxShadow: GLOW,
	};
	return (
		<div
			style={{
				position: 'absolute',
				top: '50%',
				left: '50%',
				transform: 'translate(-50%, -50%)',
				width: 40,
				height: 40,
			}}>
			<div
				style={{ ...line, left: 0, top: '50%', width: 12, height: 1.5 }}
			/>
			<div
				style={{
					...line,
					right: 0,
					top: '50%',
					width: 12,
					height: 1.5,
				}}
			/>
			<div
				style={{ ...line, top: 0, left: '50%', height: 12, width: 1.5 }}
			/>
			<div
				style={{
					...line,
					bottom: 0,
					left: '50%',
					height: 12,
					width: 1.5,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					top: '50%',
					left: '50%',
					transform: 'translate(-50%, -50%)',
					width: 3,
					height: 3,
					borderRadius: '50%',
					background: TONE,
					boxShadow: GLOW,
				}}
			/>
		</div>
	);
}

/** The mouse-tracking aim reticle: a ring with tick marks. */
function Reticle(): ReactElement {
	const tick: CSSProperties = {
		position: 'absolute',
		background: TONE,
		boxShadow: GLOW,
	};
	return (
		<div style={{ position: 'relative', width: 48, height: 48 }}>
			<div
				style={{
					position: 'absolute',
					inset: 6,
					border: `1.5px solid ${TONE}`,
					borderRadius: '50%',
					boxShadow: GLOW,
				}}
			/>
			<div
				style={{
					...tick,
					top: 0,
					left: '50%',
					marginLeft: -0.75,
					width: 1.5,
					height: 8,
				}}
			/>
			<div
				style={{
					...tick,
					bottom: 0,
					left: '50%',
					marginLeft: -0.75,
					width: 1.5,
					height: 8,
				}}
			/>
			<div
				style={{
					...tick,
					left: 0,
					top: '50%',
					marginTop: -0.75,
					height: 1.5,
					width: 8,
				}}
			/>
			<div
				style={{
					...tick,
					right: 0,
					top: '50%',
					marginTop: -0.75,
					height: 1.5,
					width: 8,
				}}
			/>
		</div>
	);
}

/** A labelled meter bar (HULL / RAIL / etc) for the readout slots. */
export function HudBar({
	label,
	value,
	warn,
}: {
	label: string;
	value: number;
	warn?: boolean;
}): ReactElement {
	return (
		<div style={{ minWidth: 140, marginBottom: 6 }}>
			<div style={{ fontSize: 11, letterSpacing: 1, marginBottom: 3 }}>
				{label}
			</div>
			<div
				style={{
					height: 7,
					background: 'rgba(127,233,255,0.14)',
					border: `1px solid ${DIM}`,
					borderRadius: 3,
					overflow: 'hidden',
				}}>
				<div
					style={{
						height: '100%',
						width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`,
						background: warn ? '#ff6b5e' : TONE,
						boxShadow: warn ? '0 0 6px rgba(255,107,94,0.6)' : GLOW,
						transition: 'width 120ms linear',
					}}
				/>
			</div>
		</div>
	);
}

/** Big center status line (mission result). */
export function HudStatus({
	title,
	sub,
	danger,
}: {
	title: string;
	sub?: string;
	danger?: boolean;
}): ReactElement {
	return (
		<>
			<div
				style={{
					fontSize: 34,
					fontWeight: 700,
					letterSpacing: 3,
					color: danger ? '#ff6b5e' : TONE,
					textShadow: danger ? '0 0 12px rgba(255,107,94,0.6)' : GLOW,
				}}>
				{title}
			</div>
			{sub && (
				<div
					style={{
						fontSize: 13,
						marginTop: 10,
						color: DIM,
						textShadow: GLOW,
					}}>
					{sub}
				</div>
			)}
		</>
	);
}
