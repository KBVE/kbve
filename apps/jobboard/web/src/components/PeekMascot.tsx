// A friendly arcade ghost that covers its eyes while you type your password
// (peek-a-boo). `peeking` = password field focused. Gamey, not robotey.

export function PeekMascot({ peeking }: { peeking: boolean }) {
	const hand = 'transition-transform duration-300 ease-out';
	const eyes = { transition: 'opacity 180ms ease' };
	return (
		<svg
			viewBox="0 0 140 140"
			className="h-24 w-24"
			role="img"
			aria-label={peeking ? 'Ghost covering its eyes' : 'Ghost mascot'}>
			<defs>
				<linearGradient id="ghost-body" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#ab98f7" />
					<stop offset="100%" stopColor="#6a35eb" />
				</linearGradient>
			</defs>

			{/* floating shadow (stays put while the ghost bobs) */}
			<ellipse cx="70" cy="132" rx="26" ry="5" fill="#000" opacity="0.25" />

			<g className="animate-float">
				{/* ghost body — domed top, scalloped bottom */}
				<path
					d="M28 70
						C28 42 47 24 70 24
						C93 24 112 42 112 70
						L112 104
						q-11 12 -22 0
						q-11 -12 -22 0
						q-11 12 -22 0
						q-11 -12 -22 0
						Z"
					fill="url(#ghost-body)"
				/>
				{/* glossy highlight */}
				<path
					d="M44 44 C52 33 70 31 78 34 C66 34 54 42 50 56 C47 52 45 48 44 44 Z"
					fill="#fff"
					opacity="0.18"
				/>

				{/* blush */}
				<ellipse cx="48" cy="74" rx="6" ry="4" fill="#fb7185" opacity="0.45" />
				<ellipse cx="92" cy="74" rx="6" ry="4" fill="#fb7185" opacity="0.45" />

				{/* eyes — open */}
				<g style={eyes} opacity={peeking ? 0 : 1}>
					<ellipse cx="57" cy="62" rx="5.5" ry="7.5" fill="#1b1814" />
					<ellipse cx="83" cy="62" rx="5.5" ry="7.5" fill="#1b1814" />
					<circle cx="59" cy="59" r="2" fill="#f5ecd8" />
					<circle cx="85" cy="59" r="2" fill="#f5ecd8" />
				</g>
				{/* eyes — closed (shown while peeking) */}
				<g
					style={eyes}
					opacity={peeking ? 1 : 0}
					stroke="#1b1814"
					strokeWidth="3"
					strokeLinecap="round"
					fill="none">
					<path d="M50 63 q7 6 14 0" />
					<path d="M76 63 q7 6 14 0" />
				</g>

				{/* mouth */}
				<ellipse cx="70" cy="80" rx="4" ry="5" fill="#1b1814" opacity="0.85" />

				{/* hands — rise up and inward to cover the eyes while peeking */}
				<g
					className={hand}
					style={{
						transform: peeking ? 'translate(16px, -26px)' : 'none',
					}}>
					<circle cx="34" cy="92" r="11" fill="#5827c4" />
					<circle cx="31" cy="89" r="3.5" fill="#ab98f7" opacity="0.6" />
				</g>
				<g
					className={hand}
					style={{
						transform: peeking ? 'translate(-16px, -26px)' : 'none',
					}}>
					<circle cx="106" cy="92" r="11" fill="#5827c4" />
					<circle cx="103" cy="89" r="3.5" fill="#ab98f7" opacity="0.6" />
				</g>
			</g>
		</svg>
	);
}
