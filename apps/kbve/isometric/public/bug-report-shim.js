// Client telemetry — report WARN/ERROR to server
// Loaded as external script so it survives the Vite build pipeline.
(function () {
	var ENDPOINT = '/api/v1/telemetry/report';
	var ALLOWED_LEVELS = { warn: 1, error: 1 };
	var sid = Math.random().toString(36).slice(2, 10);
	var sent = 0;
	var MAX = 50;
	var reporting = false;

	/** Sanitize a string: coerce to string, strip control chars, truncate. */
	function sanitize(val, maxLen) {
		if (val == null) return '';
		var s = typeof val === 'string' ? val : String(val);
		// Strip control characters (except newline/tab for stack traces)
		// eslint-disable-next-line no-control-regex
		s = s.replace(/[^\u0009\u000A\u0020-\u007E\u00A0-\uFFFF]/g, '');
		return s.slice(0, maxLen);
	}

	function report(level, message, stack) {
		if (sent >= MAX || reporting) return;
		// Validate level
		var safeLevel = ALLOWED_LEVELS[level] ? level : 'error';
		var msg = sanitize(message, 512);
		// Don't report errors about telemetry itself (breaks the loop)
		if (msg.indexOf('telemetry') !== -1) return;
		reporting = true;
		sent++;
		try {
			var payload = JSON.stringify({
				level: safeLevel,
				message: msg,
				stack: stack ? sanitize(stack, 4096) : undefined,
				session_id: sid,
			});
			navigator.sendBeacon(ENDPOINT, payload);
		} catch (e) {
			/* telemetry must never throw */
		}
		reporting = false;
	}

	window.addEventListener('error', function (e) {
		report('error', e.message || 'unknown error', e.error && e.error.stack);
	});

	window.addEventListener('unhandledrejection', function (e) {
		var r = e.reason;
		report('error', r && r.message ? r.message : String(r), r && r.stack);
	});

	// Expose for WASM to call: window.__telemetry('warn', 'msg', 'stack')
	window.__telemetry = report;
})();
