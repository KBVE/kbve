// A little game-dev mascot that covers its eyes while you type your password
// (the classic peek-a-boo). `peeking` = password field focused.

export function PeekMascot({ peeking }: { peeking: boolean }) {
	const ease = 'transition-transform duration-300 ease-out';
	return (
		<svg
			viewBox="0 0 140 130"
			className="h-24 w-24"
			role="img"
			aria-label={peeking ? 'Mascot covering its eyes' : 'Mascot'}>
			<defs>
				<linearGradient id="peek-body" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0%" stopColor="#c9a56a" />
					<stop offset="100%" stopColor="#7c4dff" />
				</linearGradient>
			</defs>

			{/* antenna */}
			<line x1="70" y1="20" x2="70" y2="6" stroke="#c9a56a" strokeWidth="3" strokeLinecap="round" />
			<circle cx="70" cy="5" r="4" fill="#fbbf24" />

			{/* body */}
			<rect x="26" y="20" width="88" height="84" rx="30" fill="url(#peek-body)" />
			<rect x="26" y="20" width="88" height="84" rx="30" fill="#000" opacity="0.08" />

			{/* eyes — open (fade out while peeking) */}
			<g style={{ transition: 'opacity 200ms' }} opacity={peeking ? 0 : 1}>
				<circle cx="55" cy="58" r="9" fill="#1b1814" />
				<circle cx="85" cy="58" r="9" fill="#1b1814" />
				<circle cx="58" cy="55" r="3" fill="#f5ecd8" />
				<circle cx="88" cy="55" r="3" fill="#f5ecd8" />
			</g>
			{/* eyes — closed (fade in while peeking) */}
			<g
				style={{ transition: 'opacity 200ms' }}
				opacity={peeking ? 1 : 0}
				stroke="#1b1814"
				strokeWidth="3"
				strokeLinecap="round"
				fill="none">
				<path d="M47 60 q8 7 16 0" />
				<path d="M77 60 q8 7 16 0" />
			</g>

			{/* smile */}
			<path d="M58 80 q12 10 24 0" stroke="#1b1814" strokeWidth="3" strokeLinecap="round" fill="none" />

			{/* paws — rise to cover the eyes while peeking */}
			<g
				className={ease}
				style={{ transform: peeking ? 'translateY(-30px)' : 'translateY(0)' }}>
				<circle cx="50" cy="104" r="13" fill="#a67d43" />
				<circle cx="90" cy="104" r="13" fill="#a67d43" />
			</g>
		</svg>
	);
}
