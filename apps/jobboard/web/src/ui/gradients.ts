// Jobboard web palette — soft/hard grey surfaces with pink/purple/blue accents
// (the @kbve/rn shared tokens are warm gold; this is a web-local reskin).
export const ui = {
	bg: '#181a20',
	surface: '#23262f',
	surfaceAlt: '#2c303b',
	surfaceSoft: '#1e2127',
	border: 'rgba(255,255,255,0.08)',
	text: '#e9eaf0',
	textMuted: '#a6acbb',
	textFaint: '#6b7080',
	purple: '#a78bfa',
	pink: '#e879f9',
	blue: '#60a5fa',
	green: '#34d399',
} as const;

// Real CSS gradients for the web SPA.
export const gradients = {
	// hero — pink/purple wash with a soft corner glow
	hero: 'radial-gradient(130% 130% at 100% 0%, rgba(232,121,249,0.30), rgba(232,121,249,0) 55%), linear-gradient(120deg, #7c5cf0 0%, #a855f7 45%, #d946ef 100%)',
	// accent — blue→purple for featured/time cards
	accent: 'radial-gradient(120% 120% at 0% 0%, rgba(96,165,250,0.28), rgba(96,165,250,0) 60%), linear-gradient(135deg, #4f46e5, #7c3aed)',
	// faint wash for chart fills
	chart: 'linear-gradient(180deg, rgba(167,139,250,0.22) 0%, rgba(167,139,250,0.04) 60%, rgba(167,139,250,0) 100%)',
	// plain raised surface
	surface: 'linear-gradient(180deg, #262932, #20232b)',
} as const;

export type GradientName = keyof typeof gradients;
