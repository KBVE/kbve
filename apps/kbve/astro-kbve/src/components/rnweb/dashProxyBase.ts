export const DASH_PROXY_BASE: string =
	import.meta.env.PUBLIC_DASHBOARD_PROXY_BASE ??
	(import.meta.env.DEV ? '/__dashproxy' : '');
