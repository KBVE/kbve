// Real CSS gradients for the web SPA (the @kbve/rn banded Gradient is an RN
// fallback that looks stepped on web). Tasteful, on the gold/dark theme.
export const gradients = {
	// dark panel with a soft gold glow in the top-left corner
	hero: 'radial-gradient(130% 130% at 0% 0%, rgba(201,165,106,0.22), rgba(201,165,106,0) 55%), linear-gradient(135deg, #241d15 0%, #1b1814 55%, #161310 100%)',
	// subtler version for the clock / accent panels
	accent: 'radial-gradient(120% 120% at 100% 0%, rgba(201,165,106,0.18), rgba(201,165,106,0) 60%), linear-gradient(135deg, #211b14, #15120f)',
	// faint top-to-bottom wash for chart fills
	chart: 'linear-gradient(180deg, rgba(201,165,106,0.20) 0%, rgba(201,165,106,0.04) 60%, rgba(201,165,106,0) 100%)',
	// plain raised surface
	surface: 'linear-gradient(180deg, #1d1a15, #18150f)',
} as const;

export type GradientName = keyof typeof gradients;
