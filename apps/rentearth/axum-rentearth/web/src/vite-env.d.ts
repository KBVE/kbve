/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly PUBLIC_ARPG_ORIGIN?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

interface ArpgEmbedApi {
	mountApp: (opts: { el: string | HTMLElement; assetBase?: string }) => void;
}

interface Window {
	ArpgEmbed?: ArpgEmbedApi;
}
