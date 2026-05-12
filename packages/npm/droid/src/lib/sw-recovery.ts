export interface SwRecoveryOptions {
	allowedScripts?: readonly string[];
	clearCaches?: boolean;
	reloadOnCleanup?: boolean;
	logPrefix?: string;
}

export interface SwRecoveryResult {
	supported: boolean;
	unregistered: string[];
	keptScripts: string[];
	cachesCleared: string[];
	reloaded: boolean;
}

const DEFAULT_OPTS: Required<Omit<SwRecoveryOptions, 'allowedScripts'>> & {
	allowedScripts: readonly string[];
} = {
	allowedScripts: [],
	clearCaches: true,
	reloadOnCleanup: false,
	logPrefix: '[sw-recovery]',
};

function getScriptURL(reg: ServiceWorkerRegistration): string | null {
	return (
		reg.active?.scriptURL ??
		reg.installing?.scriptURL ??
		reg.waiting?.scriptURL ??
		null
	);
}

function scriptIsAllowed(
	scriptURL: string | null,
	allowed: readonly string[],
): boolean {
	if (!scriptURL) return false;
	if (allowed.length === 0) return false;
	return allowed.some((rule) => {
		if (rule === scriptURL) return true;
		try {
			return new URL(scriptURL).pathname === rule;
		} catch {
			return false;
		}
	});
}

export async function swRecovery(
	opts: SwRecoveryOptions = {},
): Promise<SwRecoveryResult> {
	const cfg = { ...DEFAULT_OPTS, ...opts };
	const result: SwRecoveryResult = {
		supported: false,
		unregistered: [],
		keptScripts: [],
		cachesCleared: [],
		reloaded: false,
	};

	if (
		typeof navigator === 'undefined' ||
		!('serviceWorker' in navigator) ||
		typeof navigator.serviceWorker?.getRegistrations !== 'function'
	) {
		return result;
	}

	result.supported = true;

	let registrations: ServiceWorkerRegistration[] = [];
	try {
		registrations = await navigator.serviceWorker.getRegistrations();
	} catch (err) {
		console.warn(`${cfg.logPrefix} getRegistrations failed:`, err);
		return result;
	}

	for (const reg of registrations) {
		const scriptURL = getScriptURL(reg);
		if (scriptIsAllowed(scriptURL, cfg.allowedScripts)) {
			result.keptScripts.push(scriptURL as string);
			continue;
		}

		try {
			const ok = await reg.unregister();
			if (ok) {
				result.unregistered.push(scriptURL ?? '<unknown>');
			}
		} catch (err) {
			console.warn(
				`${cfg.logPrefix} unregister failed for ${scriptURL}:`,
				err,
			);
		}
	}

	if (cfg.clearCaches && typeof caches !== 'undefined') {
		try {
			const keys = await caches.keys();
			for (const key of keys) {
				try {
					const ok = await caches.delete(key);
					if (ok) result.cachesCleared.push(key);
				} catch (err) {
					console.warn(
						`${cfg.logPrefix} cache delete failed for ${key}:`,
						err,
					);
				}
			}
		} catch (err) {
			console.warn(`${cfg.logPrefix} caches.keys failed:`, err);
		}
	}

	const removedAnything =
		result.unregistered.length > 0 || result.cachesCleared.length > 0;

	if (removedAnything) {
		console.info(`${cfg.logPrefix} cleaned`, {
			unregistered: result.unregistered,
			kept: result.keptScripts,
			caches: result.cachesCleared,
		});
	}

	if (
		cfg.reloadOnCleanup &&
		removedAnything &&
		typeof window !== 'undefined' &&
		typeof window.location?.reload === 'function'
	) {
		result.reloaded = true;
		window.location.reload();
	}

	return result;
}
