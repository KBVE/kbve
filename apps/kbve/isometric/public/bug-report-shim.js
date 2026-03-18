// Client telemetry — report WARN/ERROR to server
// Loaded as external script so it survives the Vite build pipeline.
(function () {
	var endpoint = '/api/v1/telemetry/report';
	var sid = Math.random().toString(36).slice(2, 10);
	var sent = 0;
	var MAX = 50; // max reports per page load
	var reporting = false; // guard against error cascade

	function report(level, message, stack) {
		if (sent >= MAX || reporting) return;
		var msg = String(message).slice(0, 512);
		// Don't report errors about telemetry itself (breaks the loop)
		if (msg.indexOf('telemetry') !== -1) return;
		reporting = true;
		sent++;
		try {
			navigator.sendBeacon(
				endpoint,
				JSON.stringify({
					level: level,
					message: msg,
					stack: stack ? String(stack).slice(0, 4096) : undefined,
					session_id: sid,
				}),
			);
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
