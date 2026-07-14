// Gothic UI chrome as inline SVG. Kept as data-URI backgrounds (not external
// files) so they resolve under the Discord Activity asset proxy, which only
// remaps the game-art base prefix — a CSS url('/assets/…') would break in-embed.
// Sources are the gothic-ui-svg-kit panels, verbatim.

export const PANEL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" preserveAspectRatio="none">
  <defs>
    <linearGradient id="frame" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#71634d"/><stop offset=".18" stop-color="#2a251f"/>
      <stop offset=".55" stop-color="#121211"/><stop offset="1" stop-color="#655744"/>
    </linearGradient>
    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#282521"/><stop offset="1" stop-color="#151413"/>
    </linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/>
      <feColorMatrix in="n" type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 .12"/></feComponentTransfer>
      <feBlend in="SourceGraphic" mode="overlay"/></filter>
  </defs>
  <rect width="640" height="400" rx="8" fill="#090909"/>
  <rect x="4" y="4" width="632" height="392" rx="7" fill="none" stroke="#171513" stroke-width="8"/>
  <rect x="10" y="10" width="620" height="380" rx="6" fill="url(#frame)" stroke="#9a835c" stroke-width="2"/>
  <rect x="18" y="18" width="604" height="364" rx="4" fill="url(#fill)" stroke="#0a0908" stroke-width="6" filter="url(#grain)"/>
  <rect x="23" y="23" width="594" height="354" rx="3" fill="none" stroke="#5f513c" stroke-width="2"/>
  <path d="M18 70h18V32h38M622 70h-18V32h-38M18 330h18v38h38M622 330h-18v38h-38" fill="none" stroke="#8b7550" stroke-width="4"/>
  <path d="M24 24l18 18-18 18M616 24l-18 18 18 18M24 376l18-18-18-18M616 376l-18-18 18-18" fill="none" stroke="#3b3024" stroke-width="3"/>
</svg>`;

export const SLOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <defs><radialGradient id="s" cx=".5" cy=".35" r=".8">
    <stop offset="0" stop-color="#24211d"/><stop offset="1" stop-color="#0c0c0b"/></radialGradient></defs>
  <rect x="2" y="2" width="92" height="92" rx="4" fill="#080808" stroke="#1a1713" stroke-width="4"/>
  <rect x="8" y="8" width="80" height="80" rx="2" fill="url(#s)" stroke="#9a8054" stroke-width="3"/>
  <rect x="14" y="14" width="68" height="68" rx="1" fill="none" stroke="#2d261c" stroke-width="3"/>
  <path d="M10 24h10V10M86 24H76V10M10 72h10v14M86 72H76v14" fill="none" stroke="#5d4b32" stroke-width="2"/>
</svg>`;

export const TITLEBAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 72" preserveAspectRatio="none">
  <defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8a8068"/><stop offset=".5" stop-color="#625c4d"/><stop offset="1" stop-color="#38352e"/></linearGradient></defs>
  <rect x="2" y="2" width="636" height="68" rx="4" fill="#090909" stroke="#15120f" stroke-width="4"/>
  <rect x="8" y="8" width="624" height="56" rx="3" fill="url(#p)" stroke="#827251" stroke-width="2"/>
  <rect x="15" y="15" width="610" height="42" rx="2" fill="none" stroke="#28231d" stroke-width="3"/>
  <path d="M22 36l12-12 12 12-12 12zM594 36l12-12 12 12-12 12z" fill="#171511" stroke="#9a835b" stroke-width="2"/>
</svg>`;

export const BUTTON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 72" preserveAspectRatio="none">
  <defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#35302a"/><stop offset=".48" stop-color="#191817"/><stop offset="1" stop-color="#0d0d0c"/></linearGradient>
    <filter id="rough"><feTurbulence baseFrequency=".8" numOctaves="2" seed="8" result="t"/>
      <feComponentTransfer in="t"><feFuncA type="table" tableValues="0 .08"/></feComponentTransfer>
      <feBlend in="SourceGraphic" mode="screen"/></filter></defs>
  <rect x="2" y="2" width="236" height="68" rx="4" fill="#080808" stroke="#0b0a09" stroke-width="4"/>
  <rect x="7" y="7" width="226" height="58" rx="3" fill="url(#b)" stroke="#8a7654" stroke-width="2" filter="url(#rough)"/>
  <rect x="13" y="13" width="214" height="46" rx="2" fill="none" stroke="#31291f" stroke-width="3"/>
  <path d="M10 22h13V10M230 22h-13V10M10 50h13v12M230 50h-13v12" fill="none" stroke="#b09768" stroke-width="2"/>
</svg>`;

export const STRIP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 64" preserveAspectRatio="none">
  <defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#443a2e"/><stop offset=".5" stop-color="#171513"/><stop offset="1" stop-color="#090909"/></linearGradient></defs>
  <path d="M8 8h250l18 10h88l18-10h250v48H382l-18-10h-88l-18 10H8z" fill="#080808" stroke="#17130f" stroke-width="5"/>
  <path d="M14 13h242l20 10h88l20-10h242v38H384l-20-10h-88l-20 10H14z" fill="url(#m)" stroke="#8b7049" stroke-width="2"/>
  <path d="M300 32l20-20 20 20-20 20z" fill="#201b16" stroke="#a18655" stroke-width="3"/>
  <path d="M310 32l10-10 10 10-10 10z" fill="#781814" stroke="#3a0807" stroke-width="2"/>
  <path d="M26 32h220M394 32h220" stroke="#4a3b29" stroke-width="2"/>
</svg>`;

export const TOOLTIP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 240" preserveAspectRatio="none">
  <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#201d19"/><stop offset="1" stop-color="#0d0c0b"/></linearGradient></defs>
  <rect x="2" y="2" width="416" height="236" rx="10" fill="#060606" stroke="#0a0908" stroke-width="4"/>
  <rect x="8" y="8" width="404" height="224" rx="8" fill="url(#fill)" stroke="#8d7550" stroke-width="3"/>
  <rect x="15" y="15" width="390" height="210" rx="6" fill="none" stroke="#33281d" stroke-width="3"/>
  <path d="M10 42h18V16M410 42h-18V16M10 198h18v26M410 198h-18v26" fill="none" stroke="#b49a69" stroke-width="3"/>
  <path d="M24 24l12 12-12 12M396 24l-12 12 12 12M24 216l12-12-12-12M396 216l-12-12 12-12" fill="none" stroke="#5a4731" stroke-width="3"/>
</svg>`;

export const PARCHMENT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 300" preserveAspectRatio="none">
  <defs><linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#978b70"/><stop offset=".45" stop-color="#756b57"/><stop offset="1" stop-color="#4c463a"/></linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".35" numOctaves="3" seed="9"/>
      <feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .14"/></feComponentTransfer>
      <feBlend in="SourceGraphic" mode="multiply"/></filter></defs>
  <path d="M18 8h484l10 14-8 20 8 20-8 20 8 20-8 20 8 20-8 20 8 20-8 20 8 20-10 20H18L8 278l8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20z" fill="#191613" stroke="#090807" stroke-width="6"/>
  <path d="M24 16h472l8 12-7 18 7 18-7 18 7 18-7 18 7 18-7 18 7 18-7 18 7 18-8 18H24l-8-18 7-18-7-18 7-18-7-18 7-18-7-18 7-18-7-18 7-18-7-18z" fill="url(#paper)" stroke="#9b8358" stroke-width="3" filter="url(#grain)"/>
  <rect x="32" y="28" width="456" height="244" fill="none" stroke="#403629" stroke-width="3"/>
</svg>`;

export const CLOSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3c3328"/><stop offset="1" stop-color="#11100f"/></linearGradient></defs>
  <rect x="3" y="3" width="66" height="66" rx="5" fill="#090909" stroke="#080706" stroke-width="5"/>
  <rect x="9" y="9" width="54" height="54" rx="3" fill="url(#bg)" stroke="#8d7651" stroke-width="3"/>
  <path d="M22 22l28 28M50 22L22 50" stroke="#c7b387" stroke-width="8" stroke-linecap="square"/>
  <path d="M22 20l30 30" stroke="#3b1713" stroke-width="3"/>
</svg>`;

// Orb bezel ring (from the expansion orb-frame, baked red sphere + highlight
// removed). Drawn as an annulus with a transparent center so the existing
// StatOrb fluid shows through — the orbs stay, this only frames them. The clear
// hole is ~r61 of the 180 viewbox, so place an orb sized ~0.68× the ring.
export const ORB_FRAME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <defs><linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#aa8c5c"/><stop offset=".5" stop-color="#2f281f"/><stop offset="1" stop-color="#846c48"/></linearGradient></defs>
  <circle cx="90" cy="90" r="79" fill="none" stroke="#070707" stroke-width="10"/>
  <circle cx="90" cy="90" r="70" fill="none" stroke="url(#rim)" stroke-width="10"/>
  <circle cx="90" cy="90" r="63" fill="none" stroke="#b2925d" stroke-width="2"/>
  <path d="M18 90l18-14 8 14-8 14zM162 90l-18-14-8 14 8 14z" fill="#2b241c" stroke="#9a7e53" stroke-width="3"/>
</svg>`;

/** Clear-hole fraction of the orb-frame ring (place orbs at ring*RATIO). */
export const ORB_FRAME_HOLE = 0.68;

/** SVG string → CSS background-image data URI. Single-quoted: the inner SVG uses
 *  only double quotes (escaped by encodeURIComponent), and some renderers choke
 *  on a double-quoted data-URI wrapper. */
export function svgBg(svg: string): string {
	return `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;
}

export const GOTHIC = {
	gold: '#c7a866',
	goldSoft: '#b09768',
	text: '#e0cf9a',
	textMuted: '#9c8f72',
	ground: '#171615',
	groundEdge: '#090909',
	shadow: '#050505',
} as const;
