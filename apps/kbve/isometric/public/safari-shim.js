/* global GPURenderPassEncoder, GPUComputePassEncoder */
/**
 * safari-shim.js — Safari WebGPU compatibility fixes for wgpu 27.x + winit 0.30.x
 *
 * Must be loaded as a plain <script> (not type="module") BEFORE the WASM module.
 *
 * Bug 1 — setBindGroup cross-realm Uint32Array rejection (wgpu 27.x + Safari)
 * -----------------------------------------------------------------------
 * wgpu creates Uint32Array views from the WASM heap and passes them to
 * GPURenderPassEncoder/GPUComputePassEncoder.setBindGroup() as dynamicOffsetsData.
 * Safari's native setBindGroup does an instanceof Uint32Array check which fails
 * for cross-realm typed arrays (created inside the WASM module context).
 * This affects both SharedArrayBuffer-backed (release --shared-memory) and regular
 * ArrayBuffer-backed (debug) builds.
 * Fix: intercept setBindGroup and always copy any typed-array-like third argument
 * into a fresh local-realm Uint32Array before forwarding to the native method.
 *
 * Bug 2 — winit RefCell re-entrant borrow (winit 0.30.x + Safari)
 * -----------------------------------------------------------------------
 * Safari fires resize/orientationchange events synchronously inside
 * requestAnimationFrame callbacks, causing winit's web event-loop runner to
 * re-borrow an already-borrowed RefCell and panic.
 * Fix: on Safari only, defer resize/orientationchange listeners via setTimeout(0)
 * so they always arrive between frames, never re-entrantly.
 */
(function () {
	function patchSetBindGroup(proto) {
		if (!proto || typeof proto.setBindGroup !== 'function') return;
		var orig = proto.setBindGroup;
		proto.setBindGroup = function () {
			var args = arguments;
			var offsets = args[2];
			if (
				offsets &&
				typeof offsets.length === 'number' &&
				offsets.buffer
			) {
				// Copy into a fresh local-realm Uint32Array backed by a plain
				// ArrayBuffer. Covers cross-realm typed arrays AND same-realm
				// Uint32Arrays backed by SharedArrayBuffer (WASM shared memory).
				var start = args[3] !== undefined ? args[3] : 0;
				var len = args[4] !== undefined ? args[4] : offsets.length;
				var copy = new Uint32Array(len);
				for (var i = 0; i < len; i++) copy[i] = offsets[start + i];
				return orig.call(this, args[0], args[1], copy, 0, len);
			}
			// 2-arg form: setBindGroup(index, bindGroup) — no offsets.
			// Pass exactly the args we received to avoid Safari interpreting
			// trailing undefined values as the 5-arg overload.
			if (args.length <= 2) {
				return orig.call(this, args[0], args[1]);
			}
			return orig.call(this, args[0], args[1], offsets, args[3], args[4]);
		};
	}

	patchSetBindGroup(
		typeof GPURenderPassEncoder !== 'undefined'
			? GPURenderPassEncoder.prototype
			: null,
	);
	patchSetBindGroup(
		typeof GPUComputePassEncoder !== 'undefined'
			? GPUComputePassEncoder.prototype
			: null,
	);

	if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
		var origAEL = EventTarget.prototype.addEventListener;
		var DEFER = { resize: true, orientationchange: true };
		EventTarget.prototype.addEventListener = function (
			type,
			listener,
			options,
		) {
			if (DEFER[type] && typeof listener === 'function') {
				var deferred = function (evt) {
					setTimeout(function () {
						listener(evt);
					}, 0);
				};
				return origAEL.call(this, type, deferred, options);
			}
			return origAEL.call(this, type, listener, options);
		};
	}
})();
